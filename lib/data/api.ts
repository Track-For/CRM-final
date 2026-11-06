/** Acesso aos registros persistidos do CRM, sem dados de demonstração. */
import { getGoogleCalendarState } from "@/lib/google-calendar/actions"
import { sendWhatsappText } from "@/lib/whatsapp/actions"
import type { Charge, ID, Invoice } from "@/types"
import type { MockDatabase } from "@/lib/mock"
import { initialDatabase } from "@/lib/data/initial"
import { deleteRecord, loadRecordOverlay, saveRecord, type RecordOverlay } from "@/lib/data/records-actions"

const LATENCY_MS = 450

const delay = <T,>(value: T, ms = LATENCY_MS) => new Promise<T>((resolve) => setTimeout(() => resolve(structuredClone(value)), ms))

/* ------------------------------ Leitura ------------------------------ */

/** Carga inicial com os registros criados no banco e a agenda conectada. */
export async function getDatabase(): Promise<MockDatabase> {
  const [data, overlay, google] = await Promise.all([Promise.resolve(structuredClone(initialDatabase)), loadRecordOverlay().catch(() => [] as RecordOverlay[]), getGoogleCalendarState().catch(() => null)])
  const result = applyOverlay(data, overlay)
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
    if (!Array.isArray(list)) {
      if (resource === "settings") {
        for (const record of records.filter(record => !record.deleted)) {
          for (const key of ["company", "pricingRules"] as const) {
            const value = record.data[key]
            if (value && typeof value === "object" && !Array.isArray(value)) {
              Object.assign(data[key], value)
            }
          }
        }
      }
      continue
    }
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
export const getQuotes = async () => (await getDatabase()).quotes
export const getClients = async () => (await getDatabase()).clients
export const getCharges = async () => (await getDatabase()).charges
export const getSubscriptions = async () => (await getDatabase()).subscriptions
export const getEntries = async () => (await getDatabase()).entries
export const getInvoices = async () => (await getDatabase()).invoices
export const getEvents = async () => (await getGoogleCalendarState()).events
export const getTasks = async () => (await getDatabase()).tasks
export const getForms = async () => (await getDatabase()).forms
export const getPublicForm = async (slug: string) => (await getForms()).find((f) => f.slug === slug && f.active) ?? null
export const getIntegrations = async () => (await getDatabase()).integrations
export const getIntegrationLogs = async () => (await getDatabase()).integrationLogs
export const getSettings = async () => {
  const data = await getDatabase()
  return { company: data.company, users: data.users, pipelines: data.pipelines, catalog: data.catalog, addons: data.addons, hostingPlans: data.hostingPlans, pricingRules: data.pricingRules, quickMessages: data.quickMessages, lostReasons: data.lostReasons, financialCategories: data.financialCategories }
}

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
const PERSISTED = new Set<Resource>(["leads", "deals", "quotes", "clients", "charges", "subscriptions", "entries", "events", "tasks", "forms", "notes", "activities", "messages", "webhooks", "apiKeys", "settings"])

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

