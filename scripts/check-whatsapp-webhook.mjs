import { config } from "dotenv"
import postgres from "postgres"
import { createHash } from "node:crypto"
import assert from "node:assert/strict"
config({ path: ".env.local", quiet: true })
const url = new URL(process.env.DATABASE_URL)
assert.ok(["localhost", "127.0.0.1"].includes(url.hostname), "Teste restrito ao banco local")
const sql = postgres(process.env.DATABASE_URL, { max: 1 })
const providerId = `crm-webhook-test-${Date.now()}`
const instance = process.env.EVOLUTION_INSTANCE
const outboundId = createHash("sha256").update(`${instance}:${providerId}-out`).digest("hex")
const lid = "999999999000001@lid"
const id = createHash("sha256").update(`${instance}:${providerId}`).digest("hex")
const post = async (event, data) => {
  const response = await fetch("http://localhost:3000/api/webhooks/evolution", { method: "POST", headers: { "Content-Type": "application/json", "x-webhook-token": process.env.EVOLUTION_WEBHOOK_TOKEN }, body: JSON.stringify({ instance, event, data }) })
  assert.equal(response.status, 200)
}
try {
  assert.equal((await sql`select lid from whatsapp_contacts where instance = ${instance} and lid = ${lid}`).length, 0)
  const outgoing = { key: { id: `${providerId}-out`, remoteJid: lid, fromMe: true }, messageTimestamp: Math.floor(Date.now() / 1000), message: { conversation: "Resposta sintética da IA — sem envio real" } }
  await post("SEND_MESSAGE", outgoing)
  assert.equal((await sql`select phone from whatsapp_messages where id = ${outboundId}`)[0].phone, "")
  const data = { key: { id: providerId, remoteJid: lid, remoteJidAlt: "5511999990000@s.whatsapp.net", fromMe: false }, pushName: "Teste local do webhook", messageTimestamp: Math.floor(Date.now() / 1000), message: { conversation: "Mensagem sintética de teste local — não enviada pelo WhatsApp" } }
  await post("messages.upsert", data)
  await post("messages.upsert", data)
  const recovered = (await sql`select phone, direction, text from whatsapp_messages where id = ${outboundId}`)[0]
  assert.equal(recovered.phone, "5511999990000")
  assert.equal(recovered.direction, "out")
  assert.equal(recovered.text, outgoing.message.conversation)
  await post("messages.update", [{ keyId: `${providerId}-out`, status: "READ" }])
  await post("messages.set", { messages: { records: [outgoing] } })
  assert.equal((await sql`select status from whatsapp_messages where id = ${outboundId}`)[0].status, "lida")
  assert.equal((await sql`select id from whatsapp_messages where id = ${outboundId}`).length, 1)
  const rows = await sql`select * from whatsapp_messages where id = ${id}`
  assert.equal(rows.length, 1)
  assert.equal(rows[0].direction, "in")
  assert.equal(rows[0].text, data.message.conversation)
  await post("messages.update", [{ keyId: providerId, status: "READ" }])
  assert.equal((await sql`select status from whatsapp_messages where id = ${id}`)[0].status, "lida")
  await post("messages.update", [{ keyId: providerId, status: "DELIVERY_ACK" }])
  assert.equal((await sql`select status from whatsapp_messages where id = ${id}`)[0].status, "lida")
  console.log("Webhook → banco: resposta da IA preservada antes do vínculo LID, recuperação do telefone, deduplicação e leitura verificadas.")
} finally {
  await sql`delete from whatsapp_messages where id in (${id}, ${outboundId})`
  await sql`delete from whatsapp_contacts where instance = ${instance} and lid = ${lid}`
  await sql.end()
}
