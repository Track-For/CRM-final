import type { Charge, Deal, FinancialEntry } from "@/types"

export const editableForecast = (charge: Charge) => !charge.deletedAt && charge.automatic === true && charge.status === "pendente" && !charge.gatewayId

/** O plano define os recebíveis. Datas de etapas não informadas ficam em branco. */
export function projectReceivables(deal: Deal, charges: Charge[]) {
  const result: { charge: Charge; entry: FinancialEntry }[] = []
  const remove: Charge[] = []
  if (deal.stage !== "ganho" || !deal.clientId || !(deal.value >= 0)) return { records: result, remove }
  const existing = charges.filter(charge => charge.dealId === deal.id && !charge.subscriptionId)
  if (deal.value === 0) return { records: result, remove: existing.filter(editableForecast) }
  const stages = deal.paymentPlan?.milestones || []
  const paymentChannel = deal.paymentPlan?.paymentChannel || (deal.paymentPlan?.method && deal.paymentPlan.method !== "pix" ? "asaas" : "pix")
  for (const charge of existing) {
    if (editableForecast(charge) && !stages.some(stage => stage.id === charge.milestoneId)) remove.push(charge)
  }
  // Cobranças manuais sem etapa já representam o projeto: não as duplicar.
  if (existing.some(charge => !charge.milestoneId && charge.status !== "cancelado")) return { records: result, remove: [] }
  for (const [index, stage] of stages.entries()) {
    const previous = existing.find(charge => charge.milestoneId === stage.id)
    if (previous && !editableForecast(previous)) continue
    const id = previous?.id || `chg_project_${deal.id}_${stage.id}`
    const dueDate = previous?.dueDateOverridden ? previous.dueDate : stage.dueDate ? `${stage.dueDate.slice(0, 10)}T15:00:00.000Z` : ""
    const charge: Charge = {
      id, dueDateOverridden: previous?.dueDateOverridden, automatic: true, number: previous?.number || `PROJ-${deal.id}-${index + 1}`, clientId: deal.clientId,
      dealId: deal.id, milestoneId: stage.id, description: `${deal.title} — ${stage.label}`,
      amount: Math.round(stage.amount * (1 + (paymentChannel === "asaas" && stage.cardFeeMode === "asaas" ? stage.asaasFeePercent || 0 : 0) / 100) * 100) / 100, method: deal.paymentPlan?.method || "pix", pixKey: deal.paymentPlan?.pixKey || "",
      paymentChannel,
      ...(paymentChannel === "asaas" ? { paymentTerms: { baseAmount: stage.amount, surchargePercent: stage.cardFeeMode === "asaas" ? stage.asaasFeePercent || 0 : 0, count: stage.installments || 1, ...(stage.cardFeeMode ? { cardFeeMode: stage.cardFeeMode } : {}) } } : {}),
      installment: index + 1, installments: stages.length, dueDate, status: "pendente",
      digitableLine: "", barcode: "", pixCode: "", createdAt: previous?.createdAt || deal.wonAt || deal.stageChangedAt,
    }
    result.push({ charge, entry: {
      id: `ent_${id}`, type: "receita", description: charge.description, categoryId: "fc_projetos", amount: charge.amount,
      competenceDate: previous?.dueDateOverridden ? dueDate : deal.wonAt || deal.stageChangedAt, dueDate, status: "pendente", clientId: deal.clientId, chargeId: id,
    } })
  }
  return { records: result, remove }
}
