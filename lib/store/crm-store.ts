"use client"

import { canUseResource } from "@/lib/data/resource-policy"
import { getCrmIdentity } from "@/lib/auth/user-actions"
import { useUiStore } from "@/lib/store/ui-store"
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
import { initialDatabase } from "@/lib/data/initial"
import { conversionChanges } from "@/lib/data/conversion-lifecycle"
import { projectReceivables } from "@/lib/data/project-receivables"
import { firstMonthlyReceivable, monthlyForecastChanges, subscriptionForDeal } from "@/lib/data/deal-subscription"
import { clientForLead } from "@/lib/data/lead-conversion"

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
  catalog: "catalog", addons: "addons", hostingPlans: "hostingPlans", pipelines: "pipelines", lostReasons: "lostReasons", quickMessages: "quickMessages", financialCategories: "financialCategories", projects: "projects", contracts: "contracts", notifications: "notifications", integrationLogs: "integrationLogs",
  leads: "leads",
  deals: "deals",
  quotes: "quotes",
  clients: "clients",
  charges: "charges",
  subscriptions: "subscriptions",
  entries: "entries",
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



export const useCrmStore = create<CrmState>()((set, get) => ({
  ...structuredClone(initialDatabase),
  status: "idle",
  currentUserId: "",

  bootstrap: async () => {
    if (get().status === "loading" || get().status === "ready") return
    set({ status: "loading" })
    try {
      const data = await api.getDatabase()
      const identity = await getCrmIdentity()
      useUiStore.getState().setRole(identity.current.role)
      set({ ...data, currentUserId: identity.current.id, status: "ready" })
    } catch {
      set({ status: "error" })
    }
  },

  add: (key, item) => {
    set((s) => ({ [key]: [item, ...(s[key] as WithId[])] }) as Partial<CrmState>)
    const resource = collectionResource[key]
    if (resource && canUseResource(useUiStore.getState().role, resource, "write")) void api.createResource(resource, item).catch(() => {})
    if (key === "subscriptions") {
      const subscription = get().subscriptions.find(value => value.id === item.id)
      const receivable = subscription && subscription.dealId && firstMonthlyReceivable(subscription, get().charges)
      if (receivable) {
        get().add("charges", receivable.charge)
        get().add("entries", receivable.entry)
      }
    }
    return item
  },

  update: (key, id, patch) => {
    set((s) => ({ [key]: (s[key] as WithId[]).map((it) => (it.id === id ? { ...it, ...patch } : it)) }) as Partial<CrmState>)
    const resource = collectionResource[key]
    if (resource && canUseResource(useUiStore.getState().role, resource, "write")) void api.updateResource(resource, id, patch).catch(() => {})
    if (key === "deals") {
      const deal = get().deals.find(item => item.id === id)
      if (deal) {
        const receivables = projectReceivables(deal, get().charges)
        for (const charge of receivables.remove) {
          get().remove("charges", charge.id)
          for (const entry of get().entries.filter(item => item.chargeId === charge.id)) get().remove("entries", entry.id)
        }
        for (const record of receivables.records) {
          if (get().charges.some(item => item.id === record.charge.id)) get().update("charges", record.charge.id, record.charge)
          else get().add("charges", record.charge)
          if (get().entries.some(item => item.id === record.entry.id)) get().update("entries", record.entry.id, record.entry)
          else get().add("entries", record.entry)
        }
      }
      const state = get()
      for (const change of conversionChanges(state.deals, state.clients, state.subscriptions, state.charges, state.entries)) {
        get().update(change.resource, change.id, change.data)
      }
    }
    if (key === "deals" || key === "charges") {
      for (const deal of get().deals) {
        const subscription = subscriptionForDeal(deal, get().subscriptions, get().charges)
        if (!subscription) continue
        const existing = get().subscriptions.find(item => item.id === subscription.id)
        if (!existing) get().add("subscriptions", subscription)
        else if (JSON.stringify(existing) !== JSON.stringify(subscription)) get().update("subscriptions", subscription.id, subscription)
        const correction = monthlyForecastChanges(subscription, get().charges)
        if (correction) {
          const { charge, patch } = correction
          if (Object.entries(patch).some(([key, value]) => charge[key as keyof typeof charge] !== value)) get().update("charges", charge.id, patch)
          for (const entry of get().entries.filter(item => item.chargeId === charge.id && item.status !== "pago")) {
            if (Object.entries(patch).some(([key, value]) => entry[key as keyof typeof entry] !== value)) get().update("entries", entry.id, { ...patch, ...(patch.dueDate ? { competenceDate: patch.dueDate } : {}) })
          }
        }
        const first = firstMonthlyReceivable(subscription, get().charges)
        if (first) { get().add("charges", first.charge); get().add("entries", first.entry) }
      }
    }
    if (key === "leads") {
      const lead = get().leads.find((item) => item.id === id)
      if (lead?.status === "convertido") {
        const client = clientForLead(lead, get().clients)
        if (!get().clients.some((item) => item.id === client.id)) get().add("clients", client)
        // Atualiza o vínculo diretamente para não repetir a conversão no update.
        if (lead.clientId !== client.id) {
          set((state) => ({ leads: state.leads.map((item) => item.id === id ? { ...item, clientId: client.id } : item) }))
          void api.updateResource("leads", id, { clientId: client.id })
        }
        for (const deal of get().deals.filter((item) => item.leadId === id && item.clientId !== client.id)) {
          get().update("deals", deal.id, { clientId: client.id })
        }
      }
    }
  },

  remove: (key, id) => {
    set((s) => ({ [key]: (s[key] as WithId[]).filter((it) => it.id !== id) }) as Partial<CrmState>)
    const resource = collectionResource[key]
    if (resource && canUseResource(useUiStore.getState().role, resource, "write")) void api.deleteResource(resource, id).catch(() => {})
  },

  replace: (key, items) => set({ [key]: items } as Partial<CrmState>),

  setSingleton: (key, value) => {
    set({ [key]: value } as Partial<CrmState>)
    void api.updateResource("settings", key, { [key]: value }).catch(() => {})
  },

  logActivity: (activity) => {
    const entry: Activity = { ...activity, id: newId("act"), authorId: activity.authorId ?? get().currentUserId, createdAt: new Date().toISOString() }
    set((s) => ({ activities: [entry, ...s.activities] }))
    void api.createResource("activities", entry).catch(() => {})
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
    const leadStatus: Lead["status"] =
      get().deals.some(item => item.leadId === deal.leadId && item.stage === "ganho") ? "convertido" : stage === "perdido" ? "perdido" : stage === "novo_lead" ? "novo" : stage === "contato_feito" || stage === "call_agendada" ? "em_contato" : "qualificado"
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
    void api.updateResource("integrations", key, patch).catch(() => {})
  },

  markNotificationsRead: (ids) => {
    for (const notification of get().notifications) if (!ids || ids.includes(notification.id)) get().update("notifications", notification.id, { read: true })
  },
}))
