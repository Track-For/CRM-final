import type { Deal, Pipeline } from "@/types"

export function dealProbability(deal: Pick<Deal, "stage" | "probability" | "pipelineId">, pipelines: Pipeline[] = []) {
  if (deal.stage === "ganho") return 100
  if (deal.stage === "perdido") return 0
  const value = pipelines.find(p => p.id === deal.pipelineId)?.stages.find(s => s.key === deal.stage)?.probability ?? deal.probability
  return Math.min(100, Math.max(0, Number.isFinite(value) ? value : 0))
}
export function outstandingProject(deal: Deal, paidByDeal: Record<string, number> = {}) {
  const amount = Number.isFinite(deal.value) ? Math.max(0, deal.value) : 0
  return Math.max(0, Math.round(amount * 100) - Math.round((paidByDeal[deal.id] || 0) * 100)) / 100
}
export const weightedProject = (deal: Deal, pipelines: Pipeline[] = [], paidByDeal: Record<string, number> = {}) => outstandingProject(deal, paidByDeal) * dealProbability(deal, pipelines) / 100
