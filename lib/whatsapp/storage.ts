import { and, eq, inArray, sql } from "drizzle-orm"
import { db, whatsappContacts, whatsappMessages } from "@/lib/db"
import { queueWhatsappIntake } from "./intake"
import { contactMapping, isLid, normalizeMessage, object, deliveryStatus, messageId } from "./normalize"

export async function learnContactMappings(instance: string, input: unknown[]) {
  const pairs = new Map<string, string>()
  const ambiguous = new Set<string>()
  for (const raw of input) {
    const pair = contactMapping(raw)
    if (!pair || ambiguous.has(pair.lid)) continue
    if (pairs.has(pair.lid) && pairs.get(pair.lid) !== pair.phone) { pairs.delete(pair.lid); ambiguous.add(pair.lid) }
    else pairs.set(pair.lid, pair.phone)
  }
  if (!pairs.size) return
  const values = [...pairs].map(([lid, phone]) => ({ instance, lid, phone }))
  await db.insert(whatsappContacts).values(values).onConflictDoUpdate({ target: [whatsappContacts.instance, whatsappContacts.lid], set: { phone: sql`excluded.phone`, updatedAt: new Date() } })
  // Uma resposta pode chegar antes da mensagem que informa o telefone do contato.
  for (const [lid, phone] of pairs) {
    const resolved = await db.update(whatsappMessages).set({ phone }).where(and(eq(whatsappMessages.instance, instance), eq(whatsappMessages.remoteJid, lid), eq(whatsappMessages.phone, ""))).returning({ phone: whatsappMessages.phone, direction: whatsappMessages.direction, sentAt: whatsappMessages.sentAt })
    await queueWhatsappIntake(instance, resolved)
  }
}
export async function storeMessages(instance: string, input: unknown[], options: { assumeOutgoing?: boolean } = {}) {
  await learnContactMappings(instance, input)
  const lids = [...new Set(input.map(raw => object(object(raw).key).remoteJid).filter(isLid))]
  const contacts = lids.length ? await db.select({ lid: whatsappContacts.lid, phone: whatsappContacts.phone }).from(whatsappContacts).where(and(eq(whatsappContacts.instance, instance), inArray(whatsappContacts.lid, lids))) : []
  const lidPhones = new Map(contacts.map(contact => [contact.lid, contact.phone]))
  const messages = new Map<string, NonNullable<ReturnType<typeof normalizeMessage>>>()
  for (const raw of input) {
    const message = normalizeMessage(instance, raw, { ...options, lidPhones })
    if (!message) continue
    const previous = messages.get(message.id)
    if (previous?.status === "lida" || previous?.status === "entregue" && message.status === "enviada") message.status = previous.status
    messages.set(message.id, message)
  }
  let stored = 0
  const values = [...messages.values()]
  for (let offset = 0; offset < values.length; offset += 100) {
    const rows = await db.insert(whatsappMessages).values(values.slice(offset, offset + 100)).onConflictDoUpdate({ target: whatsappMessages.id, set: {
      phone: sql`case when excluded.phone <> '' then excluded.phone else ${whatsappMessages.phone} end`,
      remoteJid: sql`case when ${whatsappMessages.remoteJid} like '%@lid' then ${whatsappMessages.remoteJid} else excluded.remote_jid end`,
      contactName: sql`case when excluded.contact_name <> '' then excluded.contact_name else ${whatsappMessages.contactName} end`,
      text: sql`excluded.text`, messageType: sql`excluded.message_type`, direction: sql`excluded.direction`,
      status: sql`case when ${whatsappMessages.status} = 'lida' or excluded.status = 'lida' then 'lida' when ${whatsappMessages.status} = 'entregue' or excluded.status = 'entregue' then 'entregue' else 'enviada' end`,
    } }).returning({ inserted: sql<boolean>`(xmax = 0)` })
    stored += rows.filter(row => row.inserted).length
  }
  await queueWhatsappIntake(instance, values)
  return stored
}
export async function updateDelivery(instance: string, input: unknown[]) {
  for (const value of input) {
    const raw = object(value)
    const key = object(raw.key)
    const id = String(key.id || raw.keyId || "")
    if (!id) continue
    const status = deliveryStatus(object(raw.update).status ?? raw.status)
    if (status === "enviada") continue
    await db.update(whatsappMessages).set({ status }).where(and(eq(whatsappMessages.id, messageId(instance, id)), ...(status === "entregue" ? [eq(whatsappMessages.status, "enviada")] : [])))
  }
}
