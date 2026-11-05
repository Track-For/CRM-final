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

/** Divide o prazo total em fases do cronograma, somando exatamente o total. */
export function schedulePhases(totalDays: number): { label: string; days: number }[] {
  const weights: [string, number][] = [
    ["Briefing e planejamento", 0.15],
    ["Design e aprovação", 0.3],
    ["Desenvolvimento", 0.4],
    ["Testes e publicação", 0.15],
  ]
  if (totalDays < weights.length) return [{ label: "Execução completa", days: Math.max(1, totalDays) }]
  const phases = weights.map(([label, w]) => ({ label, days: Math.max(1, Math.round(totalDays * w)) }))
  const diff = totalDays - phases.reduce((s, p) => s + p.days, 0)
  phases[2].days = Math.max(1, phases[2].days + diff)
  return phases
}

export function nextQuoteNumber(quotes: Quote[]): string {
  const max = quotes.reduce((m, q) => Math.max(m, Number(q.number.replace(/\D/g, "")) || 0), 0)
  return `ORC-${String(max + 1).padStart(4, "0")}`
}
