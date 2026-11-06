"use server"

import nodemailer from "nodemailer"
import { and, eq } from "drizzle-orm"
import { z } from "zod"
import { requireUser } from "@/lib/auth/session"
import { crmRecords, db } from "@/lib/db"
import { sendWhatsappText } from "@/lib/whatsapp/actions"
import { normalizePhone } from "@/lib/whatsapp/normalize"
import { unresolvedVariables } from "./templates"
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
const schema = z.object({ leadId: z.string().min(1).max(120), channel: z.enum(["email", "whatsapp"]), expectedRecipient: z.string().trim().min(1).max(320), subject: z.string().trim().max(200).refine(value => !/[\r\n]/.test(value), "Assunto inválido."), text: z.string().trim().min(1).max(10000) })
export async function sendLeadMessage(input: z.infer<typeof schema>) {
  const user = await authorize()
  const value = schema.parse(input)
  if (unresolvedVariables(value.text).length || (value.channel === "email" && unresolvedVariables(value.subject).length)) throw new Error("Preencha todas as variáveis antes de enviar.")
  const [record] = await db.select().from(crmRecords).where(and(eq(crmRecords.resource, "leads"), eq(crmRecords.id, value.leadId), eq(crmRecords.deleted, false))).limit(1)
  if (!record) throw new Error("Lead não encontrado. Atualize os dados antes de enviar.")
  const savedRecipient = value.channel === "email" ? record.data.email : record.data.whatsapp
  const normalizeRecipient = value.channel === "email" ? (recipient: string) => recipient.trim().toLowerCase() : normalizePhone
  if (typeof savedRecipient !== "string" || normalizeRecipient(savedRecipient) !== normalizeRecipient(value.expectedRecipient)) {
    throw new Error("O contato do lead mudou desde a revisão. Recarregue os dados e revise o destinatário antes de enviar.")
  }
  // O destinatário é sempre consultado no servidor, nunca aceito do navegador.
  if (value.channel === "whatsapp") {
    const phone = z.string().min(7).parse(record.data.whatsapp)
    await sendWhatsappText(phone, value.text)
  } else {
    const to = z.email("O lead não possui um e-mail válido.").parse(record.data.email)
    if (!value.subject) throw new Error("Preencha o assunto do e-mail.")
    if (!process.env.SMTP_HOST || !process.env.EMAIL_FROM) throw new Error("O envio de e-mail ainda não foi configurado. Peça ao administrador para configurar SMTP e EMAIL_FROM.")
    const port = Number(process.env.SMTP_PORT || 587)
    const transport = nodemailer.createTransport({ host: process.env.SMTP_HOST, port, secure: port === 465, auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined, connectionTimeout: 15000, socketTimeout: 30000, disableFileAccess: true, disableUrlAccess: true })
    try {
      const result = await transport.sendMail({ from: process.env.EMAIL_FROM, to, subject: value.subject, text: value.text })
      if (!result.accepted?.length) throw new Error("rejected")
    } catch { throw new Error("O servidor de e-mail não confirmou o envio. Confira a caixa de saída antes de tentar novamente.") }
    finally { transport.close() }
  }
  const activity: Activity = { id: `act_${crypto.randomUUID()}`, type: value.channel === "email" ? "email" : "whatsapp", title: value.channel === "email" ? `E-mail enviado: ${value.subject}` : "Mensagem enviada por WhatsApp", description: value.text, leadId: value.leadId, authorId: user.id, createdAt: new Date().toISOString() }
  try {
    await db.insert(crmRecords).values({ resource: "activities", id: activity.id, data: { ...activity }, created: true })
    return { activity, warning: "" }
  } catch { return { activity: null, warning: "Mensagem enviada, mas o histórico não foi salvo. Não reenvie a mensagem." } }
}
