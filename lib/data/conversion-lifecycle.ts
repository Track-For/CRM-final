import type { Charge, Client, Deal, FinancialEntry, Subscription } from "@/types"

type Change = { resource: "clients" | "subscriptions" | "charges" | "entries"; id: string; data: Record<string, unknown> }

/** Reverte a conversão visual sem apagar identidade, pagamentos ou documentos. */
export function conversionChanges(deals: Deal[], clients: Client[], subscriptions: Subscription[], charges: Charge[], entries: FinancialEntry[]): Change[] {
  const changes: Change[] = []
  for (const client of clients) {
    if (!client.id.startsWith("cli_lead_") || !client.leadId) continue
    const related = deals.filter(deal => deal.clientId === client.id || deal.leadId === client.leadId)
    if (!related.some(deal => deal.history?.some(event => event.toStage === "ganho") || deal.wonAt || deal.stage === "ganho")) continue
    const reverted = !related.some(deal => deal.stage === "ganho")
    if (!!client.conversionReverted !== reverted) changes.push({ resource: "clients", id: client.id, data: { conversionReverted: reverted } })
  }
  for (const subscription of subscriptions) {
    const deal = deals.find(item => item.id === subscription.dealId)
    if (!deal) continue
    if (deal.stage !== "ganho" && subscription.status === "ativa") changes.push({ resource: "subscriptions", id: subscription.id, data: { status: "pausada", conversionReverted: true } })
    if (deal.stage === "ganho" && subscription.conversionReverted) changes.push({ resource: "subscriptions", id: subscription.id, data: { status: "ativa", conversionReverted: false } })
  }
  for (const charge of charges) {
    if ((!charge.automatic && !charge.id.startsWith("chg_first_sub_deal_")) || charge.gatewayId || charge.status === "pago" || charge.status === "cancelado") continue
    const deal = deals.find(item => item.id === charge.dealId)
    if (!deal) continue
    const reverted = deal.stage !== "ganho"
    if (!!charge.conversionReverted !== reverted) changes.push({ resource: "charges", id: charge.id, data: { conversionReverted: reverted } })
    for (const entry of entries.filter(item => item.chargeId === charge.id && item.status !== "pago")) {
      if (!!entry.conversionReverted !== reverted) changes.push({ resource: "entries", id: entry.id, data: { conversionReverted: reverted } })
    }
  }
  return changes
}
