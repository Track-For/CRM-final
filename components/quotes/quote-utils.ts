import type { QuoteCalculation } from "@/lib/pricing"
import { formatMoney } from "@/lib/format"
import type { Client, Lead, PaymentCondition, Quote } from "@/types"

/** Vínculo do orçamento codificado como "lead:id" ou "client:id". */
export function encodeParty(q: { leadId?: string; clientId?: string }): string {
  if (q.clientId) return `client:${q.clientId}`
  if (q.leadId) return `lead:${q.leadId}`
  return ""
}

export function decodeParty(value: string): { leadId?: string; clientId?: string } {
  const [kind, id] = value.split(":")
  if (kind === "client") return { clientId: id }
  if (kind === "lead") return { leadId: id }
  return {}
}

export function partyLabel(q: Pick<Quote, "leadId" | "clientId">, leads: Map<string, Lead>, clients: Map<string, Client>) {
  const client = q.clientId ? clients.get(q.clientId) : undefined
  if (client) return { name: client.name, hint: client.contactName }
  const lead = q.leadId ? leads.get(q.leadId) : undefined
  if (lead) return { name: lead.company || lead.name, hint: lead.name }
  return { name: "Sem vínculo", hint: "" }
}

export function paymentDescription(payment: PaymentCondition, calc: QuoteCalculation): string {
  if (payment === "avista") return `à vista por ${formatMoney(calc.total)}`
  if (payment === "parcelado") return `${calc.installments}x de ${formatMoney(calc.installmentValue)} sem juros`
  return `50% de entrada (${formatMoney(calc.entryValue)}) + 50% na entrega`
}

export { schedulePhases } from "@/lib/projects/schedule"

export function nextQuoteNumber(quotes: Quote[]): string {
  const max = quotes.reduce((m, q) => Math.max(m, Number(q.number.replace(/\D/g, "")) || 0), 0)
  return `ORC-${String(max + 1).padStart(4, "0")}`
}
