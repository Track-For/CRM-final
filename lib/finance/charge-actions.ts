"use server"

import { and, eq, sql } from "drizzle-orm"
import { addMonths, format } from "date-fns"
import { z } from "zod"
import { getCurrentUser } from "@/lib/auth/session"
import { crmRecords, db } from "@/lib/db"
import { EvolutionError, evolutionConfig, evolutionRequest } from "@/lib/whatsapp/client"
import { normalizePhone, object } from "@/lib/whatsapp/normalize"
import { storeMessages } from "@/lib/whatsapp/storage"
import { calculateChargeTerms, chargeTermsSchema } from "./charge-plan"
import type { Charge, FinancialEntry } from "@/types"

async function authorize() {
  const user = await getCurrentUser()
  if (!user || !["admin", "financeiro"].includes(user.role)) throw new Error("Sem permissão para emitir ou enviar cobranças.")
  return user
}

export async function getChargeWhatsappStatus() {
  await authorize()
  try {
    const { instance } = await evolutionConfig()
    const result = await evolutionRequest<{ instance?: { state?: string } }>(`/instance/connectionState/${instance}`)
    return { connected: result.instance?.state === "open" }
  } catch { return { connected: false } }
}

const directSchema = z.object({
  id: z.string().min(1).max(100), clientId: z.string().min(1).max(120),
  description: z.string().trim().min(1).max(500),
  dueDate: z.iso.date(), terms: chargeTermsSchema,
  dealId: z.string().optional(), milestoneId: z.string().optional(), subscriptionId: z.string().optional(),
})

export async function createDirectPixCharge(raw: z.infer<typeof directSchema>): Promise<{ charges: Charge[]; entries: FinancialEntry[] }> {
  const user = await authorize()
  const input = directSchema.parse(raw)
  const calculation = calculateChargeTerms(input.terms)
  return db.transaction(async tx => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`charge:${input.id}`}))`)
    const [existing] = await tx.select().from(crmRecords).where(and(eq(crmRecords.resource, "charges"), eq(crmRecords.id, input.id)))
    if (existing?.deleted || existing?.data.gatewayId || existing?.data.status === "pago") throw new Error("Esta cobrança não pode ser recriada como Pix direto.")
    if (existing?.data.paymentChannel === "pix") {
      if (existing.data.clientId !== input.clientId || existing.data.description !== input.description || Number(existing.data.paymentTerms && object(existing.data.paymentTerms).baseAmount) !== input.terms.baseAmount || Number(object(existing.data.paymentTerms).count) !== input.terms.count || String(existing.data.dueDate).slice(0, 10) !== input.dueDate) throw new Error("Esta cobrança já foi salva com outros dados. Confira a cobrança existente.")
      const ids = Array.from({ length: Number(existing.data.installments) }, (_, i) => i === 0 ? input.id : `${input.id}_p${i + 1}`)
      const rows = await tx.select().from(crmRecords).where(eq(crmRecords.deleted, false))
      return { charges: rows.filter(r => r.resource === "charges" && ids.includes(r.id)).map(r => r.data as unknown as Charge), entries: rows.filter(r => r.resource === "entries" && ids.includes(String(r.data.chargeId))).map(r => r.data as unknown as FinancialEntry) }
    }
    const [client] = await tx.select().from(crmRecords).where(and(eq(crmRecords.resource, "clients"), eq(crmRecords.id, input.clientId), eq(crmRecords.deleted, false)))
    if (!client || client.data.deletedAt) throw new Error("Cliente não encontrado.")
    const [settings] = await tx.select().from(crmRecords).where(and(eq(crmRecords.resource, "settings"), eq(crmRecords.id, "company"), eq(crmRecords.deleted, false)))
    const pixKey = String(object(settings?.data.company).pixKey || "").trim()
    if (!pixKey) throw new Error("Cadastre a chave Pix da empresa nas configurações antes de gerar a cobrança.")
    const charges: Charge[] = calculation.amounts.map((amount, i) => ({
      id: i === 0 ? input.id : `${input.id}_p${i + 1}`, number: `PIX-${input.id.replace(/^chg_/, "")}${i ? `-${i + 1}` : ""}`,
      clientId: input.clientId, description: input.description, amount, method: "pix", paymentChannel: "pix", paymentTerms: input.terms,
      ...(input.dealId ? { dealId: input.dealId } : {}), ...(input.milestoneId ? { milestoneId: input.milestoneId } : {}), ...(input.subscriptionId ? { subscriptionId: input.subscriptionId } : {}),
      installment: i + 1, installments: input.terms.count, dueDate: `${format(addMonths(new Date(`${input.dueDate}T12:00:00`), i), "yyyy-MM-dd")}T12:00:00.000Z`,
      status: "pendente", pixKey, pixCode: "", digitableLine: "", barcode: "", createdAt: new Date().toISOString(),
    }))
    const previousEntries = existing ? await tx.select().from(crmRecords).where(and(eq(crmRecords.resource, "entries"), sql`${crmRecords.data}->>'chargeId' = ${input.id}`)) : []
    if (existing && (existing.data.clientId !== input.clientId || input.terms.count !== 1)) throw new Error("A cobrança existente deve manter o cliente e ser emitida à vista.")
    const entries: FinancialEntry[] = charges.map(charge => ({ id: charge.id === input.id && previousEntries[0] ? previousEntries[0].id : `ent_${charge.id}`, chargeId: charge.id, clientId: charge.clientId, description: charge.description, type: "receita", categoryId: charge.subscriptionId ? "fc_mensalidades" : "fc_projetos", amount: charge.amount, dueDate: charge.dueDate, competenceDate: charge.dueDate, status: "pendente" }))
    for (const [resource, list] of [["charges", charges], ["entries", entries]] as const) {
      for (const record of list) await tx.insert(crmRecords).values({ resource, id: record.id, data: { ...record }, created: true, updatedBy: user.id }).onConflictDoUpdate({ target: [crmRecords.resource, crmRecords.id], set: { data: { ...record }, deleted: false, updatedBy: user.id, updatedAt: new Date() } })
    }
    return { charges, entries }
  })
}

export async function sendChargeWhatsapp(chargeId: string, draft: string) {
  const user = await authorize()
  z.string().min(1).max(120).parse(chargeId)
  z.string().trim().min(1).max(9000).parse(draft)
  const { instance } = await evolutionConfig()
  const outcome = await db.transaction(async tx => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`charge-whatsapp:${chargeId}`}))`)
    const [row] = await tx.select().from(crmRecords).where(and(eq(crmRecords.resource, "charges"), eq(crmRecords.id, chargeId), eq(crmRecords.deleted, false)))
    if (!row || row.data.status === "cancelado") throw new Error("Cobrança não encontrada ou cancelada.")
    const delivery = object(row.data.whatsappDelivery)
    if (delivery.state === "sent") return { ok: true, alreadySent: true }
    if (delivery.state === "uncertain" || delivery.state === "sending") return { ok: false, error: "O envio anterior ficou sem confirmação. Confira a conversa no celular antes de reenviar por lá." }
    const [client] = await tx.select().from(crmRecords).where(and(eq(crmRecords.resource, "clients"), eq(crmRecords.id, String(row.data.clientId)), eq(crmRecords.deleted, false)))
    const phone = normalizePhone(String(client?.data.whatsapp || ""))
    if (!client || !/^\d{10,15}$/.test(phone)) throw new Error("Cadastre um WhatsApp válido para o cliente.")
    const connection = await evolutionRequest<{ instance?: { state?: string } }>(`/instance/connectionState/${instance}`)
    if (connection.instance?.state !== "open") throw new Error("WhatsApp desconectado. Reconecte para enviar a cobrança já gerada.")
    const link = String(row.data.invoiceUrl || row.data.bankSlipUrl || "")
    const text = draft.trim().replaceAll("{{link_pagamento}}", link)
    if (row.data.gatewayId && !link) throw new Error("O link do Asaas ainda não está disponível. Atualize a cobrança antes de enviar.")
    // A reserva é confirmada no banco ANTES de enviar. Uma queda do processo
    // após o aceite do WhatsApp não libera um segundo disparo.
    await tx.update(crmRecords).set({ data: sql`${crmRecords.data} || ${JSON.stringify({ whatsappDelivery: { state: "sending", at: new Date().toISOString() } })}::jsonb`, updatedAt: new Date(), updatedBy: user.id }).where(and(eq(crmRecords.resource, "charges"), eq(crmRecords.id, chargeId)))
    return { ok: true, phone, text }
  })
  if (!("phone" in outcome)) return { ok: outcome.ok, error: "error" in outcome ? outcome.error : undefined }
  let result: Record<string, unknown> | undefined
  let confirmed = false
  let rejected = false
  try {
    result = await evolutionRequest<Record<string, unknown>>(`/message/sendText/${instance}`, "POST", { number: outcome.phone, text: outcome.text })
    confirmed = Boolean(object(result.key).id)
  } catch (error) { rejected = error instanceof EvolutionError && error.status >= 400 && error.status < 500 }
  const whatsappDelivery = { state: confirmed ? "sent" : rejected ? "failed" : "uncertain", at: new Date().toISOString(), ...(confirmed ? { messageId: String(object(result!.key).id) } : {}) }
  await db.update(crmRecords).set({ data: sql`${crmRecords.data} || ${JSON.stringify({ whatsappDelivery })}::jsonb`, updatedAt: new Date(), updatedBy: user.id }).where(and(eq(crmRecords.resource, "charges"), eq(crmRecords.id, chargeId)))
  if (confirmed && result) {
    try { await storeMessages(instance, [{ ...result, message: result.message || { conversation: outcome.text }, messageTimestamp: result.messageTimestamp || Math.floor(Date.now() / 1000) }]) } catch { /* O envio confirmado continua registrado na cobrança. */ }
  }
  return { ok: confirmed, error: confirmed ? undefined : rejected ? "O WhatsApp recusou o envio. A cobrança está salva; corrija a conexão e tente enviar novamente." : "O WhatsApp não confirmou o envio. A cobrança foi salva; confira a conversa no celular para evitar enviar duas vezes." }
}
