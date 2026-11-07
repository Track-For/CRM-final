// Server-only service: called by verified payment flows and the fiscal worker, never a Server Action.
import { createHash } from "node:crypto"
import { and, desc, eq, sql } from "drizzle-orm"
import { db, crmRecords, fiscalSettings, invoices } from "@/lib/db"
import type { FiscalEnvironment, InvoiceRow } from "@/lib/db"
import type { Charge, Client } from "@/types"
import { decryptSecret } from "./crypto"
import { issueSchema, invoiceFieldsFromInput } from "./issue-input"
import { applyLoteResponse, buildEmitBody, todayInBrazil } from "./mapper"
import { emitirNfse } from "./brasilnfe"

const RESOURCE = "fiscalJobs"
type JobStatus = "pending" | "processing" | "blocked" | "completed" | "review"
export type FiscalJob = {
  id: string
  chargeId: string
  description: string
  environment: FiscalEnvironment
  status: JobStatus
  error: string | null
  invoiceId?: string
  updatedAt: string
}

async function record<T>(resource: string, id: string): Promise<T | null> {
  const [row] = await db.select().from(crmRecords).where(and(eq(crmRecords.resource, resource), eq(crmRecords.id, id), eq(crmRecords.deleted, false))).limit(1)
  return row ? { ...row.data, id: row.id } as T : null
}

/** Persist before acknowledging the payment. Repeated events never create a second job. */
export async function enqueuePaidCharge(chargeId: string): Promise<string | null> {
  const charge = await record<Charge>("charges", chargeId)
  if (!charge || charge.status !== "pago" || charge.deletedAt) return null
  const [settings] = await db.select().from(fiscalSettings).where(eq(fiscalSettings.id, "default")).limit(1)
  const environment = settings?.environment ?? "homologacao"
  const id = createHash("sha256").update(`${environment}:${chargeId}`).digest("hex")
  const job: FiscalJob = { id, chargeId, description: charge.description || charge.number || chargeId, environment, status: "pending", error: null, updatedAt: new Date().toISOString() }
  await db.insert(crmRecords).values({ resource: RESOURCE, id, data: { ...job }, created: true }).onConflictDoNothing()
  return id
}

async function saveJob(job: FiscalJob, patch: Partial<FiscalJob>) {
  await db.update(crmRecords).set({ data: { ...job, ...patch, updatedAt: new Date().toISOString() }, updatedAt: new Date() }).where(and(eq(crmRecords.resource, RESOURCE), eq(crmRecords.id, job.id)))
}

export async function listFiscalJobs(): Promise<FiscalJob[]> {
  const rows = await db.select().from(crmRecords).where(and(eq(crmRecords.resource, RESOURCE), eq(crmRecords.deleted, false), sql`${crmRecords.data}->>'status' <> 'completed'`)).orderBy(desc(crmRecords.updatedAt)).limit(100)
  return rows.map(row => ({ ...row.data, id: row.id, updatedAt: row.updatedAt.toISOString() } as FiscalJob))
}

async function municipalityCode(client: Client): Promise<string> {
  const address = client.address as Client["address"] & { ibgeCode?: string }
  if (/^\d{7}$/.test(address.ibgeCode ?? "")) return address.ibgeCode!
  const cep = (address.zip ?? "").replace(/\D/g, "")
  if (cep.length !== 8) throw Error("Preencha o CEP do cliente.")
  const response = await fetch(`https://viacep.com.br/ws/${cep}/json/`, { signal: AbortSignal.timeout(8_000) })
  if (!response.ok) throw Error("Não foi possível consultar o município do CEP do cliente.")
  const result = await response.json() as { ibge?: string; localidade?: string; uf?: string }
  const normalize = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase()
  if (!/^\d{7}$/.test(result.ibge ?? "") || normalize(result.localidade ?? "") !== normalize(address.city ?? "") || result.uf !== address.state?.toUpperCase()) throw Error("Confira CEP, cidade e UF no cadastro do cliente.")
  return result.ibge!
}

/** One attempt. An uncertain transmission is retained for consultation, never automatically resent. */
export async function processFiscalJob(id: string): Promise<void> {
  const [claimed] = await db.update(crmRecords).set({ data: sql`${crmRecords.data} || '{"status":"processing","error":null}'::jsonb`, updatedAt: new Date() }).where(and(eq(crmRecords.resource, RESOURCE), eq(crmRecords.id, id), sql`(${crmRecords.data}->>'status' in ('pending','blocked') or (${crmRecords.data}->>'status' = 'processing' and ${crmRecords.updatedAt} < now() - interval '2 minutes'))`)).returning()
  if (!claimed) return
  const job = { ...claimed.data, id } as FiscalJob
  let invoice: InvoiceRow | undefined
  try {
    const [existing] = await db.select().from(invoices).where(and(eq(invoices.chargeId, job.chargeId), eq(invoices.environment, job.environment))).limit(1)
    if (existing) {
      await saveJob(job, { status: existing.status === "processando" && !existing.codLote && !existing.protocolo ? "review" : "completed", invoiceId: existing.id, error: existing.status === "processando" && !existing.codLote && !existing.protocolo ? "Já existe uma tentativa. Consulte o Brasil NFe antes de reenviar." : null })
      return
    }
    const charge = await record<Charge>("charges", job.chargeId)
    if (!charge || charge.status !== "pago" || charge.deletedAt) throw Error("A cobrança não está paga ou foi removida. Nenhuma nota foi enviada.")
    const [settings] = await db.select().from(fiscalSettings).where(eq(fiscalSettings.id, "default")).limit(1)
    if (!settings?.autoIssueOnPayment) throw Error("Ative a emissão automática na integração Brasil NFe após revisar os padrões fiscais.")
    if (!settings?.tokenEncrypted) throw Error("Configure o token do Brasil NFe em Integrações.")
    if (settings.environment !== job.environment) throw Error("O ambiente fiscal mudou. Revise esta cobrança antes de emitir manualmente no novo ambiente.")
    if (settings.environment === "producao" && charge.gatewayEnvironment === "sandbox") throw Error("Pagamento de teste do Asaas não pode gerar nota em produção.")
    const token = decryptSecret(settings.tokenEncrypted)
    const client = await record<Client>("clients", charge.clientId)
    if (!client || client.deletedAt) throw Error("Cliente não encontrado. Confira o cadastro da cobrança.")
    const a = client.address
    if (!a) throw Error("Preencha o endereço fiscal do cliente.")
    const parsed = issueSchema.safeParse({
      clientId: client.id, chargeId: charge.id,
      tomador: { documentType: client.documentType, document: client.document, name: client.legalName || client.name, email: client.email || undefined, phone: client.whatsapp, municipalRegistration: client.municipalRegistration, address: { cep: a.zip, street: a.street, number: a.number, complement: a.complement, district: a.district, city: a.city, uf: a.state, ibgeCode: await municipalityCode(client) } },
      serviceDescription: charge.description, serviceItem: settings.defaultServiceItem, municipalTaxCode: settings.defaultMunicipalTaxCode, cnae: settings.defaultCnae, nbs: settings.defaultNbs,
      amount: Number(charge.amount), issRate: Number(settings.defaultIssRate), issRetained: false,
      competenceDate: charge.paidAt ? todayInBrazil(new Date(charge.paidAt)) : todayInBrazil(),
    })
    if (!parsed.success) throw Error(`Complete os dados fiscais: ${parsed.error.issues.map(issue => issue.message).join("; ")}`)
    // Reservation and the unique charge/environment index also protect against manual issuance racing this worker.
    const [reserved] = await db.update(fiscalSettings).set({ nextRpsNumber: sql`${fiscalSettings.nextRpsNumber} + 1` }).where(and(eq(fiscalSettings.id, "default"), eq(fiscalSettings.environment, job.environment), eq(fiscalSettings.autoIssueOnPayment, true))).returning()
    if (!reserved) throw Error("O ambiente fiscal mudou durante a emissão. Revise a configuração.")
    const rps = reserved.nextRpsNumber - 1
    const [created] = await db.insert(invoices).values({ ...invoiceFieldsFromInput(parsed.data), status: "processando", environment: job.environment, rpsSeries: reserved.rpsSeries ?? "A", rpsNumber: rps, lote: rps }).onConflictDoNothing().returning()
    if (!created) {
      await saveJob(job, { status: "review", error: "Outra emissão já vinculou uma nota a esta cobrança. Confira a lista de notas." })
      return
    }
    invoice = created
    await saveJob(job, { status: "processing", invoiceId: invoice.id })
    const response = await emitirNfse(token, buildEmitBody(invoice, reserved, rps))
    await db.update(invoices).set(applyLoteResponse(response, invoice)).where(eq(invoices.id, invoice.id))
    await saveJob(job, { status: "completed", invoiceId: invoice.id, error: null })
  } catch (error) {
    // Do not expose request/response contents or credentials from provider errors.
    const message = invoice ? "Não foi possível confirmar a transmissão. Consulte a nota e o painel Brasil NFe antes de reenviar." : error instanceof Error ? error.message : "Falha ao preparar a emissão automática."
    if (invoice) await db.update(invoices).set({ errorMessage: message, updatedAt: new Date() }).where(eq(invoices.id, invoice.id))
    await saveJob(job, { status: invoice ? "review" : "blocked", error: message, ...(invoice ? { invoiceId: invoice.id } : {}) })
  }
}

/** Recovery worker processes persisted pending attempts, including work interrupted before the send. */
export async function processPendingFiscalJobs(): Promise<void> {
  const rows = await db.select({ id: crmRecords.id }).from(crmRecords).where(and(eq(crmRecords.resource, RESOURCE), sql`(${crmRecords.data}->>'status' = 'pending' or (${crmRecords.data}->>'status' = 'processing' and ${crmRecords.updatedAt} < now() - interval '2 minutes'))`)).limit(20)
  for (const row of rows) await processFiscalJob(row.id)
}
