import { projectPaymentsByDeal, receiptTotals, type ContractReceivable, type Receipt } from "@/lib/finance/receipts"
import type { Deal, Lead, Pipeline } from "@/types"
import type { Goal, SavedReport, StoredRow } from "./model"
import { dealProbability, outstandingProject, weightedProject } from "@/lib/data/deal-forecast"
export { dealProbability as probability } from "@/lib/data/deal-forecast"

export function localDay(value: unknown) {
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value
  const date = new Date(String(value || ""))
  return Number.isFinite(date.getTime()) ? new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(date) : ""
}
const money = (value: unknown) => typeof value === "number" && Number.isFinite(value) ? Math.max(0, value) : 0
export function forecast(deals: Deal[], pipelines: Pipeline[], month: string, ownerId = "", pipelineId = "", receipts: Receipt[] = [], paidByDeal = projectPaymentsByDeal(receipts), contractReceivables: ContractReceivable[] = []) {
  const scoped = deals.filter(d => (!ownerId || d.ownerId === ownerId) && (!pipelineId || d.pipelineId === pipelineId))
  const won = scoped.filter(d => d.stage === "ganho" && localDay(d.wonAt).startsWith(month))
  const open = scoped.filter(d => !["ganho", "perdido"].includes(d.stage) && localDay(d.expectedCloseDate).startsWith(month))
  const remaining = (d: Deal) => outstandingProject(d, paidByDeal)
  const weighted = open.reduce((s, d) => s + weightedProject(d, pipelines, paidByDeal), 0)
  const paid = receiptTotals(receipts.filter(r => localDay(r.paidAt).startsWith(month) && (!ownerId || r.ownerId === ownerId) && (!pipelineId || r.pipelineId === pipelineId)))
  const contracted = won.reduce((s, d) => s + money(d.value), 0)
  const closed = paid.total
  const scopedReceivables = contractReceivables.filter(r => (!ownerId || r.ownerId === ownerId) && (!pipelineId || r.pipelineId === pipelineId))
  const receivables = scopedReceivables.filter(r => localDay(r.dueDate).startsWith(month))
  const contractedReceivable = receivables.reduce((sum, r) => sum + Math.round(r.amount * 100), 0) / 100
  return { closed, contracted, contractedReceivable, receivables, missingDueDate: scopedReceivables.filter(r => !localDay(r.dueDate)).length, receivedCount: paid.count, monthlyReceived: paid.monthly, weighted, projected: closed + contractedReceivable + weighted, potential: open.reduce((s, d) => s + remaining(d), 0), wonCount: won.length, openCount: open.length,
    missingCloseDate: scoped.filter(d => !["ganho", "perdido"].includes(d.stage) && !localDay(d.expectedCloseDate)).length,
    deals: open.map(d => ({ id: d.id, title: d.title, stage: d.stage, pipelineId: d.pipelineId, ownerId: d.ownerId, value: remaining(d), probability: dealProbability(d, pipelines), weighted: weightedProject(d, pipelines, paidByDeal), expectedCloseDate: d.expectedCloseDate })) }
}
export function goalProgress(goal: Goal, deals: Deal[], leads: Lead[], received: { month: string; ownerId: string; pipelineId: string; total: number }[] = []) {
  const scoped = deals.filter(d => (!goal.ownerId || d.ownerId === goal.ownerId) && (!goal.pipelineId || d.pipelineId === goal.pipelineId) && d.stage === "ganho" && localDay(d.wonAt).startsWith(goal.month))
  const actual = goal.metric === "receivedValue" ? received.filter(r => r.month === goal.month && (!goal.ownerId || r.ownerId === goal.ownerId) && (!goal.pipelineId || r.pipelineId === goal.pipelineId)).reduce((sum, r) => sum + Math.round(r.total * 100), 0) / 100
    : goal.metric === "newLeads" ? leads.filter(l => (!goal.ownerId || l.ownerId === goal.ownerId) && localDay(l.createdAt).startsWith(goal.month)).length
    : goal.metric === "wonCount" ? scoped.length : scoped.reduce((s, d) => s + money(d.value), 0)
  return { actual, percent: actual / goal.target * 100, remaining: Math.max(0, goal.target - actual) }
}
export function runReport(report: SavedReport, rows: StoredRow[], pipelines: Pipeline[], paidByDeal: Record<string, number> = {}, receipts: Receipt[] = []) {
  const groups = new Map<string, { group: string; count: number; value: number }>()
  // Receita usa cada pagamento, inclusive mensalidades, nunca o valor integral do contrato.
  const deals = new Map(rows.filter(r => r.resource === "deals").map(r => [r.id, r.data]))
  const reportRows: StoredRow[] = report.metric === "receivedValue" && report.resource === "deals"
    ? receipts.map(r => ({ resource: "deals", id: r.id, data: { ...deals.get(r.dealId), ownerId: r.ownerId, source: r.source, pipelineId: r.pipelineId, paidAt: r.paidAt, receivedValue: r.amount } }))
    : rows
  for (const row of reportRows) {
    if (row.resource !== report.resource) continue
    const d = row.data
    const day = localDay(d[report.metric === "receivedValue" ? "paidAt" : report.dateField])
    const owner = report.resource === "tasks" ? d.assigneeId : d.ownerId
    if (!day || day < report.from || day > report.to || (report.ownerId && owner !== report.ownerId) || (report.pipelineId && d.pipelineId !== report.pipelineId) || (report.status && (report.resource === "deals" ? d.stage : d.status) !== report.status)) continue
    const group = String(report.groupBy === "month" ? day.slice(0, 7) : report.groupBy === "ownerId" ? owner || "Sem responsável" : d[report.groupBy] || "Não informado")
    const result = groups.get(group) || { group, count: 0, value: 0 }
    result.count++
    result.value += report.metric === "count" ? 1 : report.metric === "weightedValue" ? weightedProject(d as unknown as Deal, pipelines, paidByDeal) : money(d[report.metric])
    groups.set(group, result)
  }
  return [...groups.values()].sort((a, b) => b.value - a.value || a.group.localeCompare(b.group))
}
