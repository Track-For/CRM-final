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
assert.ok(["localhost", "127.0.0.1"].includes(new URL(original).hostname), "Teste restrito ao banco local")
const base = postgres(original, { max: 1, onnotice: () => {} })
const schema = `charge_delete_test_${randomBytes(6).toString("hex")}`
const url = new URL(original)
url.searchParams.set("search_path", schema)
const sql = postgres(url.toString(), { max: 1 })
let api
const originalFetch = globalThis.fetch
try {
  await base.unsafe(`create schema "${schema}"`)
  for (const table of ["users", "crm_records", "billing_settings"]) await base.unsafe(`create table "${schema}"."${table}" (like public."${table}" including all)`)
  await sql`insert into users(id,name,email,password_hash,role) values ('test-user','Teste','test@example.invalid','disabled','admin')`
  const dir = path.resolve(".next/local-charge-deletion")
  await mkdir(dir, { recursive: true })
  const outfile = path.join(dir, "actions.mjs")
  await build({ stdin: { contents: 'export { archiveChargeAction, loadRecordOverlay } from "./lib/data/records-actions"; export { syncAsaasReceivables } from "./lib/boleto/import"; export { encryptSecret } from "./lib/fiscal/crypto"; import { db } from "./lib/db"; export async function closeDatabase(){await db.$client.end()}', resolveDir: process.cwd(), sourcefile: "charge-deletion-check.ts" }, outfile, bundle: true, platform: "node", format: "esm", packages: "external", logLevel: "silent", plugins: [{ name: "isolate-fiscal-scheduling", setup(plugin) {
    plugin.onResolve({ filter: /^@\/lib\/fiscal\/automatic-schedule$/ }, () => ({ path: "fiscal-schedule", namespace: "fiscal-fixture" }))
    plugin.onLoad({ filter: /.*/, namespace: "fiscal-fixture" }, () => ({ contents: "export async function schedulePaidChargeInvoice(){}", loader: "js" }))
  } }, { name: "isolated-fixture", setup(plugin) {
    plugin.onResolve({ filter: /^@\/lib\/auth\/session$/ }, () => ({ path: "auth", namespace: "fixture" }))
    plugin.onLoad({ filter: /.*/, namespace: "fixture" }, args => ({ contents: args.path === "auth" ? 'export async function getCurrentUser(){return {id:"test-user",role:process.env.CHARGE_DELETE_TEST_ROLE || "admin"}}' : 'export async function syncAsaasReceivables(){return {connected:false,imported:0,unmatched:0,linkedClients:0}}', loader: "ts" }))
  } }] })
  process.env.DATABASE_URL = url.toString()
  api = await import(pathToFileURL(outfile).href + `?run=${Date.now()}`)
  const encrypted = api.encryptSecret("fixture-key")
  await sql`insert into billing_settings(id,environment,api_key_encrypted) values('default','sandbox',${encrypted})`
  globalThis.fetch = async (input, options) => {
    const request = new URL(input)
    assert.equal(request.hostname, "api-sandbox.asaas.com")
    assert.equal(options.method, "GET")
    if (request.pathname === "/v3/customers") return Response.json({ data: [{ id: "customer-fixture", cpfCnpj: "11111111111" }], hasMore: false })
    if (request.pathname === "/v3/payments") return Response.json({ data: [{ id: "payment-fixture", customer: "customer-fixture", value: 55, dueDate: "2026-11-21", status: "PENDING", billingType: "BOLETO" }], hasMore: false })
    throw new Error("Endpoint inesperado no teste")
  }
  const charge = { id: "charge-test", clientId: "cli_lead_test", dealId: "deal-test", milestoneId: "first", automatic: true, status: "pendente", amount: 100, dueDate: "2026-11-21T15:00:00.000Z", method: "pix" }
  const deal = { id: "deal-test", clientId: charge.clientId, leadId: "test", stage: "ganho", value: 100, monthlyFee: 0, wonAt: "2026-11-06T15:00:00.000Z", history: [{ toStage: "ganho" }], paymentPlan: { method: "pix", pixKey: "test", milestones: [{ id: "first", amount: 100, label: "À vista", percent: 100 }] } }
  for (const [resource, data] of [["clients", { id: charge.clientId, leadId: "test", document: "11111111111", name: "Cliente fixture" }], ["deals", deal], ["charges", charge], ["entries", { id: "entry-test", chargeId: charge.id, status: "pendente", amount: 100 }]]) await sql`insert into crm_records(resource,id,data,created) values(${resource},${data.id},${sql.json(data)},true)`
  process.env.CHARGE_DELETE_TEST_ROLE = "comercial"
  assert.equal((await api.archiveChargeAction(charge.id)).ok, false)
  assert.equal((await sql`select data->>'deletedAt' as deleted from crm_records where resource='charges' and id=${charge.id}`)[0].deleted, null)
  process.env.CHARGE_DELETE_TEST_ROLE = "admin"
  const result = await api.archiveChargeAction(charge.id)
  assert.equal(result.ok, true)
  let rows = await api.loadRecordOverlay()
  for (const resource of ["charges", "entries"]) assert.equal(rows.find(row => row.resource === resource).data.deletedAt, result.deletedAt)
  rows = await api.loadRecordOverlay()
  assert.equal(rows.filter(row => row.resource === "charges" && row.id === charge.id).length, 1)
  assert.equal(rows.find(row => row.resource === "charges").data.deletedAt, result.deletedAt)
  const importedId = "asaas_sandbox_payment-fixture"
  assert.ok(rows.some(row => row.resource === "charges" && row.id === importedId))
  const remoteDeleted = await api.archiveChargeAction(importedId)
  assert.equal(remoteDeleted.ok, true)
  await api.syncAsaasReceivables(true)
  const [savedRemote] = await sql`select data from crm_records where resource='charges' and id=${importedId}`
  assert.equal(savedRemote.data.deletedAt, remoteDeleted.deletedAt)
  assert.equal((await api.archiveChargeAction("missing")).ok, false)
  console.log("Exclusão e lançamento vinculados; autorização; persistência após duas recargas; Asaas não reimporta cobrança excluída: OK")
} finally {
  globalThis.fetch = originalFetch
  if (api) await api.closeDatabase()
  await sql.end()
  await base.unsafe(`drop schema if exists "${schema}" cascade`)
  await base.end()
}
