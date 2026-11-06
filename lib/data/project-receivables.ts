import type { Charge, Deal, FinancialEntry } from "@/types"

export const editableForecast = (charge: Charge) => !charge.deletedAt && charge.automatic === true && charge.status === "pendente" && !charge.gatewayId

/** O plano define os recebíveis. Datas de etapas não informadas ficam em branco. */
export function projectReceivables(deal: Deal, charges: Charge[]) {
  const result: { charge: Charge; entry: FinancialEntry }[] = []
  const remove: Charge[] = []
  if (deal.stage !== "ganho" || !deal.clientId || !(deal.value > 0)) return { records: result, remove }
  const existing = charges.filter(charge => charge.dealId === deal.id && !charge.subscriptionId)
  const stages = deal.paymentPlan?.milestones || []
  for (const charge of existing) {
    if (editableForecast(charge) && !stages.some(stage => stage.id === charge.milestoneId)) remove.push(charge)
  }
  // Cobranças manuais sem etapa já representam o projeto: não as duplicar.
  if (existing.some(charge => !charge.milestoneId && charge.status !== "cancelado")) return { records: result, remove: [] }
  for (const [index, stage] of stages.entries()) {
    const previous = existing.find(charge => charge.milestoneId === stage.id)
    if (previous && !editableForecast(previous)) continue
    const id = previous?.id || `chg_project_${deal.id}_${stage.id}`
    const dueDate = stage.dueDate ? `${stage.dueDate.slice(0, 10)}T15:00:00.000Z` : ""
    const charge: Charge = {
      id, automatic: true, number: previous?.number || `PROJ-${deal.id}-${index + 1}`, clientId: deal.clientId,
      dealId: deal.id, milestoneId: stage.id, description: `${deal.title} — ${stage.label}`,
      amount: stage.amount, method: deal.paymentPlan?.method || "pix", pixKey: deal.paymentPlan?.pixKey || "",
      installment: index + 1, installments: stages.length, dueDate, status: "pendente",
      digitableLine: "", barcode: "", pixCode: "", createdAt: previous?.createdAt || deal.wonAt || deal.stageChangedAt,
    }
    result.push({ charge, entry: {
      id: `ent_${id}`, type: "receita", description: charge.description, categoryId: "fc_projetos", amount: charge.amount,
      competenceDate: deal.wonAt || deal.stageChangedAt, dueDate, status: "pendente", clientId: deal.clientId, chargeId: id,
    } })
  }
  return { records: result, remove }
}
