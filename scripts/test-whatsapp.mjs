import { test } from "node:test"
import assert from "node:assert/strict"
import { normalizeMessage, normalizePhone, phoneIdentity, messageId, deliveryStatus, contactMapping, messageRows } from "../lib/whatsapp/normalize.ts"
const raw = (extra = {}) => ({ key: { id: "test-provider-id", fromMe: false, remoteJid: "5562992224576@s.whatsapp.net" }, pushName: "Contato de teste", messageTimestamp: 1800000000, message: { conversation: "Olá" }, ...extra })

test("normaliza telefone brasileiro e nono dígito", () => {
  assert.equal(normalizePhone("(62) 99222-4576"), "5562992224576")
  assert.equal(phoneIdentity("5562992224576"), phoneIdentity("556292224576"))
})
test("preserva texto, autoria, remetente e horário", () => {
  const m = normalizeMessage("crm", raw())
  assert.equal(m.text, "Olá"); assert.equal(m.direction, "in"); assert.equal(m.phone, "5562992224576")
  assert.equal(m.sentAt.toISOString(), new Date(1800000000000).toISOString())
})
test("deduplica ID por instância e mensagem", () => {
  assert.equal(normalizeMessage("crm", raw()).id, messageId("crm", "test-provider-id"))
  assert.notEqual(messageId("a", "id"), messageId("b", "id"))
})
test("ignora grupos, status, reações e mensagens sem ID", () => {
  for (const remoteJid of ["123@g.us", "status@broadcast", "not-a-jid"]) assert.equal(normalizeMessage("crm", raw({ key: { id: "id", remoteJid } })), null)
  assert.equal(normalizeMessage("crm", raw({ message: { reactionMessage: { text: "👍" } } })), null)
  assert.equal(normalizeMessage("crm", raw({ key: {} })), null)
})
test("resolve contato LID apenas com telefone alternativo disponível", () => {
  const m = normalizeMessage("crm", raw({ key: { id: "id", remoteJid: "123@lid", remoteJidAlt: "5562992224576@s.whatsapp.net" } }))
  assert.equal(m.phone, "5562992224576")
})
test("identifica anexos sem baixar conteúdo privado", () => {
  const m = normalizeMessage("crm", raw({ message: { audioMessage: { url: "https://example.invalid/private" } } }))
  assert.equal(m.text, "[Áudio]"); assert.equal(m.messageType, "audioMessage"); assert.ok(!("url" in m))
})
test("extrai texto de mensagem encapsulada", () => {
  assert.equal(normalizeMessage("crm", raw({ message: { ephemeralMessage: { message: { extendedTextMessage: { text: "Texto" } } } } })).text, "Texto")
})
test("preserva direções de saída e confirmações reais", () => {
  const m = normalizeMessage("crm", raw({ key: { ...raw().key, fromMe: true }, status: "READ" }))
  assert.equal(m.direction, "out"); assert.equal(m.contactName, ""); assert.equal(m.status, "lida")
  assert.equal(deliveryStatus(3), "entregue"); assert.equal(deliveryStatus(2), "enviada")
})

test("resposta enviada pela IA usa o telefone aprendido de outra mensagem do contato", () => {
  const response = raw({ key: { id: "ai-response", fromMe: true, remoteJid: "123456789@lid" }, message: { conversation: "Resposta da IA" } })
  const result = normalizeMessage("crm", response, { lidPhones: new Map([["123456789@lid", "5511999990000"]]) })
  assert.equal(result.phone, "5511999990000"); assert.equal(result.direction, "out")
  assert.equal(result.remoteJid, "123456789@lid"); assert.equal(result.text, "Resposta da IA")
})
test("LID sem telefone é preservado pendente sem ser convertido num número inventado", () => {
  const result = normalizeMessage("crm", raw({ key: { id: "pending", fromMe: true, remoteJid: "123456789@lid" } }))
  assert.equal(result.phone, ""); assert.equal(result.remoteJid, "123456789@lid")
})
test("mapeamento aceita pares explícitos e rejeita o número do próprio remetente numa saída", () => {
  assert.deepEqual(contactMapping({ id: "123456789@lid", phoneNumber: "5511999990000@s.whatsapp.net" }), { lid: "123456789@lid", phone: "5511999990000" })
  assert.equal(contactMapping({ key: { remoteJid: "123456789@lid", fromMe: true }, senderPn: "5561999990000@s.whatsapp.net" }), null)
  assert.equal(contactMapping({ key: { remoteJid: "123@g.us", remoteJidAlt: "5511999990000@s.whatsapp.net" }, lid: "123456789@lid" }), null)
})
test("evento SEND_MESSAGE pode indicar saída quando o provedor omite fromMe", () => {
  const result = normalizeMessage("crm", raw({ key: { id: "send", remoteJid: "5511999990000@s.whatsapp.net" } }), { assumeOutgoing: true })
  assert.equal(result.direction, "out")
})
test("histórico conserva recibos de leitura e aceita envelopes paginados", () => {
  const row = raw({ MessageUpdate: [{ status: "READ" }, { status: "DELIVERY_ACK" }] })
  assert.equal(normalizeMessage("crm", row).status, "lida")
  assert.deepEqual(messageRows({ messages: { records: [row] } }), [row])
})
