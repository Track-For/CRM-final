import { config } from "dotenv"
import { build } from "esbuild"
import { mkdir } from "node:fs/promises"
import { pathToFileURL } from "node:url"
import path from "node:path"
import postgres from "postgres"

config({ path: ".env.local", quiet: true })
const dir = path.resolve(".next/whatsapp-history-repair")
await mkdir(dir, { recursive: true })
const file = path.join(dir, "repair.mjs")
await build({ stdin: { contents: 'export { reconcileWhatsappHistory } from "./lib/whatsapp/sync"; import { db } from "./lib/db"; export async function close() { await db.$client.end(); }', resolveDir: process.cwd(), sourcefile: "whatsapp-history-repair-entry.ts" }, outfile: file, bundle: true, platform: "node", format: "esm", packages: "external", logLevel: "silent" })
const service = await import(pathToFileURL(file).href + `?run=${Date.now()}`)
const sql = postgres(process.env.DATABASE_URL, { max: 1 })
const instance = process.env.EVOLUTION_INSTANCE || "crm-principal"
const counts = () => sql`select direction, count(*)::int as total, count(*) filter (where phone = '')::int as pending from whatsapp_messages where instance = ${instance} group by direction`
try {
  console.log("Antes:", await counts())
  const result = await service.reconcileWhatsappHistory(undefined, true)
  console.log("Reconciliação:", result)
  console.log("Depois:", await counts())
  // Amplia os eventos existentes sem trocar a URL nem os headers de uma automação.
  const base = process.env.EVOLUTION_URL
  const headers = { apikey: process.env.EVOLUTION_API_KEY, "Content-Type": "application/json" }
  const response = await fetch(`${base}/webhook/find/${instance}`, { headers, signal: AbortSignal.timeout(15000) })
  if (response.ok) {
    const raw = await response.json()
    const hook = raw.webhook || raw
    if (hook.enabled && hook.url === process.env.EVOLUTION_WEBHOOK_URL) {
      const events = [...new Set([...(hook.events || []), "MESSAGES_UPSERT", "MESSAGES_SET", "MESSAGES_UPDATE", "SEND_MESSAGE", "CONTACTS_UPSERT", "CONTACTS_UPDATE", "CONTACTS_SET"])]
      const updated = await fetch(`${base}/webhook/set/${instance}`, { method: "POST", headers, body: JSON.stringify({ webhook: { enabled: hook.enabled, url: hook.url, headers: hook.headers || {}, events, byEvents: hook.webhookByEvents ?? hook.byEvents ?? false, base64: hook.webhookBase64 ?? hook.base64 ?? false } }), signal: AbortSignal.timeout(15000) })
      if (!updated.ok) throw new Error(`Não foi possível ampliar os eventos do webhook (${updated.status}).`)
      console.log("Eventos de contatos habilitados. URL e autenticação existentes preservadas.")
    } else console.log("Webhook externo ou desabilitado preservado. A reconciliação continua disponível.")
  }
} finally {
  await service.close()
  await sql.end()
}
console.log("Nenhuma mensagem enviada aos contatos.")
