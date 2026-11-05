/**
 * Camada de acesso a dados.
 *
 * HOJE: cada função devolve o mock em memória com uma latência simulada.
 * DEPOIS: troque o corpo de cada função por um fetch para a API, mantendo
 * a mesma assinatura. As telas nunca importam o mock direto — elas usam os
 * hooks de `@/lib/data` (que leem o store abastecido por estas funções).
 */
import { getGoogleCalendarState } from "@/lib/google-calendar/actions"
import { sendWhatsappText } from "@/lib/whatsapp/actions"
import type { Charge, ID, Invoice } from "@/types"
import { createMockDatabase, type MockDatabase } from "@/lib/mock"
import { deleteRecord, loadRecordOverlay, saveRecord, type RecordOverlay } from "@/lib/data/records-actions"

const LATENCY_MS = 450

let db: MockDatabase | null = null
function mock(): MockDatabase {
  if (!db) db = createMockDatabase(new Date())
  return db
}

const delay = <T,>(value: T, ms = LATENCY_MS) => new Promise<T>((resolve) => setTimeout(() => resolve(structuredClone(value)), ms))

/* ------------------------------ Leitura ------------------------------ */

/** Carga inicial completa: o mock com as alterações salvas no banco aplicadas por cima. */
export async function getDatabase(): Promise<MockDatabase> {
  const [data, overlay, google] = await Promise.all([delay(mock()), loadRecordOverlay().catch(() => [] as RecordOverlay[]), getGoogleCalendarState().catch(() => null)])
  // Leads e vendas são carregados somente dos registros criados no banco.
  const result = applyOverlay({ ...data, leads: [], deals: [] }, overlay)
  // A agenda é abastecida exclusivamente pela conexão Google do usuário.
  result.events = google?.events || []
  if (google && !result.users.some(user => user.id === google.owner.id)) result.users.push(google.owner)
  return result
}

/** JSON não guarda `undefined`: campos limpos viajam como null e voltam a ser undefined aqui. */
function fromStored(data: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(data).filter(([, v]) => v !== null))
}

function toStored<T>(value: T): Record<string, unknown> {
  return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([k, v]) => [k, v === undefined ? null : v]))
}

function applyOverlay(data: MockDatabase, overlay: RecordOverlay[]): MockDatabase {
  const byResource = new Map<string, RecordOverlay[]>()
  for (const r of overlay) byResource.set(r.resource, [...(byResource.get(r.resource) ?? []), r])
  const out = { ...data } as unknown as Record<string, { id: ID }[]>
  for (const [resource, records] of byResource) {
    const list = out[resource]
    if (!Array.isArray(list)) continue
    const changes = new Map(records.map((r) => [r.id, r]))
    const merged = list.flatMap((item) => {
      const r = changes.get(item.id)
      if (!r) return [item]
      changes.delete(item.id)
      if (r.deleted) return []
      const patch = fromStored(r.data)
      const cleared = Object.keys(r.data).filter((k) => r.data[k] === null)
      const next = { ...item, ...patch } as Record<string, unknown>
      for (const k of cleared) delete next[k]
      return [next as { id: ID }]
    })
    const created = [...changes.values()].filter((r) => r.created && !r.deleted).map((r) => ({ ...fromStored(r.data), id: r.id }) as { id: ID })
    out[resource] = [...created, ...merged]
  }
  return out as unknown as MockDatabase
}

export const getLeads = async () => (await getDatabase()).leads
export const getLead = async (id: ID) => (await getLeads()).find(lead => lead.id === id) ?? null
export const getDeals = async () => (await getDatabase()).deals
export const getDeal = async (id: ID) => (await getDeals()).find(deal => deal.id === id) ?? null
export const getQuotes = () => delay(mock().quotes) // GET /api/quotes
export const getClients = () => delay(mock().clients) // GET /api/clients
export const getCharges = () => delay(mock().charges) // GET /api/charges
export const getSubscriptions = () => delay(mock().subscriptions) // GET /api/subscriptions
export const getEntries = () => delay(mock().entries) // GET /api/financial-entries
export const getInvoices = () => delay(mock().invoices) // GET /api/invoices
export const getEvents = async () => (await getGoogleCalendarState()).events
export const getTasks = () => delay(mock().tasks) // GET /api/tasks
export const getForms = () => delay(mock().forms) // GET /api/forms
export const getPublicForm = (slug: string) => delay(mock().forms.find((f) => f.slug === slug && f.active) ?? null) // GET /api/public/forms/:slug
export const getIntegrations = () => delay(mock().integrations) // GET /api/integrations
export const getIntegrationLogs = () => delay(mock().integrationLogs) // GET /api/integrations/logs
export const getSettings = () =>
  delay({
    company: mock().company,
    users: mock().users,
    pipelines: mock().pipelines,
    catalog: mock().catalog,
    addons: mock().addons,
    hostingPlans: mock().hostingPlans,
    pricingRules: mock().pricingRules,
    quickMessages: mock().quickMessages,
    lostReasons: mock().lostReasons,
    financialCategories: mock().financialCategories,
  }) // GET /api/settings

/* ------------------------------ Escrita ------------------------------ */
/*
 * As mutações abaixo são chamadas pelo store depois da atualização otimista.
 * As coleções em PERSISTED são gravadas no banco (crm_records) e reaplicadas na carga inicial.
 */

export type Resource =
  | "leads"
  | "deals"
  | "quotes"
  | "clients"
  | "charges"
  | "subscriptions"
  | "entries"
  | "invoices"
  | "events"
  | "tasks"
  | "forms"
  | "notes"
  | "activities"
  | "messages"
  | "webhooks"
  | "apiKeys"
  | "settings"
  | "integrations"

/** Coleções gravadas no banco (crm_records). As demais seguem só em memória. */
const PERSISTED = new Set<Resource>(["leads", "deals", "quotes", "clients", "charges", "subscriptions", "entries", "events", "tasks", "forms", "notes", "activities", "messages", "webhooks", "apiKeys"])

function persist(job: () => Promise<void>) {
  job().catch((err) => console.error("[crm] Falha ao salvar alteração", err))
}

export async function createResource<T>(resource: Resource, data: T): Promise<T> {
  const id = (data as { id?: ID }).id
  if (PERSISTED.has(resource) && id) persist(() => saveRecord(resource, id, toStored(data), true))
  return structuredClone(data)
}

export async function updateResource<T>(resource: Resource, id: ID, patch: Partial<T>): Promise<Partial<T>> {
  if (PERSISTED.has(resource)) persist(() => saveRecord(resource, id, toStored(patch)))
  return structuredClone(patch)
}

export async function deleteResource(resource: Resource, id: ID): Promise<void> {
  if (PERSISTED.has(resource)) persist(() => deleteRecord(resource, id))
}

/** Ações que na API real disparam integrações (Asaas, Brasil NFe, Evolution). */
export const actions = {
  sendWhatsapp: sendWhatsappText,
  issueInvoice: async (invoice: Invoice) => delay({ ...invoice, status: "processando" as const }, 300), // POST /api/invoices
  createCharge: async (charge: Charge) => delay(charge, 300), // POST /api/charges (Asaas)
  testWebhook: async (url: string) => delay({ url, status: 200, ms: 182 }, 700), // POST /api/webhooks/test
  submitPublicForm: async (slug: string, data: Record<string, string>) => delay({ slug, data, ok: true }, 600), // POST /api/public/forms/:slug
}

