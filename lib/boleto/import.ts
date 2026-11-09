// Consulta somente GET no Asaas. A persistência abaixo altera apenas o CRM.
import { and, eq } from "drizzle-orm"
import { crmRecords, db } from "@/lib/db"
import { decryptSecret } from "@/lib/fiscal/crypto"
import { createAsaasClient, mapAsaasStatus } from "./asaas"
import { loadBillingSettings } from "./sync"
import { mergeRecord } from "./records"
import { asaasSubscriptionSnapshot, importedReceivable, matchAsaasCharge, matchAsaasClient, matchAsaasSubscription } from "./import-normalize"
import type { Charge, Client, Subscription } from "@/types"

export type ImportResult = { connected: boolean; imported: number; unmatched: number; linkedClients: number }
let lastKey = ""
let lastSync = 0
let lastResult: ImportResult = { connected: false, imported: 0, unmatched: 0, linkedClients: 0 }
let flight: Promise<ImportResult> | null = null

export async function syncAsaasReceivables(force = false): Promise<ImportResult> {
  const settings = await loadBillingSettings()
  if (!settings.apiKeyEncrypted) return { connected: false, imported: 0, unmatched: 0, linkedClients: 0 }
  const key = `${settings.environment}:${settings.apiKeyEncrypted}`
  if (flight) return flight
  if (!force && key === lastKey && Date.now() - lastSync < 60_000) return lastResult
  flight = (async () => {
    const environment = settings.environment
    const api = createAsaasClient(decryptSecret(settings.apiKeyEncrypted!), environment)
    const [customers, payments] = await Promise.all([api.listCustomers(), api.listPayments()])
    const rows = await db.select().from(crmRecords)
    const clients = rows.filter(row => row.resource === "clients" && !row.deleted).map(row => row.data as unknown as Client)
    const subscriptions = rows.filter(row => row.resource === "subscriptions" && !row.deleted).map(row => row.data as unknown as Subscription)
    const charges = rows.filter(row => row.resource === "charges" && !row.deleted).map(row => row.data as unknown as Charge)
    const matches = new Map<string, Client>()
    for (const customer of customers.filter(customer => !customer.deleted)) {
      const client = matchAsaasClient(customer, clients, environment)
      if (!client) continue
      matches.set(customer.id, client)
      if (client.asaasCustomerId !== customer.id || client.asaasEnvironment !== environment) {
        const patch = { asaasCustomerId: customer.id, asaasEnvironment: environment }
        await db.update(crmRecords).set({ data: { ...client, ...patch }, updatedAt: new Date() }).where(and(eq(crmRecords.resource, "clients"), eq(crmRecords.id, client.id)))
        Object.assign(client, patch)
      }
    }
    // Não deduz exclusão pela ausência na listagem: consulta pontual dos registros conhecidos.
    const seen = new Set(payments.map(payment => payment.id))
    for (const charge of charges.filter(charge => charge.importedFromAsaas && charge.gatewayEnvironment === environment && charge.gatewayId && !seen.has(charge.gatewayId))) {
      try { payments.push(await api.getPayment(charge.gatewayId!)) }
      catch (error) { if (!(error instanceof Error && "status" in error && error.status === 404)) throw error }
    }
    let imported = 0
    let unmatched = 0
    for (const payment of payments) {
      // A emissão nativa materializa as parcelas com IDs estáveis. Não importe
      // cópias enquanto ela ainda estiver finalizando (ou aguardando consulta).
      const root = charges.find(charge => charge.id === payment.externalReference && charge.paymentChannel === "asaas" && charge.paymentTerms)
      if (root && !charges.some(charge => charge.gatewayId === payment.id && charge.gatewayEnvironment === environment)) continue
      const client = payment.customer ? matches.get(payment.customer) : undefined
      if (!client) { unmatched++; continue }
      const subscription = matchAsaasSubscription(payment, client, subscriptions, environment)
      const existing = matchAsaasCharge(payment, client, charges, environment, subscription)
      const id = existing?.id || `asaas_${environment}_${payment.id}`
      if (rows.some(row => row.resource === "charges" && (row.deleted || row.data.deletedAt) && (row.id === id || (row.data.gatewayId === payment.id && row.data.gatewayEnvironment === environment)))) continue
      const entryRow = rows.find(row => row.resource === "entries" && row.data.chargeId === id)
      const record = importedReceivable(payment, client, environment, mapAsaasStatus(payment.status, payment.deleted), existing, subscription, entryRow?.id)
      if (!record) { unmatched++; continue }
      await mergeRecord("charges", id, { ...record.charge }, { created: true, skipFiscal: !existing || existing.status === "pago" })
      await mergeRecord("entries", record.entry.id, { ...record.entry }, { created: true, deleted: record.entryDeleted || !!entryRow?.deleted && existing?.status !== "cancelado" })
      const index = charges.findIndex(charge => charge.id === id)
      if (index >= 0) charges[index] = record.charge
      else charges.push(record.charge)
      if (subscription && payment.subscription) {
        subscription.asaasSubscriptionId = payment.subscription
        subscription.asaasEnvironment = environment
      }
      imported++
    }
    for (const subscription of subscriptions.filter(subscription => subscription.asaasSubscriptionId && subscription.asaasEnvironment === environment)) {
      const fresh = asaasSubscriptionSnapshot(subscription, charges, environment)
      if (!fresh) continue
      await db.update(crmRecords).set({ data: { ...fresh }, updatedAt: new Date() }).where(and(eq(crmRecords.resource, "subscriptions"), eq(crmRecords.id, fresh.id)))
    }
    lastKey = key; lastSync = Date.now()
    lastResult = { connected: true, imported, unmatched, linkedClients: matches.size }
    return lastResult
  })()
  try { return await flight } finally { flight = null }
}
