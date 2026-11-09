import type { Charge, Deal, Subscription } from "@/types"

export function firstSubscriptionDueDate(subscription: Pick<Subscription, "startDate" | "billingDay">) {
  const start = new Date(subscription.startDate)
  if (!Number.isFinite(start.getTime())) return ""
  const day = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(start)
  const [year, month, startDay] = day.split("-").map(Number)
  const wanted = Math.min(31, Math.max(1, subscription.billingDay || startDay))
  let due = new Date(Date.UTC(year, month - 1, Math.min(wanted, new Date(Date.UTC(year, month, 0)).getUTCDate()), 15))
  if (due.toISOString().slice(0, 10) < day) due = new Date(Date.UTC(year, month, Math.min(wanted, new Date(Date.UTC(year, month + 1, 0)).getUTCDate()), 15))
  return due.toISOString()
}

/** Uma mensalidade por negócio. A data usa o fuso comercial do CRM. */
export function subscriptionForDeal(deal: Deal, subscriptions: Subscription[], charges: Charge[] = []): Subscription | null {
  if (deal.stage !== "ganho" || !deal.clientId || !(deal.monthlyFee > 0)) return null
  const id = `sub_deal_${deal.id}`
  const existing = subscriptions.find(item => item.dealId === deal.id || item.id === id)
  if (existing?.asaasSubscriptionId && existing.method === "asaas") return existing
  if (existing?.status === "cancelada" || charges.some(charge => charge.subscriptionId === (existing?.id || id) && charge.status === "pago")) return existing || null
  const paid = charges.filter(charge => charge.dealId === deal.id && !charge.subscriptionId && charge.status === "pago")
  const totalPaid = paid.reduce((sum, charge) => sum + Math.round(charge.amount * 100), 0)
  const paymentDates = paid.map(charge => charge.paidAt).filter((value): value is string => !!value && Number.isFinite(new Date(value).getTime())).sort()
  // Sem implantação a pagar, a venda ganha é a referência para a manutenção.
  const settlementDate = deal.value === 0 ? deal.wonAt || deal.stageChangedAt : paymentDates[paymentDates.length - 1]
  const settled = deal.value === 0
    ? Boolean(settlementDate && Number.isFinite(new Date(settlementDate).getTime()))
    : totalPaid >= Math.round(deal.value * 100) && deal.value > 0 && paymentDates.length === paid.length && paid.length > 0
  let start = ""
  let day = 0
  if (settled) {
    const parts = new Intl.DateTimeFormat("en-US", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date(settlementDate))
    const part = (type: string) => parts.find(item => item.type === type)!.value
    const date = new Date(`${part("year")}-${part("month")}-${part("day")}T15:00:00.000Z`)
    date.setUTCDate(date.getUTCDate() + 3)
    start = date.toISOString()
    day = date.getUTCDate()
  }
  return { ...existing, id: existing?.id || id, dealId: deal.id, clientId: deal.clientId, description: existing?.description || `Mensalidade — ${deal.title}`, amount: existing?.amount ?? deal.monthlyFee,
    method: existing?.method || deal.paymentPlan?.method || "pix", paymentChannel: existing?.paymentChannel || deal.paymentPlan?.paymentChannel, pixKey: existing?.pixKey ?? deal.paymentPlan?.pixKey ?? "", billingDay: day,
    status: !settled ? "aguardando" : existing?.status === "pausada" ? "pausada" : "ativa",
    startDate: start, nextBillingDate: start && existing?.startDate === start ? existing.nextBillingDate : start }
}

/** Ajusta somente a primeira previsão automática; pagamentos e boletos emitidos ficam intactos. */
export function monthlyForecastChanges(subscription: Subscription, charges: Charge[]) {
  const charge = charges.find(item => item.id === `chg_first_${subscription.id}`)
  if (!charge || charge.dueDateOverridden || charge.status === "pago" || charge.status === "cancelado" || charge.gatewayId) return null
  const waiting = !subscription.startDate
  return { charge, patch: { awaitingProjectPayment: waiting, ...(waiting ? {} : { dueDate: firstSubscriptionDueDate(subscription) }) } }
}

/** Avança após uma cobrança emitida, preservando o dia original nos meses seguintes. */
export function nextMonthlyBilling(subscription: Subscription, charges: { subscriptionId?: string; dueDate: string; status: string; gatewayId?: string }[]): string {
  if (subscription.asaasSubscriptionId && subscription.method === "asaas") return subscription.nextBillingDate
  if (!subscription.startDate) return ""
  const issued = charges.filter(charge => charge.subscriptionId === subscription.id && charge.status !== "cancelado" && (!charge.gatewayId || subscription.method === "asaas")).map(charge => charge.dueDate).sort()
  if (!issued.length) return subscription.nextBillingDate
  const latest = issued[issued.length - 1]
  const [year, month] = latest.slice(0, 10).split("-").map(Number)
  const next = new Date(Date.UTC(year, month, 1))
  const lastDay = new Date(Date.UTC(next.getUTCFullYear(), next.getUTCMonth() + 1, 0)).getUTCDate()
  const day = Math.min(subscription.billingDay, lastDay)
  const date = `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}T15:00:00.000Z`
  return date > subscription.nextBillingDate ? date : subscription.nextBillingDate
}

/** Registra a primeira competência no financeiro, sem emitir boleto ou confirmar recebimento. */
export function firstMonthlyReceivable(subscription: Subscription, charges: import("@/types").Charge[]) {
  if (subscription.status !== "ativa" || !(subscription.amount > 0)) return null
  const id = `chg_first_${subscription.id}`
  // Cobranças já cadastradas para esta mensalidade têm prioridade.
  if (charges.some(charge => charge.subscriptionId === subscription.id)) return null
  const dueDate = firstSubscriptionDueDate(subscription)
  if (!dueDate) return null
  const charge: import("@/types").Charge = {
    id, number: `MENS-${subscription.id}`, clientId: subscription.clientId, dealId: subscription.dealId,
    subscriptionId: subscription.id, description: subscription.description, amount: subscription.amount,
    method: subscription.method, paymentChannel: subscription.paymentChannel, pixKey: subscription.pixKey, installment: 1, installments: 1,
    dueDate, status: "pendente", digitableLine: "", barcode: "", pixCode: "", createdAt: subscription.startDate,
  }
  const entry: import("@/types").FinancialEntry = {
    id: `ent_${id}`, type: "receita", description: charge.description, categoryId: "fc_mensalidades",
    amount: charge.amount, competenceDate: dueDate, dueDate, status: "pendente", clientId: charge.clientId, chargeId: charge.id,
  }
  return { charge, entry }
}
