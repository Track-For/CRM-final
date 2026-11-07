import { config } from "dotenv"
import postgres from "postgres"
import { build } from "esbuild"
import { mkdir } from "node:fs/promises"
import { randomBytes } from "node:crypto"
import assert from "node:assert/strict"
import { pathToFileURL } from "node:url"
import path from "node:path"

config({ path: ".env.local", quiet: true })
const original = process.env.DATABASE_URL
assert.ok(original && ["localhost", "127.0.0.1"].includes(new URL(original).hostname), "Teste restrito ao banco local")
process.env.APP_ENCRYPTION_KEY ||= randomBytes(32).toString("base64")
const base = postgres(original, { max: 1, onnotice: () => {} })
const schema = `webhook_test_${randomBytes(6).toString("hex")}`
const url = new URL(original); url.searchParams.set("search_path", schema)
const sql = postgres(url.toString(), { max: 1, onnotice: () => {} })
const originalFetch = globalThis.fetch
let api
try {
  await base.unsafe(`create schema "${schema}"`)
  for (const table of ["users", "crm_records", "billing_settings", "boletos", "gateway_events"]) await base.unsafe(`create table "${schema}"."${table}" (like public."${table}" including all)`)
  const dir = path.resolve(".next/local-asaas-webhook"); await mkdir(dir, { recursive: true })
  const outfile = path.join(dir, "route.mjs")
  await build({ stdin: { contents: 'export {POST} from "./app/api/webhooks/asaas/route";export {encryptSecret} from "./lib/fiscal/crypto";import {db} from "./lib/db";export async function closeDatabase(){await db.$client.end()}', resolveDir: process.cwd(), sourcefile: "webhook-check.ts" }, outfile, bundle: true, platform: "node", format: "esm", packages: "external", logLevel: "silent", plugins: [{ name: "isolate-fiscal-scheduling", setup(plugin) {
    plugin.onResolve({ filter: /^@\/lib\/fiscal\/automatic-schedule$/ }, () => ({ path: "fiscal-schedule", namespace: "fiscal-fixture" }))
    plugin.onLoad({ filter: /.*/, namespace: "fiscal-fixture" }, () => ({ contents: "export async function schedulePaidChargeInvoice(){}", loader: "js" }))
  } }] })
  process.env.DATABASE_URL = url.toString()
  api = await import(pathToFileURL(outfile).href + `?run=${Date.now()}`)
  globalThis.fetch = async () => { throw Error("Rede externa proibida neste teste") }
  const token = randomBytes(24).toString("hex")
  await sql`insert into billing_settings(id,environment,webhook_token_encrypted) values('default','sandbox',${api.encryptSecret(token)})`
  await sql`insert into boletos(charge_id,entry_id,environment,gateway_id,status,amount,due_date) values('test-charge','test-entry','sandbox','pay_fixture','pendente',100,'2026-11-20')`
  for (const [resource, data] of [["charges", { id: "test-charge", clientId: "test-client", gatewayId: "pay_fixture", amount: 100, status: "pendente" }], ["entries", { id: "test-entry", chargeId: "test-charge", status: "pendente", amount: 100 }]]) await sql`insert into crm_records(resource,id,data,created) values(${resource},${data.id},${sql.json(data)},true)`
  const payment = { id: "pay_fixture", customer: "cus_fixture", status: "RECEIVED", value: 100, dueDate: "2026-11-20", paymentDate: "2026-11-19", externalReference: "test-charge" }
  async function event(id, type, patch = {}, credential = token) {
    return api.POST(new Request("https://crm.example.invalid/api/webhooks/asaas", { method: "POST", headers: { "content-type": "application/json", "asaas-access-token": credential }, body: JSON.stringify({ id, event: type, payment: { ...payment, ...patch } }) }))
  }
  const charge = async () => (await sql`select data,deleted from crm_records where resource='charges' and id='test-charge'`)[0]
  const entry = async () => (await sql`select data,deleted from crm_records where resource='entries' and id='test-entry'`)[0]
  assert.equal((await event("bad", "PAYMENT_RECEIVED", {}, "wrong-token")).status, 401)
  assert.equal((await charge()).data.status, "pendente")
  assert.equal((await event("received", "PAYMENT_RECEIVED")).status, 200)
  assert.equal((await charge()).data.status, "pago")
  assert.equal((await entry()).data.status, "pago")
  assert.equal((await charge()).data.paidAt.slice(0, 10), payment.paymentDate)
  assert.equal((await event("received", "PAYMENT_RECEIVED")).status, 200)
  assert.equal((await sql`select count(*)::int as n from gateway_events where id='received'`)[0].n, 1)
  assert.equal((await event("old-pending", "PAYMENT_UPDATED", { status: "PENDING", paymentDate: null })).status, 200)
  assert.equal((await charge()).data.status, "pago", "Evento atrasado não desfaz pagamento")
  assert.equal((await event("refund", "PAYMENT_REFUNDED", { status: "REFUNDED" })).status, 200)
  assert.equal((await charge()).data.status, "cancelado")
  assert.equal((await entry()).deleted, true)
  assert.equal((await event("late-received", "PAYMENT_RECEIVED")).status, 200)
  assert.equal((await charge()).data.status, "cancelado", "Evento antigo não reativa cobrança cancelada")
  assert.equal((await event("restored", "PAYMENT_RESTORED", { status: "PENDING", paymentDate: null })).status, 200)
  assert.equal((await charge()).data.status, "pendente")
  assert.equal((await entry()).deleted, false)
  await sql`update crm_records set deleted=true where resource='charges' and id='test-charge'`
  assert.equal((await event("received-after-delete", "PAYMENT_RECEIVED")).status, 200)
  assert.equal((await charge()).deleted, true, "Webhook não ressuscita exclusão local")
  console.log("OK: webhook autenticado → cobrança e lançamento pagos; repetição sem duplicar; evento atrasado; estorno/cancelamento; restauração explícita; exclusão local preservada.")
  console.log("Eventos sintéticos em banco temporário; nenhuma chamada ao Asaas ou pagamento real.")
} finally {
  globalThis.fetch = originalFetch
  if (api) await api.closeDatabase()
  await sql.end()
  await base.unsafe(`drop schema if exists "${schema}" cascade`)
  await base.end()
  process.env.DATABASE_URL = original
}
