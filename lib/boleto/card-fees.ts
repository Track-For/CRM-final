import type { AsaasClient } from "./asaas"
import type { ChargeTerms } from "@/lib/finance/charge-plan"

/** Consulta o simulador da conta e confirma o total que preserva o líquido desejado. */
export async function quoteCardTerms(api: AsaasClient, baseAmount: number, count: number): Promise<ChargeTerms> {
  const baseCents = Math.round(baseAmount * 100)
  let totalCents = baseCents
  for (let attempt = 0; attempt < 5; attempt++) {
    const { creditCard: card } = await api.simulateCard(totalCents / 100, count)
    if (!card || !Number.isFinite(card.netValue) || card.netValue < 0 || !Number.isFinite(card.feePercentage) || card.feePercentage < 0 || card.feePercentage >= 100) throw Error("O Asaas não retornou uma simulação válida das taxas do cartão.")
    const difference = baseCents - Math.round(card.netValue * 100)
    if (difference <= 0) return { baseAmount, count, surchargePercent: (totalCents - baseCents) / baseCents * 100, cardFeeMode: "asaas" }
    totalCents += Math.max(1, Math.ceil(difference / (1 - card.feePercentage / 100)))
  }
  throw Error("Não foi possível confirmar o total com as taxas do Asaas. Tente consultar novamente.")
}
