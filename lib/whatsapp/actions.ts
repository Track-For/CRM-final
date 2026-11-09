"use server"

import QRCode from "qrcode"
import { and, desc, eq, inArray, or } from "drizzle-orm"
import { z } from "zod"
import { requireUser } from "@/lib/auth/session"
import { db, whatsappMessages, whatsappContacts, crmRecords } from "@/lib/db"
import { evolutionConfig, EvolutionError, evolutionRequest } from "./client"
import { normalizePhone, object, phoneIdentity, isLid } from "./normalize"
import { reconcileRecentWhatsapp, reconcileWhatsappHistory } from "./sync"
import { intakeId, queueWhatsappIntake } from "./intake"
import type { Lead } from "@/types"
import type { IntakeData } from "./intake-model"
import { storeMessages } from "./storage"

async function authorize(admin = false) {
  const user = await requireUser()
  if (!(admin ? ["admin"] : ["admin", "comercial", "operacao"]).includes(user.role)) throw new Error("Sem permissão para acessar o WhatsApp.")
  return user
}
export async function getWhatsappConnection() {
  await authorize()
  const expectedPhone = process.env.EVOLUTION_PHONE || ""
  if (!process.env.EVOLUTION_URL || !process.env.EVOLUTION_API_KEY) return { state: "unconfigured", expectedPhone, error: "Serviço do WhatsApp ainda não configurado." }
  try {
    const { instance } = evolutionConfig()
    const result = await evolutionRequest<{ instance: { state: string } }>(`/instance/connectionState/${instance}`)
    return { state: result.instance?.state || "close", expectedPhone, error: "" }
  } catch (e) {
    if (e instanceof EvolutionError && e.status === 404) return { state: "close", expectedPhone, error: "" }
    return { state: "unavailable", expectedPhone, error: e instanceof Error ? e.message : "Servidor indisponível" }
  }
}
export async function connectWhatsapp() {
  await authorize(true)
  const { instance } = evolutionConfig()
  const url = process.env.EVOLUTION_WEBHOOK_URL
  const token = process.env.EVOLUTION_WEBHOOK_TOKEN
  if (!url || !token) throw new Error("Configure a URL e o token do webhook antes de conectar.")
  const webhook = { enabled: true, url, headers: { "x-webhook-token": token }, byEvents: false, base64: false, events: ["MESSAGES_UPSERT", "MESSAGES_SET", "MESSAGES_UPDATE", "SEND_MESSAGE", "CONNECTION_UPDATE", "CONTACTS_UPSERT", "CONTACTS_UPDATE", "CONTACTS_SET"] }
  let result: Record<string, unknown> = {}
  try {
    await evolutionRequest(`/instance/connectionState/${instance}`)
  } catch (e) {
    if (!(e instanceof EvolutionError) || e.status !== 404) throw e
    result = await evolutionRequest("/instance/create", "POST", { instanceName: instance, integration: "WHATSAPP-BAILEYS", qrcode: true, groupsIgnore: true, readMessages: false, readStatus: false, syncFullHistory: true, webhook })
  }
  await evolutionRequest(`/webhook/set/${instance}`, "POST", { webhook })
  if (!object(result.qrcode).base64 && !object(result.qrcode).code) result = await evolutionRequest(`/instance/connect/${instance}`)
  const qr = object(result.qrcode || result)
  const base64 = typeof qr.base64 === "string" ? qr.base64 : ""
  const code = typeof qr.code === "string" ? qr.code : ""
  const image = base64.startsWith("data:image/png;base64,") ? base64 : code ? await QRCode.toDataURL(code, { width: 320 }) : ""
  return { image, connection: await getWhatsappConnection() }
}
export async function disconnectWhatsapp() {
  await authorize(true)
  const { instance } = evolutionConfig()
  await evolutionRequest(`/instance/logout/${instance}`, "DELETE")
}
export async function getWhatsappInbox() {
  const user = await authorize()
  const connection = await getWhatsappConnection()
  if (["close", "connecting", "unconfigured"].includes(connection.state)) return []
  if (connection.state === "open") try { await reconcileRecentWhatsapp() } catch { /* Mantém disponível a cópia local quando o provedor está fora do ar. */ }
  const instance = process.env.EVOLUTION_INSTANCE || "crm-principal"
  const rows = await db.select().from(whatsappMessages).where(eq(whatsappMessages.instance, instance)).orderBy(desc(whatsappMessages.sentAt)).limit(2000)
  const byPhone = new Map<string, { phone: string; name: string; preview: string; sentAt: string; direction: string; unresolved: boolean }>()
  for (const row of rows) {
    const key = row.phone ? phoneIdentity(row.phone) : `lid:${row.remoteJid}`
    const current = byPhone.get(key)
    if (!current) byPhone.set(key, { phone: row.phone || row.remoteJid, unresolved: !row.phone, name: row.contactName, preview: row.text, sentAt: row.sentAt.toISOString(), direction: row.direction })
    else if (!current.name && row.contactName) current.name = row.contactName
  }
  await queueWhatsappIntake(instance, rows)
  const triage = await db.select({ id: crmRecords.id, data: crmRecords.data }).from(crmRecords).where(and(eq(crmRecords.resource, "whatsappIntake"), eq(crmRecords.deleted, false)))
  const intake = new Map(triage.map(row => [row.id, row.data as unknown as IntakeData]))
  const leadIds = triage.filter(r => r.data.instance === instance && typeof r.data.leadId === "string").map(r => String(r.data.leadId))
  const linked = ["admin", "comercial"].includes(user.role) && leadIds.length ? await db.select({ id: crmRecords.id, data: crmRecords.data }).from(crmRecords).where(and(eq(crmRecords.resource, "leads"), eq(crmRecords.deleted, false), inArray(crmRecords.id, leadIds))) : []
  return [...byPhone.values()].map(chat => {
    const classification = chat.unresolved ? undefined : intake.get(intakeId(instance, chat.phone))
    const lead = linked.find(row => row.id === classification?.leadId)
    return { ...chat, intake: classification, lead: lead ? { ...lead.data, id: lead.id } as unknown as Lead : undefined }
  })
}
const phoneSchema = z.string().trim().regex(/^[+\d\s().-]+$/, "Informe um telefone válido.").transform(normalizePhone).pipe(z.string().regex(/^\d{7,15}$/))
function aliases(phone: string) {
  const identity = phoneIdentity(phone)
  return identity.startsWith("55") && identity.length === 12 ? [identity, `${identity.slice(0, 4)}9${identity.slice(4)}`] : [phone]
}
export async function getWhatsappThread(input: string) {
  await authorize()
  const lid = isLid(input) ? input : undefined
  const phone = lid ? undefined : phoneSchema.parse(input)
  try { await reconcileRecentWhatsapp() } catch { /* O histórico local continua disponível. */ }
  const instance = process.env.EVOLUTION_INSTANCE || "crm-principal"
  const [mapping] = lid ? await db.select({ phone: whatsappContacts.phone }).from(whatsappContacts).where(and(eq(whatsappContacts.instance, instance), eq(whatsappContacts.lid, lid))).limit(1) : []
  const resolved = phone || mapping?.phone
  const contact = resolved ? (lid ? or(inArray(whatsappMessages.phone, aliases(resolved)), eq(whatsappMessages.remoteJid, lid)) : inArray(whatsappMessages.phone, aliases(resolved))) : eq(whatsappMessages.remoteJid, lid!)
  const rows = await db.select().from(whatsappMessages).where(and(eq(whatsappMessages.instance, instance), contact)).orderBy(desc(whatsappMessages.sentAt)).limit(200)
  const analyses = rows.length ? await db.select({ id: crmRecords.id, data: crmRecords.data }).from(crmRecords).where(and(eq(crmRecords.resource, "whatsappMediaAnalyses"), inArray(crmRecords.id, rows.map(row => row.id)))) : []
  const readings = new Map(analyses.filter(row => row.data.state === "completed").map(row => [row.id, String(row.data.text || "")]))
  return rows.reverse().map(row => ({ ...row, mediaReading: readings.get(row.id), sentAt: row.sentAt.toISOString(), receivedAt: row.receivedAt.toISOString() }))
}
export async function sendWhatsappText(input: string, text: string) {
  await authorize()
  const phone = phoneSchema.parse(input)
  const value = z.string().trim().min(1).max(10000).parse(text)
  const { instance } = evolutionConfig()
  const result = await evolutionRequest<Record<string, unknown>>(`/message/sendText/${instance}`, "POST", { number: phone, text: value })
  if (!object(result.key).id) throw new Error("O servidor não confirmou o envio. Confira a conversa no celular antes de tentar novamente.")
  try { await storeMessages(instance, [{ ...result, message: result.message || { conversation: value }, messageTimestamp: result.messageTimestamp || Math.floor(Date.now() / 1000) }]) }
  catch { throw new Error("Mensagem aceita pelo WhatsApp, mas não foi salva no CRM. Atualize a conversa antes de reenviar.") }
  return getWhatsappThread(phone)
}
export async function syncWhatsappHistory(input?: string) {
  await authorize()
  const phone = input && !isLid(input) ? phoneSchema.parse(input) : undefined
  return reconcileWhatsappHistory(phone, true, input && isLid(input) ? input : undefined)
}
