import { currentWorkspace } from "@/lib/saas/context"
import { and, eq, inArray } from "drizzle-orm"
import { db, whatsappContacts } from "@/lib/db"
import { evolutionConfig, evolutionRequest } from "./client"
import { messageRows, object, phoneIdentity } from "./normalize"
import { storeMessages } from "./storage"

async function history(instance: string, remoteJid?: string, maxPages = 1) {
  const rows: unknown[] = []
  for (let page = 1; page <= maxPages; page++) {
    const result = await evolutionRequest<Record<string, unknown>>(`/chat/findMessages/${instance}`, "POST", { where: remoteJid ? { key: { remoteJid } } : {}, page, offset: 100 })
    const items = messageRows(result)
    if (items.length === 1 && items[0] === result) throw new Error("O provedor retornou um histórico de mensagens inválido.")
    rows.push(...items)
    const pages = Number(object(result.messages).pages)
    if (items.length < 100 || Number.isFinite(pages) && pages > 0 && page >= pages) break
  }
  return rows
}
export async function reconcileWhatsappHistory(phone?: string, deep = false, pendingLid?: string) {
  const { instance } = await evolutionConfig()
  const connection = await evolutionRequest<{ instance?: { state?: string } }>(`/instance/connectionState/${instance}`)
  if (connection.instance?.state !== "open") throw new Error("Conecte o WhatsApp pelo QR Code antes de sincronizar as conversas.")
  // Aprende pares LID/telefone antes de buscar a conversa; ambos os sentidos são importados.
  const recent = await history(instance, undefined, deep ? 5 : 1)
  let stored = await storeMessages(instance, recent)
  let total = recent.length
  if (phone || pendingLid) {
    const [mapped] = pendingLid ? await db.select({ phone: whatsappContacts.phone }).from(whatsappContacts).where(and(eq(whatsappContacts.instance, instance), eq(whatsappContacts.lid, pendingLid))).limit(1) : []
    const resolved = phone || mapped?.phone
    const identity = resolved ? phoneIdentity(resolved) : ""
    const aliases = resolved ? identity.startsWith("55") && identity.length === 12 ? [identity, `${identity.slice(0, 4)}9${identity.slice(4)}`] : [resolved] : []
    const contacts = aliases.length ? await db.select({ lid: whatsappContacts.lid }).from(whatsappContacts).where(and(eq(whatsappContacts.instance, instance), inArray(whatsappContacts.phone, aliases))) : []
    const jids = [...new Set([...aliases.map(value => `${value}@s.whatsapp.net`), ...contacts.map(contact => contact.lid), ...(pendingLid ? [pendingLid] : [])])].slice(0, 20)
    const batches = await Promise.all(jids.map(jid => history(instance, jid, deep ? 5 : 1)))
    const rows = batches.flat()
    stored += await storeMessages(instance, rows)
    total += rows.length
  }
  return { stored, total }
}
const recentSync = new Map<string, { attemptedAt: number; job: Promise<unknown>; settled: boolean }>()
/** Recupera eventos perdidos sem consultar o provedor a cada polling de cinco segundos. */
export async function reconcileRecentWhatsapp() {
  const { instance } = await evolutionConfig()
  const cacheKey = `${(await currentWorkspace())?.id || "legacy"}:${instance}`
  const previous = recentSync.get(cacheKey)
  if (previous && (!previous.settled || Date.now() - previous.attemptedAt < 15000)) { await previous.job; return }
  const job = reconcileWhatsappHistory()
  const entry = { attemptedAt: Date.now(), job, settled: false }
  recentSync.set(cacheKey, entry)
  try { await job } finally { entry.settled = true }
}
