"use server"

import { revalidatePath } from "next/cache"
import { and, desc, eq, getTableColumns, max, sql } from "drizzle-orm"
import { z } from "zod"
import { db, fiscalSettings, invoices } from "@/lib/db"
import type { FiscalSettings, InvoiceRow } from "@/lib/db"
import type { ActionState } from "@/lib/auth/actions"
import { getCurrentUser, type CurrentUser } from "@/lib/auth/session"
import { decryptSecret, encryptSecret } from "@/lib/fiscal/crypto"
import { BrasilNfeError, buscarLote, cancelarNfse, emitirNfse, type BrasilNfeLoteResponse } from "@/lib/fiscal/brasilnfe"
import { applyCancelResponse, applyLoteResponse, buildEmitBody } from "@/lib/fiscal/mapper"

// ---------------------------------------------------------------------------
// Tipos públicos
// ---------------------------------------------------------------------------

export type FiscalSettingsView = {
  connected: boolean
  environment: "homologacao" | "producao"
  tokenLast4: string | null
  municipalityCode: string
  municipalityName: string
  uf: string
  defaultServiceItem: string
  defaultMunicipalTaxCode: string | null
  defaultCnae: string | null
  defaultNbs: string | null
  defaultIssRate: number
  rpsSeries: string
  nextRpsNumber: number
  sendEmailToClient: boolean
  updatedAt: string | null
}

type InvoiceListRow = Omit<InvoiceRow, "pdfBase64" | "xmlBase64">

export type InvoiceView = Omit<
  InvoiceListRow,
  "amount" | "issRate" | "issuedAt" | "canceledAt" | "createdAt" | "updatedAt"
> & {
  amount: number
  issRate: number
  issuedAt: string | null
  canceledAt: string | null
  createdAt: string
  updatedAt: string
  hasPdf: boolean
  hasXml: boolean
}

export type IssueInvoiceInput = {
  clientId: string
  chargeId?: string
  tomador: {
    documentType: "cpf" | "cnpj"
    document: string
    name: string
    municipalRegistration?: string
    email?: string
    phone?: string
    address: {
      cep: string
      street: string
      number: string
      complement?: string
      district: string
      city: string
      uf: string
      ibgeCode: string
    }
  }
  serviceDescription: string
  serviceItem: string
  municipalTaxCode?: string
  cnae?: string
  nbs?: string
  amount: number
  issRate: number
  issRetained: boolean
  retentions: { ir: number; pis: number; cofins: number; csll: number; inss: number }
  competenceDate: string
}

type InvoiceResult = { ok: boolean; error?: string; invoice?: InvoiceView }

// ---------------------------------------------------------------------------
// Constantes e utilitários
// ---------------------------------------------------------------------------

const SETTINGS_ID = "default"
const NO_PERMISSION = "Sem permissão"
const NOT_CONNECTED = "Conecte o Brasil NFe em Integrações"
const FISCAL_ROLES = new Set<CurrentUser["role"]>(["admin", "financeiro"])

async function requireFiscalUser(): Promise<CurrentUser | null> {
  const user = await getCurrentUser()
  if (!user || !FISCAL_ROLES.has(user.role)) return null
  return user
}

function firstError(error: z.ZodError): string {
  return error.issues[0]?.message ?? "Dados inválidos"
}

function errorMessage(err: unknown): string {
  return err instanceof Error && err.message ? err.message : "Erro inesperado ao falar com o Brasil NFe."
}

/** Log no servidor sem dados sensíveis (o token nunca passa por aqui). */
function logError(context: string, err: unknown) {
  console.error(`[fiscal] ${context}:`, err instanceof Error ? err.message : err)
}

function onlyDigits(v: string): string {
  return v.replace(/\D/g, "")
}

function toNumber(v: string | number | null | undefined, fallback = 0): number {
  if (v === null || v === undefined || v === "") return fallback
  const n = typeof v === "number" ? v : Number(v)
  return Number.isFinite(n) ? n : fallback
}

function toIso(d: Date | string | null | undefined): string | null {
  if (!d) return null
  const date = d instanceof Date ? d : new Date(d)
  return Number.isNaN(date.getTime()) ? null : date.toISOString()
}

function tipoAmbiente(env: string): 1 | 2 {
  return env === "producao" ? 1 : 2
}

function revalidateFiscal() {
  revalidatePath("/notas-fiscais")
  revalidatePath("/integracoes")
  revalidatePath("/integracoes/brasil_nfe")
}

// ---------------------------------------------------------------------------
// Configuração
// ---------------------------------------------------------------------------

/** Lê a linha única de configuração, criando-a com os padrões se ainda não existir. */
async function loadSettings(): Promise<FiscalSettings> {
  const [row] = await db.select().from(fiscalSettings).where(eq(fiscalSettings.id, SETTINGS_ID)).limit(1)
  if (row) return row
  await db.insert(fiscalSettings).values({ id: SETTINGS_ID }).onConflictDoNothing()
  const [created] = await db.select().from(fiscalSettings).where(eq(fiscalSettings.id, SETTINGS_ID)).limit(1)
  return created
}

function readToken(settings: Pick<FiscalSettings, "tokenEncrypted">): string | null {
  if (!settings.tokenEncrypted) return null
  try {
    return decryptSecret(settings.tokenEncrypted)
  } catch (err) {
    logError("falha ao descriptografar o token", err)
    throw new Error("Não foi possível ler o token salvo. Cole o token do Brasil NFe de novo em Integrações.")
  }
}

function toSettingsView(s: FiscalSettings): FiscalSettingsView {
  let tokenLast4: string | null = null
  if (s.tokenEncrypted) {
    try {
      tokenLast4 = decryptSecret(s.tokenEncrypted).slice(-4)
    } catch (err) {
      logError("falha ao descriptografar o token", err)
    }
  }
  return {
    connected: Boolean(s.tokenEncrypted),
    environment: s.environment === "producao" ? "producao" : "homologacao",
    tokenLast4,
    municipalityCode: s.municipalityCode,
    municipalityName: s.municipalityName ?? "",
    uf: s.uf ?? "",
    defaultServiceItem: s.defaultServiceItem ?? "",
    defaultMunicipalTaxCode: s.defaultMunicipalTaxCode,
    defaultCnae: s.defaultCnae,
    defaultNbs: s.defaultNbs,
    defaultIssRate: toNumber(s.defaultIssRate, 5),
    rpsSeries: s.rpsSeries ?? "A",
    nextRpsNumber: s.nextRpsNumber,
    sendEmailToClient: s.sendEmailToClient ?? true,
    updatedAt: toIso(s.updatedAt),
  }
}

const DEFAULT_SETTINGS_VIEW: FiscalSettingsView = {
  connected: false,
  environment: "homologacao",
  tokenLast4: null,
  municipalityCode: "2927408",
  municipalityName: "Salvador",
  uf: "BA",
  defaultServiceItem: "010701",
  defaultMunicipalTaxCode: null,
  defaultCnae: null,
  defaultNbs: null,
  defaultIssRate: 5,
  rpsSeries: "A",
  nextRpsNumber: 1,
  sendEmailToClient: true,
  updatedAt: null,
}

export async function getFiscalSettings(): Promise<FiscalSettingsView> {
  const user = await requireFiscalUser()
  if (!user) return { ...DEFAULT_SETTINGS_VIEW }
  return toSettingsView(await loadSettings())
}

const optionalText = (max: number, label: string) =>
  z
    .string()
    .trim()
    .max(max, `${label} muito longo`)
    .optional()
    .transform((v) => (v ? v : null))

const decimalField = (label: string, min: number, maxValue: number) =>
  z
    .string({ error: `${label} é obrigatório` })
    .trim()
    .min(1, `${label} é obrigatório`)
    .transform((v) => Number(v.replace(",", ".")))
    .pipe(
      z
        .number({ error: `${label} inválido` })
        .min(min, `${label} deve ser no mínimo ${min}`)
        .max(maxValue, `${label} deve ser no máximo ${maxValue}`),
    )

const settingsSchema = z.object({
  token: z.string().trim().max(500, "Token muito longo").optional().default(""),
  environment: z.enum(["homologacao", "producao"], { error: "Escolha o ambiente" }),
  municipalityCode: z
    .string({ error: "Código IBGE do município é obrigatório" })
    .transform(onlyDigits)
    .pipe(z.string().regex(/^\d{7}$/, "O código IBGE do município tem 7 dígitos")),
  municipalityName: z.string({ error: "Município é obrigatório" }).trim().min(2, "Informe o município").max(120),
  uf: z
    .string({ error: "UF é obrigatória" })
    .trim()
    .toUpperCase()
    .pipe(z.string().regex(/^[A-Z]{2}$/, "UF inválida")),
  defaultServiceItem: z
    .string({ error: "Item da LC 116 é obrigatório" })
    .transform(onlyDigits)
    .pipe(z.string().regex(/^\d{6}$/, "O item da LC 116 tem 6 dígitos, sem ponto (ex.: 010701)")),
  defaultMunicipalTaxCode: optionalText(40, "Código de tributação municipal"),
  defaultCnae: optionalText(20, "CNAE"),
  defaultNbs: optionalText(20, "NBS"),
  defaultIssRate: decimalField("Alíquota de ISS", 0, 10),
  rpsSeries: z.string({ error: "Série do RPS é obrigatória" }).trim().min(1, "Informe a série do RPS").max(5, "Série do RPS muito longa"),
  nextRpsNumber: z
    .string({ error: "Próximo número de RPS é obrigatório" })
    .trim()
    .transform((v) => Number(onlyDigits(v)))
    .pipe(z.number().int().min(1, "O próximo número de RPS deve ser 1 ou maior").max(2_000_000_000, "Número de RPS muito alto")),
  sendEmailToClient: z.boolean(),
})

const SETTINGS_KEYS = [
  "token",
  "environment",
  "municipalityCode",
  "municipalityName",
  "uf",
  "defaultServiceItem",
  "defaultMunicipalTaxCode",
  "defaultCnae",
  "defaultNbs",
  "defaultIssRate",
  "rpsSeries",
  "nextRpsNumber",
] as const

export async function saveFiscalSettingsAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireFiscalUser()
  if (!user) return { error: NO_PERMISSION }

  const raw: Record<string, unknown> = {}
  for (const k of SETTINGS_KEYS) {
    const v = formData.get(k)
    if (typeof v === "string") raw[k] = v
  }
  raw.sendEmailToClient = formData.get("sendEmailToClient") === "on"

  const parsed = settingsSchema.safeParse(raw)
  if (!parsed.success) return { error: firstError(parsed.error) }
  const { token, ...data } = parsed.data

  // Evita reaproveitar um número de RPS já usado na mesma série e ambiente.
  const [used] = await db
    .select({ last: max(invoices.rpsNumber) })
    .from(invoices)
    .where(and(eq(invoices.rpsSeries, data.rpsSeries), eq(invoices.environment, data.environment)))
  const last = used?.last ?? 0
  if (data.nextRpsNumber <= last) {
    return { error: `O próximo número de RPS da série ${data.rpsSeries} precisa ser maior que ${last}, o último já usado.` }
  }

  let tokenEncrypted: string | undefined
  if (token) {
    try {
      tokenEncrypted = encryptSecret(token)
    } catch (err) {
      logError("falha ao criptografar o token", err)
      return { error: "Não foi possível guardar o token. Verifique a configuração APP_ENCRYPTION_KEY do servidor." }
    }
  }

  const values = {
    ...data,
    defaultIssRate: data.defaultIssRate.toFixed(2),
    updatedAt: new Date(),
    updatedBy: user.id,
    ...(tokenEncrypted ? { tokenEncrypted } : {}),
  }

  try {
    await db
      .insert(fiscalSettings)
      .values({ id: SETTINGS_ID, ...values })
      .onConflictDoUpdate({ target: fiscalSettings.id, set: values })
  } catch (err) {
    logError("falha ao salvar configurações", err)
    return { error: "Não foi possível salvar as configurações. Tente novamente." }
  }

  revalidateFiscal()
  return { ok: true, message: tokenEncrypted ? "Configurações salvas e token atualizado." : "Configurações salvas." }
}

export async function disconnectFiscalAction(): Promise<ActionState> {
  const user = await requireFiscalUser()
  if (!user) return { error: NO_PERMISSION }
  await loadSettings()
  await db
    .update(fiscalSettings)
    .set({ tokenEncrypted: null, updatedAt: new Date(), updatedBy: user.id })
    .where(eq(fiscalSettings.id, SETTINGS_ID))
  revalidateFiscal()
  return { ok: true, message: "Brasil NFe desconectado. O token foi apagado." }
}

const TOKEN_REJECTED = /token|autoriza|autentica|unauthor|forbidden|inv[aá]lid[oa] .*empresa|empresa n[aã]o/i

export async function testFiscalConnectionAction(): Promise<ActionState> {
  const user = await requireFiscalUser()
  if (!user) return { error: NO_PERMISSION }

  let token: string | null
  try {
    token = readToken(await loadSettings())
  } catch (err) {
    return { error: errorMessage(err) }
  }
  if (!token) return { error: NOT_CONNECTED }

  try {
    // Consulta de um lote inexistente: não emite nada, só valida o token.
    const resp = await buscarLote(token, { codLote: "0", Rps: [] })
    const apiError = typeof resp?.Error === "string" ? resp.Error.trim() : ""
    if (apiError && TOKEN_REJECTED.test(apiError)) {
      return { error: `O Brasil NFe recusou o token: ${apiError}` }
    }
    return { ok: true, message: "Conexão com o Brasil NFe funcionando. O token foi aceito." }
  } catch (err) {
    // HTTP 400 sem menção ao token = o serviço respondeu e só recusou o lote fictício.
    if (err instanceof BrasilNfeError && err.status === 400 && !TOKEN_REJECTED.test(err.message)) {
      return { ok: true, message: "Conexão com o Brasil NFe funcionando. O token foi aceito." }
    }
    logError("teste de conexão", err)
    return { error: errorMessage(err) }
  }
}

// ---------------------------------------------------------------------------
// Notas fiscais: leitura
// ---------------------------------------------------------------------------

const { pdfBase64: _pdf, xmlBase64: _xml, ...listColumns } = getTableColumns(invoices)
void _pdf
void _xml

const invoiceSelection = {
  ...listColumns,
  hasPdf: sql<boolean>`(${invoices.pdfBase64} is not null)`,
  hasXml: sql<boolean>`(${invoices.xmlBase64} is not null)`,
}

type InvoiceSelected = InvoiceListRow & { hasPdf: boolean; hasXml: boolean }

function toInvoiceView(row: InvoiceSelected): InvoiceView {
  return {
    ...row,
    amount: toNumber(row.amount),
    issRate: toNumber(row.issRate),
    issuedAt: toIso(row.issuedAt),
    canceledAt: toIso(row.canceledAt),
    createdAt: toIso(row.createdAt) ?? new Date(0).toISOString(),
    updatedAt: toIso(row.updatedAt) ?? new Date(0).toISOString(),
    hasPdf: Boolean(row.hasPdf),
    hasXml: Boolean(row.hasXml),
  }
}

function rowToView(row: InvoiceRow): InvoiceView {
  const { pdfBase64, xmlBase64, ...rest } = row
  return toInvoiceView({ ...rest, hasPdf: Boolean(pdfBase64), hasXml: Boolean(xmlBase64) })
}

async function loadInvoice(id: string): Promise<InvoiceRow | null> {
  const [row] = await db.select().from(invoices).where(eq(invoices.id, id)).limit(1)
  return row ?? null
}

export async function listInvoices(): Promise<InvoiceView[]> {
  const user = await requireFiscalUser()
  if (!user) return []
  const rows = await db.select(invoiceSelection).from(invoices).orderBy(desc(invoices.createdAt))
  return rows.map(toInvoiceView)
}

export async function getInvoice(id: string): Promise<InvoiceView | null> {
  const user = await requireFiscalUser()
  if (!user || typeof id !== "string" || !id) return null
  const [row] = await db.select(invoiceSelection).from(invoices).where(eq(invoices.id, id)).limit(1)
  return row ? toInvoiceView(row) : null
}

// ---------------------------------------------------------------------------
// Notas fiscais: emissão
// ---------------------------------------------------------------------------

const requiredText = (label: string, maxLen = 255) =>
  z.string({ error: `${label} é obrigatório` }).trim().min(1, `${label} é obrigatório`).max(maxLen, `${label} muito longo`)

const optionalInputText = (maxLen: number) =>
  z
    .string()
    .trim()
    .max(maxLen)
    .optional()
    .nullable()
    .transform((v) => (v ? v : undefined))

const digitsField = (label: string, len: number) =>
  z
    .string({ error: `${label} é obrigatório` })
    .transform(onlyDigits)
    .pipe(z.string().regex(new RegExp(`^\\d{${len}}$`), `${label} deve ter ${len} dígitos`))

const moneyRetention = z.number({ error: "Retenção inválida" }).min(0, "Retenções não podem ser negativas").default(0)

const issueSchema = z
  .object({
    clientId: requiredText("Cliente", 100),
    chargeId: optionalInputText(100),
    tomador: z.object({
      documentType: z.enum(["cpf", "cnpj"], { error: "Escolha CPF ou CNPJ" }),
      document: z.string({ error: "CPF/CNPJ é obrigatório" }).transform(onlyDigits),
      name: requiredText("Nome do tomador", 150).pipe(z.string().min(2, "Informe o nome do tomador")),
      municipalRegistration: z
        .string()
        .optional()
        .nullable()
        .transform((v) => (v ? onlyDigits(v) || undefined : undefined)),
      email: z
        .string()
        .trim()
        .optional()
        .nullable()
        .transform((v) => (v ? v.toLowerCase() : undefined))
        .pipe(z.email("E-mail do tomador inválido").optional()),
      phone: z
        .string()
        .optional()
        .nullable()
        .transform((v) => (v ? onlyDigits(v) || undefined : undefined)),
      address: z.object({
        cep: digitsField("CEP", 8),
        street: requiredText("Logradouro", 150),
        number: requiredText("Número do endereço", 20),
        complement: optionalInputText(100),
        district: requiredText("Bairro", 100),
        city: requiredText("Cidade", 100),
        uf: z
          .string({ error: "UF é obrigatória" })
          .trim()
          .toUpperCase()
          .pipe(z.string().regex(/^[A-Z]{2}$/, "UF inválida")),
        ibgeCode: digitsField("Código IBGE do município", 7),
      }),
    }),
    serviceDescription: requiredText("Descrição do serviço", 2000),
    serviceItem: digitsField("Item da LC 116", 6),
    municipalTaxCode: optionalInputText(40),
    cnae: z
      .string()
      .optional()
      .nullable()
      .transform((v) => (v ? onlyDigits(v) || undefined : undefined)),
    nbs: z
      .string()
      .optional()
      .nullable()
      .transform((v) => (v ? onlyDigits(v) || undefined : undefined)),
    amount: z.number({ error: "Valor é obrigatório" }).positive("O valor deve ser maior que zero").max(9_999_999_999, "Valor muito alto"),
    issRate: z.number({ error: "Alíquota de ISS é obrigatória" }).min(0, "Alíquota inválida").max(10, "Alíquota de ISS acima de 10%"),
    issRetained: z.boolean({ error: "Informe se o ISS é retido" }),
    retentions: z
      .object({ ir: moneyRetention, pis: moneyRetention, cofins: moneyRetention, csll: moneyRetention, inss: moneyRetention })
      .default({ ir: 0, pis: 0, cofins: 0, csll: 0, inss: 0 }),
    competenceDate: z
      .string({ error: "Data de competência é obrigatória" })
      .regex(/^\d{4}-\d{2}-\d{2}$/, "Data de competência inválida")
      .refine((v) => !Number.isNaN(new Date(`${v}T12:00:00Z`).getTime()), "Data de competência inválida"),
  })
  .superRefine((d, ctx) => {
    const expected = d.tomador.documentType === "cpf" ? 11 : 14
    if (d.tomador.document.length !== expected) {
      ctx.addIssue({
        code: "custom",
        path: ["tomador", "document"],
        message: d.tomador.documentType === "cpf" ? "O CPF deve ter 11 dígitos" : "O CNPJ deve ter 14 dígitos",
      })
    }
    const r = d.retentions
    const totalRetido = r.ir + r.pis + r.cofins + r.csll + r.inss + (d.issRetained ? (d.amount * d.issRate) / 100 : 0)
    if (totalRetido > d.amount) {
      ctx.addIssue({ code: "custom", path: ["retentions"], message: "As retenções somam mais que o valor do serviço" })
    }
  })

type ParsedIssue = z.infer<typeof issueSchema>

function invoiceFieldsFromInput(d: ParsedIssue) {
  return {
    clientId: d.clientId,
    chargeId: d.chargeId ?? null,
    tomador: d.tomador,
    serviceDescription: d.serviceDescription,
    serviceItem: d.serviceItem,
    municipalTaxCode: d.municipalTaxCode ?? null,
    cnae: d.cnae ?? null,
    nbs: d.nbs ?? null,
    amount: d.amount.toFixed(2),
    issRate: d.issRate.toFixed(2),
    issRetained: d.issRetained,
    retentions: d.retentions,
    competenceDate: d.competenceDate,
  }
}

/** Converte uma linha salva de volta para o formato de entrada (usado em "corrigir e reenviar"). */
function inputFromRow(row: InvoiceRow): IssueInvoiceInput {
  const r = row.retentions ?? {}
  return {
    clientId: row.clientId ?? "",
    chargeId: row.chargeId ?? undefined,
    tomador: row.tomador,
    serviceDescription: row.serviceDescription,
    serviceItem: row.serviceItem,
    municipalTaxCode: row.municipalTaxCode ?? undefined,
    cnae: row.cnae ?? undefined,
    nbs: row.nbs ?? undefined,
    amount: toNumber(row.amount),
    issRate: toNumber(row.issRate),
    issRetained: row.issRetained,
    retentions: { ir: r.ir ?? 0, pis: r.pis ?? 0, cofins: r.cofins ?? 0, csll: r.csll ?? 0, inss: r.inss ?? 0 },
    competenceDate: row.competenceDate,
  }
}

/**
 * Reserva atomicamente o próximo número de RPS (UPDATE ... SET n = n + 1 RETURNING).
 * Devolve a configuração já incrementada e o número reservado.
 */
async function reserveRps(): Promise<{ settings: FiscalSettings; rpsNumber: number }> {
  await loadSettings()
  const [updated] = await db
    .update(fiscalSettings)
    .set({ nextRpsNumber: sql`${fiscalSettings.nextRpsNumber} + 1` })
    .where(eq(fiscalSettings.id, SETTINGS_ID))
    .returning()
  if (!updated) throw new Error("Configuração fiscal não encontrada.")
  return { settings: updated, rpsNumber: updated.nextRpsNumber - 1 }
}

/** Envia a nota já gravada como 'processando' e salva o resultado. */
async function sendInvoice(invoice: InvoiceRow, settings: FiscalSettings, token: string): Promise<InvoiceResult> {
  let resp: BrasilNfeLoteResponse
  try {
    const body = buildEmitBody(invoice, settings, invoice.lote ?? invoice.rpsNumber ?? 0)
    resp = await emitirNfse(token, body)
  } catch (err) {
    logError(`falha ao emitir a nota ${invoice.id}`, err)
    const msg = `${errorMessage(err)} Antes de reenviar, confira no painel do Brasil NFe se a nota não foi emitida.`
    const [saved] = await db
      .update(invoices)
      .set({ status: "rejeitada", errorMessage: msg, updatedAt: new Date() })
      .where(eq(invoices.id, invoice.id))
      .returning()
    revalidateFiscal()
    return { ok: false, error: msg, invoice: saved ? rowToView(saved) : undefined }
  }

  const patch = applyLoteResponse(resp, invoice)
  const [saved] = await db
    .update(invoices)
    .set({ ...patch, updatedAt: new Date() })
    .where(eq(invoices.id, invoice.id))
    .returning()
  revalidateFiscal()
  const view = rowToView(saved ?? { ...invoice, ...patch })
  if (view.status === "rejeitada") {
    return { ok: false, error: view.errorMessage ?? "A nota foi rejeitada.", invoice: view }
  }
  return { ok: true, invoice: view }
}

async function tokenOrError(settings: FiscalSettings): Promise<{ token: string } | { error: string }> {
  try {
    const token = readToken(settings)
    return token ? { token } : { error: NOT_CONNECTED }
  } catch (err) {
    return { error: errorMessage(err) }
  }
}

export async function issueInvoiceAction(input: IssueInvoiceInput): Promise<InvoiceResult> {
  const user = await requireFiscalUser()
  if (!user) return { ok: false, error: NO_PERMISSION }

  const parsed = issueSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: firstError(parsed.error) }

  const auth = await tokenOrError(await loadSettings())
  if ("error" in auth) return { ok: false, error: auth.error }

  let invoice: InvoiceRow
  let settings: FiscalSettings
  try {
    const reserved = await reserveRps()
    settings = reserved.settings
    const [created] = await db
      .insert(invoices)
      .values({
        ...invoiceFieldsFromInput(parsed.data),
        status: "processando",
        environment: settings.environment,
        rpsSeries: settings.rpsSeries ?? "A",
        rpsNumber: reserved.rpsNumber,
        lote: reserved.rpsNumber,
        createdBy: user.id,
      })
      .returning()
    invoice = created
  } catch (err) {
    logError("falha ao registrar a nota", err)
    return { ok: false, error: "Não foi possível registrar a nota. Tente novamente." }
  }

  return sendInvoice(invoice, settings, auth.token)
}

export async function retryInvoiceAction(id: string, input?: Partial<IssueInvoiceInput>): Promise<InvoiceResult> {
  const user = await requireFiscalUser()
  if (!user) return { ok: false, error: NO_PERMISSION }

  const current = typeof id === "string" && id ? await loadInvoice(id) : null
  if (!current) return { ok: false, error: "Nota não encontrada." }
  if (current.status !== "rejeitada") return { ok: false, error: "Só é possível reenviar notas rejeitadas." }

  const base = inputFromRow(current)
  const merged: IssueInvoiceInput = {
    ...base,
    ...(input ?? {}),
    tomador: input?.tomador ? { ...base.tomador, ...input.tomador, address: { ...base.tomador.address, ...input.tomador.address } } : base.tomador,
    retentions: input?.retentions ? { ...base.retentions, ...input.retentions } : base.retentions,
  }
  const parsed = issueSchema.safeParse(merged)
  if (!parsed.success) return { ok: false, error: firstError(parsed.error) }

  const auth = await tokenOrError(await loadSettings())
  if ("error" in auth) return { ok: false, error: auth.error }

  let invoice: InvoiceRow
  let settings: FiscalSettings
  try {
    const reserved = await reserveRps()
    settings = reserved.settings
    // Só reenvia se a nota continuar 'rejeitada' (evita dois reenvios simultâneos).
    const [updated] = await db
      .update(invoices)
      .set({
        ...invoiceFieldsFromInput(parsed.data),
        status: "processando",
        environment: settings.environment,
        rpsSeries: settings.rpsSeries ?? "A",
        rpsNumber: reserved.rpsNumber,
        lote: reserved.rpsNumber,
        codLote: null,
        protocolo: null,
        number: null,
        verificationCode: null,
        accessKey: null,
        values: null,
        issuedAt: null,
        errorMessage: null,
        warnings: null,
        pdfBase64: null,
        xmlBase64: null,
        updatedAt: new Date(),
      })
      .where(and(eq(invoices.id, current.id), eq(invoices.status, "rejeitada")))
      .returning()
    if (!updated) return { ok: false, error: "A nota já está sendo reenviada." }
    invoice = updated
  } catch (err) {
    logError(`falha ao preparar o reenvio da nota ${current.id}`, err)
    return { ok: false, error: "Não foi possível preparar o reenvio. Tente novamente." }
  }

  return sendInvoice(invoice, settings, auth.token)
}

// ---------------------------------------------------------------------------
// Notas fiscais: consulta e cancelamento
// ---------------------------------------------------------------------------

export async function refreshInvoiceAction(id: string): Promise<InvoiceResult> {
  const user = await requireFiscalUser()
  if (!user) return { ok: false, error: NO_PERMISSION }

  const invoice = typeof id === "string" && id ? await loadInvoice(id) : null
  if (!invoice) return { ok: false, error: "Nota não encontrada." }
  if (invoice.status !== "processando" && invoice.status !== "cancelando") {
    return { ok: true, invoice: rowToView(invoice) }
  }
  if (!invoice.codLote) {
    return {
      ok: false,
      error: "Esta nota não tem código de lote do Brasil NFe para consulta. Confira no painel do Brasil NFe.",
      invoice: rowToView(invoice),
    }
  }

  const auth = await tokenOrError(await loadSettings())
  if ("error" in auth) return { ok: false, error: auth.error, invoice: rowToView(invoice) }

  let resp: BrasilNfeLoteResponse
  try {
    resp = await buscarLote(auth.token, { codLote: invoice.codLote, Rps: invoice.rpsNumber ? [invoice.rpsNumber] : [] })
  } catch (err) {
    logError(`falha ao consultar a nota ${invoice.id}`, err)
    return { ok: false, error: errorMessage(err), invoice: rowToView(invoice) }
  }

  let patch: Partial<InvoiceRow>
  if (invoice.status === "cancelando") {
    const nota =
      resp?.Notas?.find((n) => String(n.IdentificadorInterno ?? "") === invoice.id) ??
      resp?.Notas?.find((n) => invoice.number && String(n.NumeroNFSe ?? "") === invoice.number) ??
      (resp?.Notas?.length === 1 ? resp.Notas[0] : undefined)
    if (!nota?.Cancelada) return { ok: true, invoice: rowToView(invoice) }
    patch = { status: "cancelada", canceledAt: new Date() }
  } else {
    patch = applyLoteResponse(resp, invoice)
  }

  const [saved] = await db
    .update(invoices)
    .set({ ...patch, updatedAt: new Date() })
    .where(and(eq(invoices.id, invoice.id), eq(invoices.status, invoice.status)))
    .returning()
  revalidateFiscal()
  const fresh = saved ?? (await loadInvoice(invoice.id)) ?? invoice
  return { ok: true, invoice: rowToView(fresh) }
}

const cancelSchema = z.object({
  reasonCode: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(9)], { error: "Escolha o motivo do cancelamento" }),
  justification: z
    .string({ error: "Informe a justificativa" })
    .trim()
    .min(15, "A justificativa precisa ter pelo menos 15 caracteres")
    .max(1000, "A justificativa pode ter no máximo 1000 caracteres"),
})

export async function cancelInvoiceAction(id: string, reasonCode: 1 | 2 | 3 | 9, justification: string): Promise<InvoiceResult> {
  const user = await requireFiscalUser()
  if (!user) return { ok: false, error: NO_PERMISSION }

  const parsed = cancelSchema.safeParse({ reasonCode, justification })
  if (!parsed.success) return { ok: false, error: firstError(parsed.error) }

  const invoice = typeof id === "string" && id ? await loadInvoice(id) : null
  if (!invoice) return { ok: false, error: "Nota não encontrada." }
  if (invoice.status !== "emitida") return { ok: false, error: "Só é possível cancelar notas emitidas." }
  if (!invoice.number) return { ok: false, error: "A nota não tem número de NFS-e para cancelar." }

  const auth = await tokenOrError(await loadSettings())
  if ("error" in auth) return { ok: false, error: auth.error }

  // Marca como 'cancelando' só se ainda estiver 'emitida' (evita cancelamento duplo).
  const [locked] = await db
    .update(invoices)
    .set({
      status: "cancelando",
      cancelReasonCode: parsed.data.reasonCode,
      cancelJustification: parsed.data.justification,
      updatedAt: new Date(),
    })
    .where(and(eq(invoices.id, invoice.id), eq(invoices.status, "emitida")))
    .returning()
  if (!locked) return { ok: false, error: "A nota já está sendo cancelada." }

  const restore = async (msg: string) => {
    const [back] = await db
      .update(invoices)
      .set({ status: "emitida", errorMessage: msg, updatedAt: new Date() })
      .where(eq(invoices.id, invoice.id))
      .returning()
    revalidateFiscal()
    return { ok: false, error: msg, invoice: rowToView(back ?? invoice) }
  }

  let resp: Awaited<ReturnType<typeof cancelarNfse>>
  try {
    resp = await cancelarNfse(auth.token, {
      TipoAmbiente: tipoAmbiente(invoice.environment),
      TipoDocumento: 1,
      NumeroNFSe: invoice.number,
      CodCancelamentoNFSe: parsed.data.reasonCode,
      Justificativa: parsed.data.justification,
    })
  } catch (err) {
    logError(`falha ao cancelar a nota ${invoice.id}`, err)
    return restore(`${errorMessage(err)} Confira no painel do Brasil NFe se o cancelamento foi registrado.`)
  }

  // applyCancelResponse: 1 → 'cancelada', 2 → 'cancelando', 3/erro → volta para 'emitida' com errorMessage.
  // Passa a linha de antes do lock ('emitida'): com 'cancelando' o mapper manteria 'cancelando' em caso de erro.
  const patch = applyCancelResponse(resp ?? {}, invoice)
  if (patch.status === "emitida") {
    return restore(`Cancelamento recusado: ${patch.errorMessage ?? "O Brasil NFe não confirmou o cancelamento."}`)
  }
  const [saved] = await db
    .update(invoices)
    .set({ ...patch, updatedAt: new Date() })
    .where(eq(invoices.id, invoice.id))
    .returning()
  revalidateFiscal()
  return { ok: true, invoice: rowToView(saved ?? { ...locked, ...patch }) }
}
