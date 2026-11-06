"use client"

/**
 * Ponto único de leitura/escrita das telas.
 * - Hooks `useX()` leem do store (abastecido por `api.ts`).
 * - `useCrm(selector)` dá acesso às ações (add/update/remove/moveDeal...).
 * Ao plugar a API, só `api.ts` (e eventualmente o bootstrap) muda.
 */
import { useMemo } from "react"
import { useCrmStore, type CollectionKey, type EntityOf } from "@/lib/store/crm-store"
import type { ID } from "@/types"

export { newId } from "@/lib/store/crm-store"
export type { CollectionKey, EntityOf } from "@/lib/store/crm-store"
export * as api from "./api"

export const useCrm = useCrmStore

export function useIsReady() {
  return useCrmStore((s) => s.status === "ready")
}

export function useCollection<K extends CollectionKey>(key: K): EntityOf<K>[] {
  return useCrmStore((s) => s[key] as EntityOf<K>[])
}

export function useEntity<K extends CollectionKey>(key: K, id: ID | undefined | null): EntityOf<K> | undefined {
  return useCrmStore((s) => (id ? (s[key] as EntityOf<K>[]).find((it) => it.id === id) : undefined))
}

/** Map id → entidade, memoizado. Útil para resolver nomes em tabelas. */
export function useById<K extends CollectionKey>(key: K): Map<ID, EntityOf<K>> {
  const list = useCollection(key)
  return useMemo(() => new Map(list.map((it) => [it.id, it] as const)), [list])
}

export const useLeads = () => useCollection("leads")
export const useLead = (id?: ID) => useEntity("leads", id)
export const useDeals = () => useCollection("deals")
export const useDeal = (id?: ID) => useEntity("deals", id)
export const useQuotes = () => useCollection("quotes")
export const useQuote = (id?: ID) => useEntity("quotes", id)
export const useClients = () => {
  const clients = useCollection("clients")
  return useMemo(() => clients.filter(client => !client.conversionReverted && !client.deletedAt), [clients])
}
export const useClient = (id?: ID) => useEntity("clients", id)
export const useProjects = () => useCollection("projects")
export const useContracts = () => useCollection("contracts")
export const useSubscriptions = () => useCollection("subscriptions")
export const useCharges = () => {
  const charges = useCollection("charges")
  return useMemo(() => charges.filter(charge => !charge.conversionReverted && !charge.awaitingProjectPayment), [charges])
}
export const useEntries = () => {
  const entries = useCollection("entries")
  return useMemo(() => entries.filter(entry => !entry.conversionReverted && !entry.awaitingProjectPayment), [entries])
}
export const useInvoices = () => useCollection("invoices")
export const useEvents = () => useCollection("events")
export const useTasks = () => useCollection("tasks")
export const useActivities = () => useCollection("activities")
export const useNotes = () => useCollection("notes")
export const useMessages = () => useCollection("messages")
export const useForms = () => useCollection("forms")
export const useUsers = () => useCollection("users")
export const usePipelines = () => useCollection("pipelines")
export const useLostReasons = () => useCollection("lostReasons")
export const useCatalog = () => useCollection("catalog")
export const useAddons = () => useCollection("addons")
export const useHostingPlans = () => useCollection("hostingPlans")
export const useFinancialCategories = () => useCollection("financialCategories")
export const useQuickMessages = () => useCollection("quickMessages")
export const useWebhooks = () => useCollection("webhooks")
export const useApiKeys = () => useCollection("apiKeys")
export const useWhatsappInstances = () => useCollection("whatsappInstances")
export const useIntegrationLogs = () => useCollection("integrationLogs")
export const useNotifications = () => useCollection("notifications")

export const usePricingRules = () => useCrmStore((s) => s.pricingRules)
export const useCompany = () => useCrmStore((s) => s.company)
export const useAdSpend = () => useCrmStore((s) => s.adSpend)
export const useIntegrations = () => useCrmStore((s) => s.integrations)
export const useCurrentUser = () => useCrmStore((s) => s.users.find((u) => u.id === s.currentUserId))
