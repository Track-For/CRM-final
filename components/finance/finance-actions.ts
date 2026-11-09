"use client"

import { toast } from "sonner"
import { useCrm } from "@/lib/data"
import { formatDate, formatMoney, whatsappLink } from "@/lib/format"
import type { Charge, Client, EntryStatus, FinancialEntry } from "@/types"

/** Boleto registrado no provedor: quem dá baixa nele é o Asaas, não a tela. */
export function isRegisteredBoleto(charge: Charge) {
  return charge.method === "boleto" && Boolean(charge.gatewayId)
}

/** Boleto sem registro (dados antigos do mock): a linha digitável dele não vale. */
export function isUnregisteredBoleto(charge: Charge) {
  return charge.method === "boleto" && !charge.gatewayId
}

/**
 * Coloca no store um boleto recém-emitido. O servidor já gravou cobrança e
 * lançamento, por isso usa `replace`: `add` gravaria tudo de novo.
 */
export function insertIssuedBoleto(charge: Charge, entry?: FinancialEntry) {
  const { charges, entries, replace } = useCrm.getState()
  replace("charges", [charge, ...charges.filter((c) => c.id !== charge.id)])
  if (entry) replace("entries", charge.status === "cancelado" ? entries.filter(e => e.id !== entry.id) : [{ ...entry, amount: charge.amount, dueDate: charge.dueDate, paidAt: charge.paidAt, status: charge.status }, ...entries.filter(e => e.id !== entry.id)])
}

/** Reflete no store o boleto devolvido por sync ou cancelamento, sem regravar. */
export function applyBoletoUpdate(charge: Charge) {
  const { charges, entries, replace } = useCrm.getState()
  replace("charges", charges.map((c) => (c.id === charge.id ? charge : c)))
  if (charge.status === "cancelado") {
    replace("entries", entries.filter((e) => e.chargeId !== charge.id))
    return
  }
  const status: EntryStatus = charge.status
  replace("entries", entries.map((e) => (e.chargeId === charge.id ? { ...e, status, paidAt: charge.paidAt } : e)))
}

/** Ações de cobrança que mantêm cobrança e lançamento vinculados em sincronia. */
export function useChargeActions() {
  const update = useCrm((s) => s.update)
  const remove = useCrm((s) => s.remove)

  const cancel = (charge: Charge) => {
    if (charge.gatewayId) { toast.error("Cancele a cobrança no Asaas e sincronize o CRM"); return }
    update("charges", charge.id, { status: "cancelado", paidAt: undefined })
    const entry = useCrm.getState().entries.find((e) => e.chargeId === charge.id)
    if (entry) remove("entries", entry.id)
    toast.success(`${charge.number} cancelada`)
  }

  return { cancel }
}

function boletoWhatsappText(charge: Charge) {
  if (!charge.gatewayId) return ""
  const link = charge.bankSlipUrl ?? charge.invoiceUrl
  return [link && `Boleto:\n${link}`, charge.digitableLine && `Linha digitável:\n${charge.digitableLine}`].filter(Boolean).join("\n\n")
}

export function chargeWhatsappUrl(charge: Charge, client: Client | undefined) {
  if (!client) return "#"
  const first = client.contactName.split(" ")[0]
  const payment =
    charge.method === "pix" ? charge.pixKey ? `Chave Pix:\n${charge.pixKey}` : charge.pixCode ? `Pix copia e cola:\n${charge.pixCode}` : "" : charge.method === "boleto" ? boletoWhatsappText(charge) : ""
  const text = `Olá, ${first}! Segue a cobrança ${charge.number} da Track For.\n` + `Valor: ${formatMoney(charge.amount)}\nVencimento: ${formatDate(charge.dueDate)}` + (payment ? `\n\n${payment}` : "")
  return whatsappLink(client.whatsapp, text)
}
