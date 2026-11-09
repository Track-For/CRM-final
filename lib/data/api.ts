/** Acesso aos registros persistidos do CRM, sem dados de demonstração. */
import { getCrmIdentity } from "@/lib/auth/user-actions"
import { toast } from "sonner"
import { testWebhookAction } from "@/lib/integrations/actions"
import { resourcePolicy } from "@/lib/data/resource-policy"
import { getGoogleCalendarState } from "@/lib/google-calendar/actions"
import { sendWhatsappText } from "@/lib/whatsapp/actions"
import type { ID } from "@/types"
import type { MockDatabase } from "@/lib/mock"
import { initialDatabase } from "@/lib/data/initial"
import { deleteRecord, loadRecordOverlay, saveRecord, type RecordOverlay } from "@/lib/data/records-actions"

/* ------------------------------ Leitura ------------------------------ */

/** Carga inicial com os registros criados no banco e a agenda conectada. */
export async function getDatabase(): Promise<MockDatabase> {
  const [data, overlay, google] = await Promise.all([Promise.resolve(structuredClone(initialDatabase)), loadRecordOverlay(), getGoogleCalendarState().catch(() => null)])
  if (overlay.some(row => row.resource === "settings" && row.id === "company" && (row.data.company as { businessProfile?: unknown } | undefined)?.businessProfile)) data.pipelines = []
  const result = applyOverlay(data, overlay)
  const identity = await getCrmIdentity()
  result.users = identity.users
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
    if (resource === "integrations") {
      data.integrations = data.integrations.map(item => {
        const record = records.find(row => row.id === item.key && !row.deleted)
        return record ? { ...item, ...fromStored(record.data) } : item
      })
      out.integrations = data.integrations as unknown as { id: ID }[]
      continue
    }
    const list = out[resource]
    if (!Array.isArray(list)) {
      if (resource === "settings") {
        for (const record of records.filter(record => !record.deleted)) {
          if (Array.isArray(record.data.adSpend)) out.adSpend = record.data.adSpend as unknown as { id: ID }[]
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
  | "catalog" | "addons" | "hostingPlans" | "pipelines" | "lostReasons" | "quickMessages" | "financialCategories" | "projects" | "contracts" | "notifications" | "integrationLogs"

/** Coleções gravadas no banco (crm_records). As demais seguem só em memória. */
const PERSISTED = new Set(Object.keys(resourcePolicy))
const pending = new Set<Promise<void>>()
const queues = new Map<string, Promise<void>>()

function persist(key: string, job: () => Promise<void>) {
  const previous = queues.get(key) ?? Promise.resolve()
  const task = previous.catch(() => {}).then(job)
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent("crm-save-pending", { detail: 1 }))
  queues.set(key, task)
  pending.add(task)
  task.catch(() => {
    toast.error("Alteração não salva", { description: "Confira sua conexão e permissões. Recarregue os dados antes de continuar.", duration: 10000 })
    if (typeof window !== "undefined") window.dispatchEvent(new Event("crm-save-error"))
  }).finally(() => { pending.delete(task); if (queues.get(key) === task) queues.delete(key); if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent("crm-save-pending", { detail: -1 })) })
  return task
}

export async function flushPendingWrites() {
  while (pending.size) await Promise.all([...pending])
}
export const hasPendingWrites = () => pending.size > 0

export async function createResource<T>(resource: Resource, data: T): Promise<T> {
  const id = (data as { id?: ID }).id
  if (PERSISTED.has(resource) && id) await persist(`${resource}:${id}`, () => saveRecord(resource, id, toStored(data), true))
  return structuredClone(data)
}

export async function updateResource<T>(resource: Resource, id: ID, patch: Partial<T>): Promise<Partial<T>> {
  if (PERSISTED.has(resource)) await persist(`${resource}:${id}`, () => saveRecord(resource, id, toStored(patch)))
  return structuredClone(patch)
}

export async function deleteResource(resource: Resource, id: ID): Promise<void> {
  if (PERSISTED.has(resource)) await persist(`${resource}:${id}`, () => deleteRecord(resource, id))
}

/** Ações que na API real disparam integrações (Asaas, Brasil NFe, Evolution). */
export const actions = {
  sendWhatsapp: sendWhatsappText,
  testWebhook: testWebhookAction,
}
