import type { Charge, Deal, FinancialEntry, Client } from "@/types"

export type Receipt = { id: string; amount: number; paidAt: string; monthly: boolean; ownerId: string; source: string; pipelineId: string; dealId: string }
export type ReceiptTotals = { total: number; monthly: number; other: number; count: number; average: number }
export type ContractReceivable = { id: string; dealId: string; title: string; description: string; amount: number; dueDate: string; ownerId: string; pipelineId: string }
export const emptyReceiptTotals: ReceiptTotals = { total: 0, monthly: 0, other: 0, count: 0, average: 0 }
export const visiblePayment = (item: { deletedAt?: string; conversionReverted?: boolean; awaitingProjectPayment?: boolean }) => !item.deletedAt && !item.conversionReverted && !item.awaitingProjectPayment
const validDate = (date: string | undefined): date is string => Boolean(date && Number.isFinite(new Date(date).getTime()))

/** Parcelas de projetos ganhos; o lançamento espelho não é somado novamente. */
export function collectContractReceivables(charges: Charge[], entries: FinancialEntry[], deals: Deal[]): ContractReceivable[] {
  const won = new Map(deals.filter(d => d.stage === "ganho").map(d => [d.id, d]))
  const monthly = new Set(entries.filter(e => e.categoryId === "fc_mensalidades" && visiblePayment(e)).map(e => e.chargeId))
  const seen = new Set<string>()
  return charges.flatMap(c => {
    const deal = c.dealId ? won.get(c.dealId) : undefined
    if (!deal || !visiblePayment(c) || !["pendente", "vencido"].includes(c.status) || c.subscriptionId || monthly.has(c.id) || !Number.isFinite(c.amount) || c.amount <= 0 || seen.has(c.id)) return []
    seen.add(c.id)
    return [{ id: c.id, dealId: deal.id, title: deal.title, description: c.description, amount: Math.round(c.amount * 100) / 100, dueDate: c.dueDate, ownerId: deal.ownerId || "", pipelineId: deal.pipelineId || "" }]
  })
}

/** Uma cobrança e seu lançamento espelho representam o mesmo recebimento. */
export function collectReceipts(charges: Charge[], entries: FinancialEntry[], deals: Deal[] = [], clients: Client[] = []) {
  const receipts: Receipt[] = []
  let undated = 0
  const chargeIds = new Set(charges.map(c => c.id))
  const linkedEntries = new Map(entries.filter(e => e.chargeId && visiblePayment(e)).map(e => [e.chargeId, e]))
  const seen = new Set<string>()
  const add = (id: string, amount: number, paidAt: string | undefined, monthly: boolean, dealId?: string, clientId?: string) => {
    if (seen.has(id) || !Number.isFinite(amount) || amount < 0) return
    seen.add(id)
    if (!validDate(paidAt)) { undated++; return }
    const deal = deals.find(d => d.id === dealId)
    const client = clients.find(c => c.id === clientId)
    receipts.push({ id, amount: Math.round(amount * 100) / 100, paidAt, monthly, dealId: dealId || "", pipelineId: deal?.pipelineId || "", ownerId: deal?.ownerId || client?.ownerId || "", source: deal?.source || "manual" })
  }
  for (const c of charges) if (c.status === "pago" && visiblePayment(c)) add(`charge:${c.id}`, c.amount, c.paidAt, Boolean(c.subscriptionId) || linkedEntries.get(c.id)?.categoryId === "fc_mensalidades", c.dealId, c.clientId)
  for (const e of entries) {
    if (e.type !== "receita" || e.status !== "pago" || !visiblePayment(e) || (e.chargeId && chargeIds.has(e.chargeId))) continue
    add(e.chargeId ? `charge:${e.chargeId}` : `entry:${e.id}`, e.amount, e.paidAt, e.categoryId === "fc_mensalidades", undefined, e.clientId)
  }
  return { receipts, undated }
}
export function receiptsIn(receipts: Receipt[], from: string | Date, to: string | Date) {
  const start = new Date(from).getTime(), end = new Date(to).getTime()
  return receipts.filter(r => { const time = new Date(r.paidAt).getTime(); return time >= start && time <= end })
}
export function receiptTotals(receipts: Receipt[]): ReceiptTotals {
  const cents = receipts.reduce((sum, r) => sum + Math.round(r.amount * 100), 0)
  const monthly = receipts.filter(r => r.monthly).reduce((sum, r) => sum + Math.round(r.amount * 100), 0)
  return { total: cents / 100, monthly: monthly / 100, other: (cents - monthly) / 100, count: receipts.length, average: receipts.length ? Math.round(cents / receipts.length) / 100 : 0 }
}

export function projectPaymentsByDeal(receipts: Receipt[]) {
  const result: Record<string, number> = {}
  for (const r of receipts) if (r.dealId && !r.monthly) result[r.dealId] = (Math.round((result[r.dealId] || 0) * 100) + Math.round(r.amount * 100)) / 100
  return result
}
