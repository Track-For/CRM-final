import type { PaymentMethod } from "@/types"
import { PAYMENT_METHOD_LABEL, type Option } from "@/lib/constants"

export const MAX_INSTALLMENTS = 12
export const installmentLimit = (value: number) => Math.min(MAX_INSTALLMENTS, Math.max(1, Math.floor(value) || 1))
export const BILLING_CHANNEL_OPTIONS: Option<"pix" | "asaas">[] = [{ value: "pix", label: "Pix direto" }, { value: "asaas", label: "Asaas" }]
export const ASAAS_METHOD_OPTIONS: Option<PaymentMethod>[] = [{ value: "asaas", label: "Cliente escolhe no Asaas" }, { value: "pix", label: "Pix" }, { value: "boleto", label: "Boleto" }, { value: "cartao", label: "Cartão de crédito" }]
export function billingChannel(item: { paymentChannel?: "pix" | "asaas"; method: PaymentMethod; gatewayId?: string; asaasSubscriptionId?: string }) {
  return item.gatewayId || item.asaasSubscriptionId ? "asaas" : item.paymentChannel || (item.method === "pix" ? "pix" : "asaas")
}
export function billingLabel(item: Parameters<typeof billingChannel>[0]) {
  return billingChannel(item) === "pix" ? "Pix direto" : item.method === "asaas" ? "Cliente escolhe no Asaas" : `${PAYMENT_METHOD_LABEL[item.method]} pelo Asaas`
}
