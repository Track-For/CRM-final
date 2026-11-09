import { z } from "zod"
import { formatDate, formatMoney } from "@/lib/format"
import { MAX_INSTALLMENTS } from "./payment-options"
import type { Charge } from "@/types"

export const chargeTermsSchema = z.object({
  baseAmount: z.number().positive().max(9_999_999),
  surchargePercent: z.number().min(0).max(100),
  count: z.number().int().min(1).max(MAX_INSTALLMENTS),
  cardFeeMode: z.enum(["none", "asaas"]).optional(),
})
export type ChargeTerms = z.infer<typeof chargeTermsSchema>

export function calculateChargeTerms(input: ChargeTerms) {
  const terms = chargeTermsSchema.parse(input)
  const baseCents = Math.round(terms.baseAmount * 100)
  const surchargeCents = Math.round(baseCents * terms.surchargePercent / 100)
  const totalCents = baseCents + surchargeCents
  const per = Math.round(totalCents / terms.count)
  const amounts = Array.from({ length: terms.count }, (_, i) => (i === terms.count - 1 ? totalCents - per * (terms.count - 1) : per) / 100)
  if (amounts.some(amount => amount <= 0)) throw new Error("O valor é insuficiente para a quantidade de parcelas.")
  return { total: totalCents / 100, surcharge: surchargeCents / 100, amounts }
}

export function chargeMessage(input: { name: string; company: string; description: string; dueDate: string; terms: ChargeTerms; pixKey?: string; asaas: boolean }) {
  const { total, surcharge, amounts } = calculateChargeTerms(input.terms)
  return [`Olá, ${input.name || "cliente"}! Segue a cobrança de ${input.company}.`, input.description,
    `Valor total: ${formatMoney(total)}`,
    surcharge > 0 && (input.terms.cardFeeMode === "asaas" ? `Valor do serviço: ${formatMoney(input.terms.baseAmount)} + taxas do Asaas: ${formatMoney(surcharge)}` : `Valor original: ${formatMoney(input.terms.baseAmount)} + ${input.terms.surchargePercent}% de acréscimo (${formatMoney(surcharge)})`),
    input.terms.count > 1 && `Parcelamento: ${input.terms.count}x de ${formatMoney(amounts[0])}${amounts.at(-1) !== amounts[0] ? ` (última de ${formatMoney(amounts.at(-1)!)})` : ""}`,
    `${input.terms.count > 1 ? "Primeiro vencimento" : "Vencimento"}: ${formatDate(input.dueDate)}`,
    input.asaas ? "Pague pelo Asaas:\n{{link_pagamento}}" : `Chave Pix:\n${input.pixKey || "Cadastre a chave Pix nas configurações"}`,
  ].filter(Boolean).join("\n\n")
}

export function persistedChargeMessage(input: { charge: Charge; name: string; company: string; pixKey?: string }) {
  const { charge } = input
  const parsed = chargeTermsSchema.safeParse(charge.paymentTerms)
  const terms = parsed.success ? parsed.data : { baseAmount: charge.amount, surchargePercent: 0, count: 1 }
  let text = chargeMessage({ ...input, description: charge.description, dueDate: charge.dueDate, terms, pixKey: charge.pixKey || charge.pixCode || input.pixKey, asaas: Boolean(charge.gatewayId) })
  if (terms.count > 1) {
    text = text.replace("Primeiro vencimento:", "Vencimento desta parcela:")
    text += `\n\nParcela ${charge.installment}/${terms.count}: ${formatMoney(charge.amount)}`
  } else if (charge.installments > 1) {
    text = text.replace("Valor total:", "Valor desta cobrança:")
    text += `\n\nCobrança ${charge.installment}/${charge.installments}`
  }
  return text.replaceAll("{{link_pagamento}}", charge.invoiceUrl || charge.bankSlipUrl || "")
}
