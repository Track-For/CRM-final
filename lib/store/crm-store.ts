"use client"

import { create } from "zustand"
import type {
  Activity,
  Deal,
  DealHistoryEntry,
  ID,
  Integration,
  IntegrationKey,
  Lead,
  StageKey,
  Task,
  TaskStatus,
} from "@/types"
import type { MockDatabase } from "@/lib/mock"
import * as api from "@/lib/data/api"

type WithId = { id: ID }

/** Coleções que são listas de entidades com `id` (CRUD genérico). */
export type CollectionKey = {
  [K in keyof MockDatabase]: MockDatabase[K] extends WithId[] ? K : never
}[keyof MockDatabase]

export type EntityOf<K extends CollectionKey> = MockDatabase[K][number]

type SingletonKey = "pricingRules" | "company" | "adSpend"

export interface CrmState extends MockDatabase {
  status: "idle" | "loading" | "ready" | "error"
  currentUserId: ID
  bootstrap: () => Promise<void>

  /* CRUD genérico — use nas telas quando não houver ação específica */
  add: <K extends CollectionKey>(key: K, item: EntityOf<K>) => EntityOf<K>
  update: <K extends CollectionKey>(key: K, id: ID, patch: Partial<EntityOf<K>>) => void
  remove: <K extends CollectionKey>(key: K, id: ID) => void
  replace: <K extends CollectionKey>(key: K, items: EntityOf<K>[]) => void
  setSingleton: <K extends SingletonKey>(key: K, value: MockDatabase[K]) => void

  /* Ações de domínio */
  logActivity: (activity: Omit<Activity, "id" | "createdAt" | "authorId"> & { authorId?: ID }) => void
  moveDeal: (dealId: ID, stage: StageKey, extra?: { lostReasonId?: ID; lostNote?: string }) => void
  moveTask: (taskId: ID, status: TaskStatus, orderedIds?: ID[]) => void
  sendWhatsapp: (leadId: ID, text: string) => Promise<void>
  updateIntegration: (key: IntegrationKey, patch: Partial<Integration>) => void
  markNotificationsRead: (ids?: ID[]) => void
}

const collectionResource: Partial<Record<CollectionKey, api.Resource>> = {
  leads: "leads",
  deals: "deals",
  quotes: "quotes",
  clients: "clients",
  charges: "charges",
  subscriptions: "subscriptions",
  entries: "entries",
  invoices: "invoices",
  events: "events",
  tasks: "tasks",
  forms: "forms",
  notes: "notes",
  activities: "activities",
  messages: "messages",
  webhooks: "webhooks",
  apiKeys: "apiKeys",
}

export function newId(prefix: string): ID {
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`
}

const emptyDb: MockDatabase = {
  users: [],
  pipelines: [],
  lostReasons: [],
  catalog: [],
  addons: [],
  hostingPlans: [],
  pricingRules: { minPrice: 0, expressPercent: 0, cashDiscountPercent: 0, maxInstallments: 1, extraPagePrice: 0, extraLanguagePercent: 0, quoteValidityDays: 15 },
  financialCategories: [],
  quickMessages: [],
  company: { name: "", legalName: "", cnpj: "", municipalRegistration: "", email: "", whatsapp: "", website: "", address: { zip: "", street: "", number: "", district: "", city: "", state: "" } },
  integrations: [],
  leads: [],
  deals: [],
  quotes: [],
  clients: [],
  projects: [],
  contracts: [],
  subscriptions: [],
  charges: [],
  entries: [],
  invoices: [],
  events: [],
  tasks: [],
  activities: [],
  notes: [],
  messages: [],
  forms: [],
  webhooks: [],
  apiKeys: [],
  whatsappInstances: [],
  integrationLogs: [],
  notifications: [],
  adSpend: [],
}

export const useCrmStore = create<CrmState>()((set, get) => ({
  ...emptyDb,
  status: "idle",
  currentUserId: "usr_rafael",

  bootstrap: async () => {
    if (get().status === "loading" || get().status === "ready") return
    set({ status: "loading" })
    try {
      const data = await api.getDatabase()
      set({ ...data, status: "ready" })
    } catch {
      set({ status: "error" })
    }
  },

  add: (key, item) => {
    set((s) => ({ [key]: [item, ...(s[key] as WithId[])] }) as Partial<CrmState>)
    const resource = collectionResource[key]
    if (resource) void api.createResource(resource, item)
    return item
  },

  update: (key, id, patch) => {
    set((s) => ({ [key]: (s[key] as WithId[]).map((it) => (it.id === id ? { ...it, ...patch } : it)) }) as Partial<CrmState>)
    const resource = collectionResource[key]
    if (resource) void api.updateResource(resource, id, patch)
  },

  remove: (key, id) => {
    set((s) => ({ [key]: (s[key] as WithId[]).filter((it) => it.id !== id) }) as Partial<CrmState>)
    const resource = collectionResource[key]
    if (resource) void api.deleteResource(resource, id)
  },

  replace: (key, items) => set({ [key]: items } as Partial<CrmState>),

  setSingleton: (key, value) => {
    set({ [key]: value } as Partial<CrmState>)
    void api.updateResource("settings", key, { [key]: value })
  },

  logActivity: (activity) => {
    const entry: Activity = { ...activity, id: newId("act"), authorId: activity.authorId ?? get().currentUserId, createdAt: new Date().toISOString() }
    set((s) => ({ activities: [entry, ...s.activities] }))
    void api.createResource("activities", entry)
  },

  moveDeal: (dealId, stage, extra) => {
    const deal = get().deals.find((d) => d.id === dealId)
    if (!deal || deal.stage === stage) return
    const now = new Date().toISOString()
    const pipeline = get().pipelines.find((p) => p.id === deal.pipelineId)
    const probability = pipeline?.stages.find((s) => s.key === stage)?.probability ?? deal.probability
    const entry: DealHistoryEntry = {
      id: newId("dh"),
      type: stage === "ganho" ? "won" : stage === "perdido" ? "lost" : "stage",
      description: stage === "ganho" ? "Negócio ganho" : stage === "perdido" ? "Negócio marcado como perdido" : "Movido de etapa",
      authorId: get().currentUserId,
      createdAt: now,
      fromStage: deal.stage,
      toStage: stage,
    }
    const patch: Partial<Deal> = {
      stage,
      probability,
      stageChangedAt: now,
      history: [...deal.history, entry],
      wonAt: stage === "ganho" ? now : undefined,
      lostAt: stage === "perdido" ? now : undefined,
      lostReasonId: stage === "perdido" ? extra?.lostReasonId : undefined,
      lostNote: stage === "perdido" ? extra?.lostNote : undefined,
    }
    get().update("deals", dealId, patch)
    const leadStatus: Lead["status"] | undefined =
      stage === "ganho" ? "convertido" : stage === "perdido" ? "perdido" : stage === "proposta_enviada" || stage === "negociacao" ? "qualificado" : undefined
    if (leadStatus) get().update("leads", deal.leadId, { status: leadStatus, updatedAt: now })
    get().logActivity({ type: "negocio", title: `${deal.title}: ${entry.description.toLowerCase()}`, leadId: deal.leadId, dealId })
  },

  moveTask: (taskId, status, orderedIds) => {
    set((s) => {
      let tasks: Task[] = s.tasks.map((t) => (t.id === taskId ? { ...t, status } : t))
      if (orderedIds) {
        const order = new Map(orderedIds.map((id, i) => [id, i]))
        tasks = tasks.map((t) => (order.has(t.id) ? { ...t, order: order.get(t.id)! } : t))
      }
      return { tasks }
    })
    void api.updateResource("tasks", taskId, { status })
  },

  sendWhatsapp: async (leadId, text) => {
    const lead = get().leads.find((l) => l.id === leadId)
    if (!lead) throw new Error("Lead não encontrado")
    await api.actions.sendWhatsapp(lead.whatsapp, text)
  },

  updateIntegration: (key, patch) => {
    set((s) => ({ integrations: s.integrations.map((i) => (i.key === key ? { ...i, ...patch } : i)) }))
    void api.updateResource("integrations", key, patch)
  },

  markNotificationsRead: (ids) =>
    set((s) => ({ notifications: s.notifications.map((n) => (!ids || ids.includes(n.id) ? { ...n, read: true } : n)) })),
}))
