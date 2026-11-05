import { config } from "dotenv"
import postgres from "postgres"
import { normalizeMessage } from "../lib/whatsapp/normalize.ts"
config({ path: ".env.local", quiet: true })
const base = process.env.EVOLUTION_URL
const instance = process.env.EVOLUTION_INSTANCE || "crm-principal"
async function request(path, body) {
  const response = await fetch(`${base}${path}`, { method: body ? "POST" : "GET", headers: { apikey: process.env.EVOLUTION_API_KEY, "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(15000) })
  if (!response.ok) return { http: response.status }
  return response.json()
}
try {
  const [state, hook, history] = await Promise.all([request(`/instance/connectionState/${instance}`), request(`/webhook/find/${instance}`), request(`/chat/findMessages/${instance}`, { where: {}, page: 1, offset: 100 })])
  const config = hook.webhook || hook
  console.log("Conexão:", state.instance?.state || state.http || "indisponível")
  console.log("Webhook:", { enabled: config.enabled, matchesConfiguredUrl: config.url === process.env.EVOLUTION_WEBHOOK_URL, events: config.events, hasCrmHeader: Boolean(config.headers?.["x-webhook-token"]), http: hook.http })
  const rows = history.messages?.records || history.messages || history.records || []
  console.log("Histórico do provedor:", { http: history.http, count: Array.isArray(rows) ? rows.length : 0, outgoing: Array.isArray(rows) ? rows.filter(r => r.key?.fromMe).length : 0, keys: Array.isArray(rows) && rows[0] ? Object.keys(rows[0]) : [], outgoingKeys: Array.isArray(rows) && rows.find(r => r.key?.fromMe) ? Object.keys(rows.find(r => r.key?.fromMe)) : [] })
  if (Array.isArray(rows)) {
    const stats = {}
    for (const row of rows) {
      const suffix = String(row.key?.remoteJid || "").split("@")[1] || "missing"
      const label = `${row.key?.fromMe ? "out" : "in"}:${suffix}:${normalizeMessage(instance, row) ? "accepted" : "ignored"}`
      stats[label] = (stats[label] || 0) + 1
    }
    console.log("Classificação de mensagens:", stats)
    const outgoing = rows.find(row => row.key?.fromMe)
    if (outgoing) console.log("Formato de saída:", { keyFields: Object.keys(outgoing.key || {}), fromMeType: typeof outgoing.key?.fromMe, messageFields: Object.keys(outgoing.message || {}) })
  }
} catch (e) { console.log("Serviço local:", e.name) }
const sql = postgres(process.env.DATABASE_URL, { max: 1 })
try { console.log("Mensagens no CRM:", await sql`select direction, count(*)::int as total from whatsapp_messages group by direction`) } finally { await sql.end() }
