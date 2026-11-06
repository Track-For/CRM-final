import type { Charge, Client, FinancialEntry, Subscription } from "@/types"
import type { AsaasCustomer, AsaasEnvironment, AsaasPayment, MappedStatus } from "./asaas"

const digits = (value?: string) => (value || "").replace(/\D/g, "")
const email = (value?: string) => (value || "").trim().toLowerCase()
const unique = <T,>(items: T[]) => items.length === 1 ? items[0] : undefined

export function matchAsaasClient(customer: AsaasCustomer, clients: Client[], environment: AsaasEnvironment): Client | undefined {
  const active = clients.filter(client => !client.deletedAt)
  const linked = active.filter(client => client.asaasCustomerId === customer.id && client.asaasEnvironment === environment)
  if (linked.length) return unique(linked)
  const reference = active.find(client => client.id === customer.externalReference)
  if (reference) return reference
  const document = digits(customer.cpfCnpj)
  const byDocument = document ? active.filter(client => digits(client.document) === document) : []
  if (byDocument.length) return unique(byDocument)
  // Não aceita e-mail compartilhado nem documentos conflitantes.
  const address = email(customer.email)
  return address ? unique(active.filter(client => email(client.email) === address && (!document || !digits(client.document) || document === digits(client.document)))) : undefined
}

export function matchAsaasSubscription(payment: AsaasPayment, client: Client, subscriptions: Subscription[], environment: AsaasEnvironment) {
  if (!payment.subscription) return undefined
  const candidates = subscriptions.filter(item => item.clientId === client.id && item.status !== "cancelada")
  const linked = candidates.filter(item => item.asaasSubscriptionId === payment.subscription && item.asaasEnvironment === environment)
  if (linked.length) return unique(linked)
  return unique(candidates.filter(item => !item.asaasSubscriptionId && Math.round(item.amount * 100) === Math.round((payment.value || 0) * 100)))
}

export function matchAsaasCharge(payment: AsaasPayment, client: Client, charges: Charge[], environment: AsaasEnvironment, subscription?: Subscription) {
  const linked = charges.filter(charge => charge.gatewayId === payment.id && charge.gatewayEnvironment === environment)
  if (linked.length) return unique(linked)
  const reference = charges.find(charge => charge.id === payment.externalReference && charge.clientId === client.id && !charge.gatewayId && charge.status !== "pago")
  if (reference) return reference
  return unique(charges.filter(charge => charge.clientId === client.id && !charge.gatewayId && charge.status !== "cancelado" && charge.status !== "pago" &&
    (charge.method === "asaas" || charge.automatic || charge.id.startsWith("chg_first_")) && Math.round(charge.amount * 100) === Math.round((payment.value || 0) * 100) &&
    (payment.subscription ? charge.subscriptionId === subscription?.id && !!subscription && charge.dueDate.slice(0, 7) === payment.dueDate?.slice(0, 7) : !charge.subscriptionId && (!charge.dueDate || charge.dueDate.slice(0, 10) === payment.dueDate))))
}

function iso(value?: string | null) {
  if (!value) return undefined
  const raw = /^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T15:00:00.000Z` : value
  return Number.isFinite(Date.parse(raw)) ? new Date(raw).toISOString() : undefined
}

export function importedReceivable(payment: AsaasPayment, client: Client, environment: AsaasEnvironment, status: MappedStatus, existing?: Charge, subscription?: Subscription, entryId?: string) {
  // Um recebimento manual é um fato independente do status de uma cobrança externa.
  if (existing?.status === "pago" && !existing.gatewayId) return null
  const dueDate = iso(payment.dueDate)
  if (!dueDate || typeof payment.value !== "number" || !Number.isFinite(payment.value) || payment.value < 0) return null
  const id = existing?.id || `asaas_${environment}_${payment.id}`
  const charge: Charge = {
    ...existing, id, number: existing?.number || payment.id, clientId: client.id, subscriptionId: subscription?.id || existing?.subscriptionId,
    dealId: subscription?.dealId || existing?.dealId, asaasSubscriptionId: payment.subscription || undefined,
    description: payment.description?.trim() || existing?.description || (payment.subscription ? `Mensalidade — ${client.name}` : `Cobrança Asaas — ${client.name}`),
    amount: payment.value, method: payment.billingType === "BOLETO" ? "boleto" : payment.billingType === "PIX" ? "pix" : payment.billingType === "CREDIT_CARD" ? "cartao" : "asaas",
    installment: payment.installmentNumber || existing?.installment || 1, installments: existing?.installments || 1,
    dueDate, status, paidAt: status === "pago" ? iso(payment.paymentDate || payment.clientPaymentDate || payment.confirmedDate) || existing?.paidAt : undefined,
    gateway: "asaas", gatewayId: payment.id, gatewayEnvironment: environment, gatewayStatus: payment.deleted ? "DELETED" : payment.status,
    importedFromAsaas: existing?.gatewayId && !existing.importedFromAsaas ? false : true, automatic: false, awaitingProjectPayment: false, conversionReverted: false,
    invoiceUrl: payment.invoiceUrl || undefined, bankSlipUrl: payment.bankSlipUrl || undefined, nossoNumero: payment.nossoNumero || undefined,
    digitableLine: existing?.gatewayId === payment.id && existing.amount === payment.value && existing.dueDate.slice(0, 10) === payment.dueDate ? existing.digitableLine : "", barcode: existing?.gatewayId === payment.id && existing.amount === payment.value && existing.dueDate.slice(0, 10) === payment.dueDate ? existing.barcode : "", pixCode: "", pixKey: undefined,
    createdAt: iso(payment.dateCreated) || existing?.createdAt || dueDate,
  }
  const entry: FinancialEntry = {
    id: entryId || `ent_${id}`, type: "receita", clientId: client.id, chargeId: id, description: charge.description,
    categoryId: payment.subscription || charge.subscriptionId ? "fc_mensalidades" : "fc_projetos", amount: charge.amount,
    competenceDate: dueDate, dueDate, paidAt: charge.paidAt, status: charge.status === "cancelado" ? "pendente" : charge.status,
    conversionReverted: false, awaitingProjectPayment: false,
  }
  return { charge, entry, entryDeleted: status === "cancelado" }
}

/** Consultar cobranças não altera a forma de recebimento escolhida pelo usuário. */
export function asaasSubscriptionSnapshot(subscription: Subscription, charges: Charge[], environment: AsaasEnvironment): Subscription | null {
  if (subscription.method !== "asaas" || !subscription.asaasSubscriptionId || subscription.asaasEnvironment !== environment) return null
  const related = charges.filter(charge => charge.subscriptionId === subscription.id && charge.gatewayEnvironment === environment && charge.status !== "cancelado")
  if (!related.length) return null
  const open = related.filter(charge => charge.status !== "pago").sort((a, b) => a.dueDate.localeCompare(b.dueDate))
  const dates = related.map(charge => charge.dueDate).sort()
  const latest = dates[dates.length - 1]
  const billingDay = Number(latest.slice(8, 10))
  const next = new Date(latest)
  next.setUTCDate(1); next.setUTCMonth(next.getUTCMonth() + 1)
  next.setUTCDate(Math.min(billingDay, new Date(Date.UTC(next.getUTCFullYear(), next.getUTCMonth() + 1, 0)).getUTCDate()))
  return { ...subscription, startDate: dates[0], billingDay, nextBillingDate: open[0]?.dueDate || next.toISOString(), status: "ativa", conversionReverted: false }
}
