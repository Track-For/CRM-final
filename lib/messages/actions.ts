"use server"

import { and, eq } from "drizzle-orm"
import { z } from "zod"
import { requireUser } from "@/lib/auth/session"
import { crmRecords, db } from "@/lib/db"
import { normalizePhone } from "@/lib/whatsapp/normalize"
import { deliverContactMessage, messageDeliverySchema, validateMessageVariables } from "./delivery"
import type { Activity } from "@/types"

async function authorize() {
  const user = await requireUser()
  if (!["admin", "comercial"].includes(user.role)) throw new Error("Sem permissão para enviar mensagens aos leads.")
  return user
}
export async function getLeadMessagingAvailability() {
  await authorize()
  return { email: Boolean(process.env.SMTP_HOST && process.env.EMAIL_FROM), whatsapp: Boolean(process.env.EVOLUTION_URL && process.env.EVOLUTION_API_KEY) }
}
const schema = messageDeliverySchema.extend({ leadId: z.string().min(1).max(120) })
export async function sendLeadMessage(input: z.input<typeof schema>) {
  const user = await authorize()
  const value = schema.parse(input)
  validateMessageVariables(value)
  const [record] = await db.select().from(crmRecords).where(and(eq(crmRecords.resource, "leads"), eq(crmRecords.id, value.leadId), eq(crmRecords.deleted, false))).limit(1)
  if (!record) throw new Error("Lead não encontrado. Atualize os dados antes de enviar.")
  const savedRecipient = value.channel === "email" ? record.data.email : record.data.whatsapp
  const normalizeRecipient = value.channel === "email" ? (recipient: string) => recipient.trim().toLowerCase() : normalizePhone
  if (typeof savedRecipient !== "string" || normalizeRecipient(savedRecipient) !== normalizeRecipient(value.expectedRecipient)) {
    throw new Error("O contato do lead mudou desde a revisão. Recarregue os dados e revise o destinatário antes de enviar.")
  }
  // O destinatário é sempre consultado no servidor, nunca aceito do navegador.
  const delivery = await deliverContactMessage(value, savedRecipient as string)
  const activity: Activity = { id: `act_${crypto.randomUUID()}`, type: value.channel === "email" ? "email" : "whatsapp", title: value.channel === "email" ? `E-mail enviado: ${value.subject}` : "Mensagem enviada por WhatsApp", description: delivery.deliveredText, leadId: value.leadId, authorId: user.id, createdAt: new Date().toISOString() }
  try {
    await db.insert(crmRecords).values({ resource: "activities", id: activity.id, data: { ...activity }, created: true })
    return { activity, warning: delivery.warning, remainingText: delivery.remainingText, sentCount: delivery.sentCount }
  } catch { return { activity: null, warning: [delivery.warning, "Mensagem enviada, mas o histórico não foi salvo. Não reenvie a mensagem."].filter(Boolean).join(" "), remainingText: delivery.remainingText, sentCount: delivery.sentCount } }
}
