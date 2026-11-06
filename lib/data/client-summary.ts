import type { Charge, Client, Deal, Project, Subscription } from "@/types"

/** Resume o contratado sem criar cobranças ou pagamentos artificiais. */
export function clientSummary(client: Client, deals: Deal[], projects: Project[], subscriptions: Subscription[], charges: Charge[]) {
  const won = deals.filter(deal => deal.stage === "ganho" && (deal.clientId === client.id || (!!client.leadId && deal.leadId === client.leadId)))
  const clientProjects = projects.filter(project => project.clientId === client.id)
  const pendingProjects: Project[] = won.filter(deal => !clientProjects.some(project => project.dealId === deal.id)).map(deal => ({
    id: `deal_project_${deal.id}`, clientId: client.id, dealId: deal.id, name: deal.title,
    projectType: deal.projectType, status: "planejamento", value: deal.value,
    startDate: deal.wonAt || deal.stageChangedAt, deliveryDate: "",
  }))
  const clientSubs = subscriptions.filter(subscription => subscription.clientId === client.id)
  const clientCharges = charges.filter(charge => charge.clientId === client.id || won.some(deal => deal.id === charge.dealId))
  const paid = clientCharges.filter(charge => charge.status === "pago").reduce((total, charge) => total + charge.amount, 0)
  const billedOpen = clientCharges.filter(charge => charge.status === "pendente" || charge.status === "vencido").reduce((total, charge) => total + charge.amount, 0)
  // Cobranças sem negócio podem ser de mensalidades; não abatem o valor do projeto.
  const unbilled = won.reduce((total, deal) => {
    const billed = clientCharges.filter(charge => !charge.subscriptionId && charge.dealId === deal.id && charge.status !== "cancelado").reduce((sum, charge) => sum + charge.amount, 0)
    return total + Math.max(0, deal.value - billed)
  }, 0)
  const monthly = clientSubs.length
    ? clientSubs.filter(subscription => subscription.status === "ativa").reduce((total, subscription) => total + subscription.amount, 0)
    : won.reduce((total, deal) => total + deal.monthlyFee, 0)
  return { projects: [...clientProjects, ...pendingProjects], subscriptions: clientSubs, charges: clientCharges, paid, open: billedOpen + unbilled, unbilled, monthly,
    monthlyFromDeals: clientSubs.length === 0 && won.some(deal => deal.monthlyFee > 0) }
}
