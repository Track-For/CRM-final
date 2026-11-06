"use server"

import { randomBytes } from "node:crypto"
import { revalidatePath } from "next/cache"
import { and, eq, isNull, or, sql } from "drizzle-orm"
import { z } from "zod"
import { billingSettings, boletos, db } from "@/lib/db"
import type { BillingSettings, BoletoRow } from "@/lib/db"
import type { ActionState } from "@/lib/auth/actions"
import { getCurrentUser, type CurrentUser } from "@/lib/auth/session"
import { decryptSecret, encryptSecret } from "@/lib/fiscal/crypto"
import { ensureAsaasCustomer, enableChargeNotification } from "@/lib/boleto/customer"
import { AsaasError, createAsaasClient, mapAsaasStatus, type AsaasClient, type AsaasPayment } from "@/lib/boleto/asaas"
import { mergeRecord, readRecord } from "@/lib/boleto/records"
import {
  BILLING_SETTINGS_ID,
  applyPaymentSnapshot,
  chargeFieldsFromRow,
  entryFieldsFromRow,
  loadBillingSettings,
  rowPatchFromPayment,
  todayInBrazil,
} from "@/lib/boleto/sync"
import type { Charge, FinancialEntry } from "@/types"

// ---------------------------------------------------------------------------
// Tipos públicos
// ---------------------------------------------------------------------------

export type BillingSettingsView = {
  connected: boolean
  environment: "sandbox" | "producao"
  apiKeyLast4: string | null
  finePercent: number
  interestPercent: number
  webhookUrl: string
  webhookToken: string | null
  updatedAt: string | null
}

export type BoletoPayer = {
  name: string
  cpfCnpj: string
  email?: string
  phone?: string
  cep?: string
  street?: string
  number?: string
  complement?: string
  district?: string
}

export type BoletoResult = { ok: boolean; error?: string; charge?: Charge }

// ---------------------------------------------------------------------------
// Utilitários
// ---------------------------------------------------------------------------

const NO_PERMISSION = "Sem permissão"
const NOT_CONNECTED = "Conecte o Asaas em Integrações antes de emitir boletos."
const BILLING_ROLES = new Set<CurrentUser["role"]>(["admin", "financeiro"])
const KEY_PREFIX = { sandbox: "$aact_hmlg_", producao: "$aact_prod_" } as const
const ENV_LABEL = { sandbox: "sandbox", producao: "produção" } as const
/** Soma dos timeouts de uma emissão (consulta, cliente, criação e margem): depois disso a tentativa é dada como morta. */
const ISSUE_LEASE_SECONDS = 150

async function requireBillingUser(): Promise<CurrentUser | null> {
  const user = await getCurrentUser()
  return user && BILLING_ROLES.has(user.role) ? user : null
}

function errorMessage(err: unknown): string {
  return err instanceof AsaasError ? err.message : "Erro inesperado ao falar com o Asaas."
}

/** Log no servidor sem dados sensíveis: a chave nunca passa por aqui. */
function logError(context: string, err: unknown) {
  console.error(`[boleto] ${context}:`, err instanceof Error ? err.message : err)
}

function onlyDigits(v: string): string {
  return v.replace(/\D/g, "")
}

function revalidateBilling() {
  revalidatePath("/integracoes")
  revalidatePath("/integracoes/asaas")
}

function readApiKey(settings: BillingSettings): string | null {
  if (!settings.apiKeyEncrypted) return null
  try {
    return decryptSecret(settings.apiKeyEncrypted)
  } catch (err) {
    logError("falha ao descriptografar a chave", err)
    throw new AsaasError("Não foi possível ler a chave salva. Cole a chave do Asaas de novo em Integrações.")
  }
}

function webhookUrl(): string {
  const configured = process.env.NEXT_PUBLIC_APP_URL?.trim().replace(/\/+$/, "")
  if (configured) return `${configured}/api/webhooks/asaas`
  const vercel = process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim()
  return vercel ? `https://${vercel}/api/webhooks/asaas` : ""
}

function newWebhookToken(): string {
  return randomBytes(32).toString("base64url")
}

// ---------------------------------------------------------------------------
// Configuração
// ---------------------------------------------------------------------------

export async function getBillingSettings(): Promise<BillingSettingsView> {
  const user = await requireBillingUser()
  if (!user) {
    return { connected: false, environment: "sandbox", apiKeyLast4: null, finePercent: 0, interestPercent: 0, webhookUrl: webhookUrl(), webhookToken: null, updatedAt: null }
  }
  const settings = await loadBillingSettings()
  let apiKeyLast4: string | null = null
  let webhookToken: string | null = null
  try {
    apiKeyLast4 = settings.apiKeyEncrypted ? decryptSecret(settings.apiKeyEncrypted).slice(-4) : null
    webhookToken = settings.webhookTokenEncrypted ? decryptSecret(settings.webhookTokenEncrypted) : null
  } catch (err) {
    logError("falha ao descriptografar a configuração", err)
  }
  return {
    connected: Boolean(settings.apiKeyEncrypted),
    environment: settings.environment === "producao" ? "producao" : "sandbox",
    apiKeyLast4,
    finePercent: Number(settings.finePercent),
    interestPercent: Number(settings.interestPercent),
    webhookUrl: webhookUrl(),
    webhookToken,
    updatedAt: settings.updatedAt?.toISOString() ?? null,
  }
}

const percentField = (label: string) =>
  z
    .string()
    .trim()
    .transform((v) => Number((v || "0").replace(",", ".")))
    .pipe(z.number({ error: `${label} inválidos` }).min(0, `${label} não podem ser negativos`).max(100, `${label} acima de 100%`))

const settingsSchema = z.object({
  apiKey: z.string().trim().max(500, "Chave muito longa").optional().default(""),
  environment: z.enum(["sandbox", "producao"], { error: "Escolha o ambiente" }),
  finePercent: percentField("Multa e juros"),
  interestPercent: percentField("Multa e juros"),
})

export async function saveBillingSettingsAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireBillingUser()
  if (!user) return { error: NO_PERMISSION }

  const field = (name: string) => {
    const v = formData.get(name)
    return typeof v === "string" ? v : ""
  }
  const parsed = settingsSchema.safeParse({
    apiKey: field("apiKey"),
    environment: field("environment"),
    finePercent: field("finePercent"),
    interestPercent: field("interestPercent"),
  })
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Dados inválidos" }
  const { apiKey, environment, finePercent, interestPercent } = parsed.data

  try {
    const current = await loadBillingSettings()
    // Vale também para a chave que já está salva, quando só o ambiente muda.
    const effectiveKey = apiKey || readApiKey(current)
    const wrongPrefix = environment === "sandbox" ? KEY_PREFIX.producao : KEY_PREFIX.sandbox
    if (effectiveKey?.startsWith(wrongPrefix)) {
      const keyEnv = environment === "sandbox" ? "produção" : "sandbox"
      return { error: `Esta chave é de ${keyEnv}, mas o ambiente escolhido é ${ENV_LABEL[environment]}. Use uma chave de ${ENV_LABEL[environment]} ou troque o ambiente.` }
    }

    const values = {
      environment,
      finePercent: finePercent.toFixed(2),
      interestPercent: interestPercent.toFixed(2),
      updatedAt: new Date(),
      updatedBy: user.id,
      ...(apiKey ? { apiKeyEncrypted: encryptSecret(apiKey) } : {}),
      ...(current.webhookTokenEncrypted ? {} : { webhookTokenEncrypted: encryptSecret(newWebhookToken()) }),
    }
    await db.update(billingSettings).set(values).where(eq(billingSettings.id, BILLING_SETTINGS_ID))
  } catch (err) {
    logError("falha ao salvar a configuração", err)
    return { error: err instanceof AsaasError ? err.message : "Não foi possível salvar. Verifique a configuração APP_ENCRYPTION_KEY do servidor e tente novamente." }
  }

  revalidateBilling()
  return { ok: true, message: apiKey ? "Configuração salva e chave atualizada." : "Configuração salva." }
}

export async function testBillingConnectionAction(): Promise<ActionState> {
  const user = await requireBillingUser()
  if (!user) return { error: NO_PERMISSION }
  try {
    const settings = await loadBillingSettings()
    const apiKey = readApiKey(settings)
    if (!apiKey) return { error: NOT_CONNECTED }
    await createAsaasClient(apiKey, settings.environment).ping()
    return { ok: true, message: `Conexão com o Asaas funcionando (${ENV_LABEL[settings.environment]}).` }
  } catch (err) {
    logError("teste de conexão", err)
    return { error: errorMessage(err) }
  }
}

export async function disconnectBillingAction(): Promise<ActionState> {
  const user = await requireBillingUser()
  if (!user) return { error: NO_PERMISSION }
  await loadBillingSettings()
  await db
    .update(billingSettings)
    .set({ apiKeyEncrypted: null, updatedAt: new Date(), updatedBy: user.id })
    .where(eq(billingSettings.id, BILLING_SETTINGS_ID))
  revalidateBilling()
  return { ok: true, message: "Asaas desconectado. A chave foi apagada." }
}

export async function regenerateWebhookTokenAction(): Promise<ActionState> {
  const user = await requireBillingUser()
  if (!user) return { error: NO_PERMISSION }
  await loadBillingSettings()
  await db
    .update(billingSettings)
    .set({ webhookTokenEncrypted: encryptSecret(newWebhookToken()), updatedAt: new Date(), updatedBy: user.id })
    .where(eq(billingSettings.id, BILLING_SETTINGS_ID))
  revalidateBilling()
  return { ok: true, message: "Token regenerado. Atualize o webhook no painel do Asaas: o token antigo deixou de valer." }
}

// ---------------------------------------------------------------------------
// Emissão
// ---------------------------------------------------------------------------

const optionalText = (maxLen: number) =>
  z
    .string()
    .trim()
    .max(maxLen)
    .optional()
    .nullable()
    .transform((v) => v || undefined)

const optionalDigits = z
  .string()
  .optional()
  .nullable()
  .transform((v) => (v ? onlyDigits(v) || undefined : undefined))

const payerSchema = z.object({
  name: z.string({ error: "Informe o nome do pagador" }).trim().min(2, "Informe o nome do pagador").max(150, "Nome do pagador muito longo"),
  cpfCnpj: z
    .string({ error: "Informe o CPF ou CNPJ do pagador" })
    .transform(onlyDigits)
    .refine((v) => v.length === 11 || v.length === 14, "O CPF deve ter 11 dígitos e o CNPJ, 14"),
  email: z
    .string()
    .trim()
    .optional()
    .nullable()
    .transform((v) => (v ? v.toLowerCase() : undefined))
    .pipe(z.email("E-mail do pagador inválido").optional()),
  phone: optionalDigits,
  cep: optionalDigits,
  street: optionalText(150),
  number: optionalText(20),
  complement: optionalText(100),
  district: optionalText(100),
})

const issueSchema = z.object({
  charge: z.looseObject({
    id: z.string({ error: "Cobrança sem identificador" }).min(1, "Cobrança sem identificador").max(120),
    clientId: z.string({ error: "Informe o cliente" }).min(1, "Informe o cliente").max(120),
    description: z.string({ error: "Informe a descrição" }).trim().min(1, "Informe a descrição"),
    amount: z.number({ error: "Informe o valor" }).positive("O valor deve ser maior que zero").max(9_999_999_999, "Valor muito alto"),
    method: z.enum(["boleto", "pix", "cartao", "asaas"]),
    status: z.enum(["pendente", "vencido"], { error: "Apenas cobranças em aberto podem ser emitidas no Asaas" }),
    dueDate: z
      .string({ error: "Informe o vencimento" })
      .transform((v) => v.slice(0, 10))
      .pipe(z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Vencimento inválido"))
      .refine((v) => v >= todayInBrazil(), "O vencimento não pode estar no passado"),
  }),
  entry: z.looseObject({ id: z.string().min(1).max(120) }).optional().nullable(),
  payer: payerSchema,
})

type IssueInput = { charge: Charge; entry?: FinancialEntry; payer: BoletoPayer }

/** Grava cobrança e lançamento a partir da linha. O servidor persiste; a tela não regrava. */
async function persistIssued(row: BoletoRow, input: IssueInput, userId: string): Promise<Charge> {
  const charge: Charge = { ...input.charge, ...chargeFieldsFromRow(row) }
  await mergeRecord("charges", charge.id, { ...charge }, { created: true, deleted: false, userId })
  const entryId = row.entryId ?? input.entry?.id
  if (input.entry && entryId) {
    await mergeRecord("entries", entryId, { ...input.entry, id: entryId, chargeId: charge.id, ...entryFieldsFromRow(row) }, { created: true, deleted: row.status === "cancelado", userId })
  }
  return charge
}

/** Reserva a emissão. Sem isso, um clique duplo veria a linha sem gatewayId e criaria outro boleto. */
async function claimIssue(input: { chargeId: string; entryId: string | null; environment: "sandbox" | "producao"; amount: string; dueDate: string; userId: string }): Promise<{ row: BoletoRow; fresh: boolean } | null> {
  const [inserted] = await db
    .insert(boletos)
    .values({
      chargeId: input.chargeId,
      entryId: input.entryId,
      environment: input.environment,
      status: "pendente",
      amount: input.amount,
      dueDate: input.dueDate,
      createdBy: input.userId,
    })
    .onConflictDoNothing()
    .returning()
  if (inserted) return { row: inserted, fresh: true }
  const [claimed] = await db
    .update(boletos)
    .set({ amount: input.amount, dueDate: input.dueDate, errorMessage: null, updatedAt: new Date() })
    .where(
      and(
        eq(boletos.chargeId, input.chargeId),
        isNull(boletos.gatewayId),
        or(sql`${boletos.errorMessage} is not null`, sql`${boletos.updatedAt} < now() - make_interval(secs => ${ISSUE_LEASE_SECONDS})`),
      ),
    )
    .returning()
  return claimed ? { row: claimed, fresh: false } : null
}

async function findOrCreateCustomer(client: AsaasClient, payer: z.infer<typeof payerSchema>, clientId: string, environment: "sandbox" | "producao"): Promise<string> {
  const input = { name: payer.name, cpfCnpj: payer.cpfCnpj, email: payer.email, mobilePhone: payer.phone, address: payer.street, addressNumber: payer.number, complement: payer.complement, province: payer.district, postalCode: payer.cep, notificationDisabled: false }
  const customer = await ensureAsaasCustomer(client, input, clientId, environment)
  await enableChargeNotification(client, customer, input)
  return customer.id
}

export async function issueBoletoAction(input: { charge: Charge; entry?: FinancialEntry; payer: BoletoPayer }): Promise<BoletoResult> {
  const user = await requireBillingUser()
  if (!user) return { ok: false, error: NO_PERMISSION }

  const parsed = issueSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Dados inválidos" }
  const { charge: chargeData, payer } = parsed.data
  const chargeId = chargeData.id

  let settings: BillingSettings
  let apiKey: string | null
  try {
    settings = await loadBillingSettings()
    apiKey = readApiKey(settings)
  } catch (err) {
    logError("falha ao ler a configuração", err)
    return { ok: false, error: err instanceof AsaasError ? err.message : "Não foi possível ler a configuração do Asaas. Tente novamente." }
  }
  if (!apiKey) return { ok: false, error: NOT_CONNECTED }
  const environment = settings.environment

  const persist = async (row: BoletoRow): Promise<BoletoResult> => {
    try {
      return { ok: true, charge: await persistIssued(row, input, user.id) }
    } catch (err) {
      logError(`boleto da cobrança ${chargeId} emitido, mas não gravado no CRM`, err)
      return { ok: false, error: "O boleto foi emitido, mas não foi possível salvar a cobrança no CRM. Tente de novo: nenhum boleto novo será criado." }
    }
  }
  const fail = async (message: string): Promise<BoletoResult> => {
    // errorMessage preenchido libera a reserva para a próxima tentativa.
    await db
      .update(boletos)
      .set({ errorMessage: message, updatedAt: new Date() })
      .where(eq(boletos.chargeId, chargeId))
      .catch((err) => logError(`falha ao registrar o erro da cobrança ${chargeId}`, err))
    return { ok: false, error: message.replace(/^\[UNCERTAIN\]\s*/, "") }
  }

  let row: BoletoRow
  let fresh: boolean
  let previouslyUncertain = false
  try {
    const [existing] = await db.select().from(boletos).where(eq(boletos.chargeId, chargeId)).limit(1)
    if (existing?.gatewayId) return persist(existing)
    previouslyUncertain = !!existing && (!existing.errorMessage || existing.errorMessage.startsWith("[UNCERTAIN]"))
    if (existing && existing.environment !== environment) {
      return {
        ok: false,
        error: `A tentativa anterior desta cobrança foi feita em ${ENV_LABEL[existing.environment]} e pode ter sido registrada lá. Volte o ambiente para ${ENV_LABEL[existing.environment]} para concluir, ou crie outra cobrança.`,
      }
    }
    const claim = await claimIssue({
      chargeId,
      entryId: existing?.entryId ?? input.entry?.id ?? null,
      environment,
      amount: chargeData.amount.toFixed(2),
      dueDate: chargeData.dueDate,
      userId: user.id,
    })
    if (!claim) {
      const [latest] = await db.select().from(boletos).where(eq(boletos.chargeId, chargeId)).limit(1)
      if (latest?.gatewayId) return persist(latest)
      return { ok: false, error: "Esta emissão já está em andamento. Aguarde alguns segundos e confira." }
    }
    row = claim.row
    fresh = claim.fresh
  } catch (err) {
    logError(`falha ao registrar o boleto da cobrança ${chargeId}`, err)
    return { ok: false, error: "Não foi possível registrar o boleto. Tente novamente." }
  }

  const client = createAsaasClient(apiKey, environment)
  let payment: AsaasPayment | null = null
  let customerId = row.gatewayCustomerId
  let paymentRequested = false
  try {
    // Tentativa anterior incerta: o boleto pode já existir no Asaas.
    if (!fresh) payment = await client.findPaymentByExternalReference(chargeId)
    if (!payment && previouslyUncertain) return fail("[UNCERTAIN] A emissão anterior ainda não foi confirmada pelo Asaas. Aguarde e consulte novamente; nenhuma nova cobrança será criada para evitar duplicação.")
    if (!payment) {
      customerId = customerId ?? (await findOrCreateCustomer(client, payer, chargeData.clientId, environment))
      const fine = Number(settings.finePercent)
      const interest = Number(settings.interestPercent)
      paymentRequested = true
      payment = await client.createPayment({
        customer: customerId,
        billingType: chargeData.method === "pix" ? "PIX" : chargeData.method === "cartao" ? "CREDIT_CARD" : chargeData.method === "asaas" ? "UNDEFINED" : "BOLETO",
        value: Number(chargeData.amount.toFixed(2)),
        dueDate: chargeData.dueDate,
        description: chargeData.description.slice(0, 500),
        externalReference: chargeId,
        // Objetos vazios sobrescreveriam a configuração da conta no Asaas.
        ...(interest > 0 ? { interest: { value: interest } } : {}),
        ...(fine > 0 ? { fine: { value: fine, type: "PERCENTAGE" as const } } : {}),
      })
    }
  } catch (err) {
    logError(`falha ao emitir o boleto da cobrança ${chargeId}`, err)
    const uncertain = err instanceof AsaasError && (err.timedOut || err.status === undefined || err.status >= 500)
    return fail(uncertain && paymentRequested ? `[UNCERTAIN] ${errorMessage(err)} A emissão será conferida no Asaas antes de qualquer nova tentativa.` : errorMessage(err))
  }

  let saved: BoletoRow
  try {
    const status = mapAsaasStatus(payment.status, payment.deleted)
    const [updated] = await db
      .update(boletos)
      .set({ ...rowPatchFromPayment(row, payment, status), gatewayCustomerId: payment.customer ?? customerId })
      .where(eq(boletos.chargeId, chargeId))
      .returning()
    saved = updated
  } catch (err) {
    // A linha continua sem gatewayId, então a próxima tentativa encontra o boleto por externalReference.
    logError(`boleto ${payment.id} emitido, mas não gravado`, err)
    return fail("O boleto foi emitido, mas não foi possível salvá-lo no CRM. Tente de novo: nenhum boleto novo será criado.")
  }

  if (input.charge.method === "boleto" && (saved.status === "pendente" || saved.status === "vencido")) {
    try {
      const identification = await client.getIdentificationField(payment.id)
      const [updated] = await db
        .update(boletos)
        .set({
          digitableLine: identification.identificationField ?? saved.digitableLine,
          barcode: identification.barCode ?? saved.barcode,
          nossoNumero: identification.nossoNumero ?? saved.nossoNumero,
          updatedAt: new Date(),
        })
        .where(eq(boletos.chargeId, chargeId))
        .returning()
      saved = updated ?? saved
    } catch (err) {
      // A emissão vale com invoiceUrl; "Atualizar status" preenche a linha depois.
      logError(`linha digitável do boleto ${payment.id} indisponível`, err)
    }
  }

  return persist(saved)
}

// ---------------------------------------------------------------------------
// Consulta e cancelamento
// ---------------------------------------------------------------------------

type Loaded = { row: BoletoRow; gatewayId: string; client: AsaasClient } | { error: string }

/** Linha do boleto mais o cliente HTTP, recusando ambiente trocado (a chave atual não enxergaria o boleto). */
async function loadForGateway(chargeId: unknown): Promise<Loaded> {
  if (typeof chargeId !== "string" || !chargeId) return { error: "Boleto não encontrado." }
  const [row] = await db.select().from(boletos).where(eq(boletos.chargeId, chargeId)).limit(1)
  if (!row?.gatewayId) return { error: "Este boleto não está registrado no Asaas." }
  const settings = await loadBillingSettings()
  const apiKey = readApiKey(settings)
  if (!apiKey) return { error: NOT_CONNECTED }
  if (row.environment !== settings.environment) {
    return { error: `Este boleto foi emitido em ${ENV_LABEL[row.environment]}, e o CRM está em ${ENV_LABEL[settings.environment]}. Volte o ambiente em Integrações para consultá-lo.` }
  }
  return { row, gatewayId: row.gatewayId, client: createAsaasClient(apiKey, settings.environment) }
}

async function chargeFromRecords(row: BoletoRow): Promise<Charge | undefined> {
  const stored = await readRecord("charges", row.chargeId)
  return stored ? ({ ...stored, ...chargeFieldsFromRow(row) } as unknown as Charge) : undefined
}

export async function syncBoletoAction(chargeId: string): Promise<BoletoResult> {
  const user = await requireBillingUser()
  if (!user) return { ok: false, error: NO_PERMISSION }
  try {
    const loaded = await loadForGateway(chargeId)
    if ("error" in loaded) return { ok: false, error: loaded.error }
    const { row, gatewayId, client } = loaded
    const payment = await client.getPayment(gatewayId)
    const status = mapAsaasStatus(payment.status, payment.deleted)
    // Falhar aqui não impede atualizar o status; a linha fica para a próxima consulta.
    const identification =
      (status === "pendente" || status === "vencido") && payment.billingType === "BOLETO"
        ? await client.getIdentificationField(gatewayId).catch((err) => {
            logError(`linha digitável do boleto ${gatewayId} indisponível`, err)
            return null
          })
        : null
    const fresh = await applyPaymentSnapshot(row, payment, identification, user.id)
    return { ok: true, charge: await chargeFromRecords(fresh) }
  } catch (err) {
    logError(`falha ao consultar o boleto da cobrança ${chargeId}`, err)
    return { ok: false, error: errorMessage(err) }
  }
}

const PAID_REFUSAL = "Esta cobrança já foi paga e não pode ser cancelada aqui. O estorno é feito no painel do Asaas."

export async function cancelBoletoAction(chargeId: string): Promise<BoletoResult> {
  const user = await requireBillingUser()
  if (!user) return { ok: false, error: NO_PERMISSION }
  try {
    const loaded = await loadForGateway(chargeId)
    if ("error" in loaded) return { ok: false, error: loaded.error }
    const { row, gatewayId, client } = loaded

    if (row.status === "pago") return { ok: false, error: PAID_REFUSAL, charge: await chargeFromRecords(row) }
    if (row.status === "cancelado") return { ok: true, charge: await chargeFromRecords(row) }

    // O status local pode estar atrasado (webhook não chegou): quem decide é o Asaas.
    const current = await client.getPayment(gatewayId)
    const currentStatus = mapAsaasStatus(current.status, current.deleted)
    if (currentStatus === "pago") {
      const fresh = await applyPaymentSnapshot(row, current, null, user.id)
      return { ok: false, error: PAID_REFUSAL, charge: await chargeFromRecords(fresh) }
    }
    if (currentStatus === "cancelado") {
      return { ok: true, charge: await chargeFromRecords(await applyPaymentSnapshot(row, current, null, user.id)) }
    }

    const result = await client.deletePayment(gatewayId)
    if (!result.deleted) return { ok: false, error: "O Asaas não confirmou o cancelamento. Atualize o status e tente novamente." }
    const fresh = await applyPaymentSnapshot(row, { ...current, deleted: true }, null, user.id)
    return { ok: true, charge: await chargeFromRecords(fresh) }
  } catch (err) {
    logError(`falha ao cancelar o boleto da cobrança ${chargeId}`, err)
    return { ok: false, error: errorMessage(err) }
  }
}
