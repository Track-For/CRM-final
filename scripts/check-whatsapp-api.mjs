import { config } from "dotenv"
import assert from "node:assert/strict"
config({ path: ".env.local", quiet: true })
const { EVOLUTION_URL: base, EVOLUTION_API_KEY: key } = process.env
const response = await fetch(`${base}/instance/fetchInstances`, { headers: { apikey: key } })
assert.equal(response.status, 200)
const instances = await response.json()
console.log("Evolution API acessível. Instâncias:", Array.isArray(instances) ? instances.length : "resposta inesperada")
const page = await fetch("http://localhost:3000/whatsapp")
assert.equal(page.status, 200)
console.log("Página /whatsapp: HTTP 200")
const badHook = await fetch("http://localhost:3000/api/webhooks/evolution", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" })
assert.equal(badHook.status, 401)
console.log("Webhook sem token: HTTP 401")
const hook = await fetch("http://localhost:3000/api/webhooks/evolution", { method: "POST", headers: { "Content-Type": "application/json", "x-webhook-token": process.env.EVOLUTION_WEBHOOK_TOKEN }, body: JSON.stringify({ instance: process.env.EVOLUTION_INSTANCE, event: "connection.update", data: { state: "close" } }) })
assert.equal(hook.status, 200)
console.log("Webhook autenticado: HTTP 200 (evento de teste, sem mensagens)")
