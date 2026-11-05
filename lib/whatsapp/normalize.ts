import { createHash } from "node:crypto"

type Json = Record<string, unknown>
export function object(value: unknown): Json {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Json : {}
}
export function normalizePhone(value: string): string {
  let digits = value.replace(/\D/g, "")
  if (digits.length === 10 || digits.length === 11) digits = `55${digits}`
  return digits
}
export function phoneIdentity(value: string): string {
  const phone = normalizePhone(value)
  // Identifica o mesmo contato brasileiro com e sem o nono dígito.
  return /^55\d{2}9\d{8}$/.test(phone) ? phone.slice(0, 4) + phone.slice(5) : phone
}
export function messageId(instance: string, providerId: string): string {
  return createHash("sha256").update(`${instance}:${providerId}`).digest("hex")
}
export function deliveryStatus(value: unknown): string {
  if ([4, 5, "READ", "PLAYED"].includes(value as string | number)) return "lida"
  if ([3, "DELIVERY_ACK"].includes(value as string | number)) return "entregue"
  return "enviada"
}
export function isLid(value: unknown): value is string {
  return typeof value === "string" && /^\d{1,20}@lid$/.test(value)
}
export function isPhoneJid(value: unknown): value is string {
  return typeof value === "string" && /^\d{7,15}@s\.whatsapp\.net$/.test(value)
}
/** Só aceita um par explícito e inequívoco de LID e telefone no mesmo registro. */
export function contactMapping(input: unknown): { lid: string; phone: string } | null {
  const raw = object(input)
  const key = object(raw.key)
  const remote = key.remoteJid ?? raw.remoteJid ?? raw.id
  if (typeof remote === "string" && /@(g\.us|broadcast|newsletter)$/.test(remote)) return null
  const values = [remote, key.remoteJidAlt, raw.remoteJidAlt, raw.lid, raw.phoneNumber]
  if (key.fromMe === false) values.push(raw.senderPn)
  const lids = [...new Set(values.filter(isLid))]
  const phones = [...new Set(values.filter(isPhoneJid).map(value => value.split("@")[0]))]
  return lids.length === 1 && phones.length === 1 ? { lid: lids[0], phone: phones[0] } : null
}
export function messageRows(input: unknown): unknown[] {
  if (Array.isArray(input)) return input
  const data = object(input)
  if (Array.isArray(data.messages)) return data.messages
  if (Array.isArray(object(data.messages).records)) return object(data.messages).records as unknown[]
  if (Array.isArray(data.records)) return data.records
  return [input]
}
export function normalizeMessage(instance: string, input: unknown, options: { lidPhones?: ReadonlyMap<string, string>; assumeOutgoing?: boolean } = {}) {
  const raw = object(input)
  const key = object(raw.key)
  const providerId = typeof key.id === "string" ? key.id : ""
  const jid = typeof key.remoteJid === "string" ? key.remoteJid : ""
  if (!providerId || (!isPhoneJid(jid) && !isLid(jid))) return null
  const mapping = contactMapping(raw)
  const phone = isPhoneJid(jid) ? jid.split("@")[0] : mapping?.phone || options.lidPhones?.get(jid) || ""
  const fromMe = key.fromMe === true || (key.fromMe === undefined && options.assumeOutgoing === true)
  let message = object(raw.message)
  for (let i = 0; i < 3; i++) {
    const wrapped = object(message.ephemeralMessage || message.viewOnceMessage || message.viewOnceMessageV2)
    if (!wrapped.message) break
    message = object(wrapped.message)
  }
  if (message.protocolMessage || message.reactionMessage || !Object.keys(message).length) return null
  let text = String(message.conversation || object(message.extendedTextMessage).text || "")
  let messageType = "text"
  if (!text) {
    const media: [string, string][] = [["imageMessage", "Imagem"], ["audioMessage", "Áudio"], ["videoMessage", "Vídeo"], ["documentMessage", "Documento"], ["stickerMessage", "Figurinha"], ["contactMessage", "Contato"], ["locationMessage", "Localização"]]
    const found = media.find(([field]) => message[field])
    if (!found) return null
    messageType = found[0]
    text = `[${found[1]}] ${object(message[found[0]]).caption || object(message[found[0]]).fileName || ""}`.trim()
  }
  const stamp = object(raw.messageTimestamp).low ?? raw.messageTimestamp
  const seconds = Number(stamp)
  const sentAt = Number.isFinite(seconds) && seconds > 0 ? new Date(seconds * 1000) : new Date()
  if (!Number.isFinite(sentAt.getTime())) return null
  const statuses = [deliveryStatus(raw.status), ...(Array.isArray(raw.MessageUpdate) ? raw.MessageUpdate.map(value => deliveryStatus(object(value).status)) : [])]
  const status = statuses.includes("lida") ? "lida" : statuses.includes("entregue") ? "entregue" : "enviada"
  return { id: messageId(instance, providerId), instance, providerId, remoteJid: jid, phone, contactName: fromMe ? "" : String(raw.pushName || ""), direction: fromMe ? "out" as const : "in" as const, text: text.slice(0, 20000), messageType, status, sentAt }
}
