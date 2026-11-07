import nextEnv from "@next/env"
import postgres from "postgres"
import { build } from "esbuild"
import { mkdir } from "node:fs/promises"
import { randomBytes } from "node:crypto"
import assert from "node:assert/strict"
import { pathToFileURL } from "node:url"
import path from "node:path"

nextEnv.loadEnvConfig(process.cwd(), true)
const original = process.env.DATABASE_URL
assert.ok(original && ["localhost", "127.0.0.1"].includes(new URL(original).hostname), "Teste restrito ao banco local")
const schema = `fiscal_test_${randomBytes(6).toString("hex")}`
const base = postgres(original, { max: 1, onnotice: () => {} })
const url = new URL(original); url.searchParams.set("search_path", schema)
const sql = postgres(url.toString(), { max: 1, onnotice: () => {} })
const originalFetch = globalThis.fetch
const callbacks = []
globalThis.__fiscalTest = { after: callback => callbacks.push(callback), role: "admin" }
let api, calls = 0, mode = "success"
try {
  await base.unsafe(`create schema "${schema}"`)
  for (const table of ["users", "crm_records", "billing_settings", "boletos", "gateway_events", "fiscal_settings", "invoices"]) await base.unsafe(`create table "${schema}"."${table}" (like public."${table}" including all)`)
  const dir = path.resolve(".next/fiscal-automatic-test"); await mkdir(dir, { recursive: true })
  const outfile = path.join(dir, "test.mjs")
  const fixtures = {
    "next/server": "export function after(cb){globalThis.__fiscalTest.after(cb)}",
    "next/cache": "export function revalidatePath(){}",
    "@/lib/auth/session": 'export async function getCurrentUser(){return {id:"admin-test",role:globalThis.__fiscalTest.role}}',
  }
  await build({ stdin: { contents: 'export {POST} from "./app/api/webhooks/asaas/route"; export * from "./lib/fiscal/automatic"; export {retryAutomaticFiscalJob} from "./lib/fiscal/automatic-actions"; export {issueInvoiceAction} from "./lib/fiscal/actions"; export {encryptSecret} from "./lib/fiscal/crypto"; export {saveRecord} from "./lib/data/records-actions"; import {db} from "./lib/db"; export async function close(){await db.$client.end()}', resolveDir: process.cwd() }, outfile, bundle: true, platform: "node", format: "esm", packages: "external", logLevel: "silent", plugins: [{ name: "context", setup(plugin) {
    plugin.onResolve({ filter: /.*/ }, args => args.path in fixtures ? { path: args.path, namespace: "fixture" } : undefined)
    plugin.onLoad({ filter: /.*/, namespace: "fixture" }, args => ({ contents: fixtures[args.path], loader: "js" }))
  } }] })
  process.env.DATABASE_URL = url.toString()
  api = await import(pathToFileURL(outfile).href)
  await sql`insert into users(id,name,email,password_hash,role) values('admin-test','Teste','fiscal@example.invalid','disabled','admin')`
  await sql`insert into billing_settings(id,environment,webhook_token_encrypted) values('default','sandbox',${api.encryptSecret("test-webhook")})`
  await sql`insert into fiscal_settings(id,environment,token_encrypted,auto_issue_on_payment) values('default','homologacao',${api.encryptSecret("synthetic-fiscal-token")},true)`
  const client = { id: "client", name: "Cliente", legalName: "Cliente Teste", documentType: "cnpj", document: "12345678000195", email: "client@example.invalid", whatsapp: "71999999999", address: { zip: "40020000", street: "Rua Teste", number: "10", district: "Centro", city: "Salvador", state: "BA" } }
  await sql`insert into crm_records(resource,id,data,created) values('clients','client',${sql.json(client)},true)`
  globalThis.fetch = async (input, options) => {
    const u = new URL(input)
    if (u.hostname === "viacep.com.br") return Response.json({ ibge: "2927408", localidade: "Salvador", uf: "BA" })
    assert.equal(u.hostname, "api.brasilnfe.com.br", "Rede real proibida")
    calls++
    if (mode === "timeout") throw Error("Timeout sintético")
    const body = JSON.parse(options.body)
    assert.equal(body.TipoAmbiente, 2)
    assert.equal(body.nFSInfo[0].Servico.Valores.ValorServico, 100)
    if (mode === "rejected") return Response.json({ StatusLote: 3, Error: "Código de serviço inválido" })
    return Response.json({ StatusLote: 1, Notas: [{ IdentificadorInterno: body.nFSInfo[0].IdentificadorInterno, NumeroNFSe: String(calls), Base64Doc: "UERG", Base64Xml: "WE1M" }] })
  }
  const addCharge = async (id, patch = {}) => {
    const data = { id, clientId: "client", description: "Serviço contratado", amount: 100, status: "pendente", gatewayEnvironment: "sandbox", gatewayId: `pay_${id}`, ...patch }
    await sql`insert into crm_records(resource,id,data,created) values('charges',${id},${sql.json(data)},true)`
    await sql`insert into boletos(charge_id,environment,gateway_id,status,amount,due_date) values(${id},'sandbox',${`pay_${id}`},'pendente',100,'2026-11-20')`
  }
  const event = async (id, eventId = id, status = "RECEIVED") => api.POST(new Request("http://test/api/webhooks/asaas", { method: "POST", headers: { "asaas-access-token": "test-webhook" }, body: JSON.stringify({ id: eventId, event: "PAYMENT_RECEIVED", payment: { id: `pay_${id}`, status, value: 100, paymentDate: "2026-11-07" } }) }))
  const flush = async () => { const batch = callbacks.splice(0); await Promise.all(batch.map(callback => callback())) }
  const job = async id => (await sql`select data from crm_records where resource='fiscalJobs' and data->>'chargeId'=${id}`)[0]?.data
  await addCharge("paid")
  assert.equal((await event("paid")).status, 200)
  assert.equal(calls, 0, "Webhook responde antes de transmitir a nota")
  assert.equal((await job("paid")).status, "pending")
  await flush()
  assert.equal(calls, 1)
  assert.equal((await sql`select status from invoices where charge_id='paid'`)[0].status, "emitida")
  await event("paid")
  await event("paid", "confirmed")
  await flush()
  assert.equal(calls, 1, "Reenvios do webhook não duplicam notas")

  await addCharge("concurrent", { status: "pago" })
  const ids = await Promise.all(Array.from({ length: 5 }, () => api.enqueuePaidCharge("concurrent")))
  assert.equal(new Set(ids).size, 1)
  await Promise.all(ids.map(id => api.processFiscalJob(id)))
  assert.equal(calls, 2)
  assert.equal((await sql`select id from invoices where charge_id='concurrent'`).length, 1)

  await addCharge("missing", { status: "pago", clientId: "absent" })
  const missing = await api.enqueuePaidCharge("missing"); await api.processFiscalJob(missing)
  assert.equal((await job("missing")).status, "blocked")
  assert.equal(calls, 2)
  await sql`update crm_records set data=data || '{"clientId":"client"}'::jsonb where resource='charges' and id='missing'`
  await api.retryAutomaticFiscalJob(missing)
  assert.equal((await job("missing")).status, "completed")
  assert.equal(calls, 3)

  await addCharge("timeout", { status: "pago" })
  mode = "timeout"
  const uncertain = await api.enqueuePaidCharge("timeout"); await api.processFiscalJob(uncertain)
  assert.equal((await job("timeout")).status, "review")
  await api.processFiscalJob(uncertain)
  assert.equal(calls, 4, "Não reenvia automaticamente uma transmissão incerta")
  assert.equal((await sql`select status from invoices where charge_id='timeout'`)[0].status, "processando")
  mode = "success"

  await sql`update fiscal_settings set environment='producao'`
  await addCharge("sandbox", { status: "pago" })
  const sandbox = await api.enqueuePaidCharge("sandbox"); await api.processFiscalJob(sandbox)
  assert.match((await job("sandbox")).error, /teste.*produção/)
  assert.equal(calls, 4)
  await sql`update fiscal_settings set environment='homologacao',auto_issue_on_payment=false`
  await addCharge("disabled", { status: "pago" })
  const disabled = await api.enqueuePaidCharge("disabled"); await api.processFiscalJob(disabled)
  assert.match((await job("disabled")).error, /Ative/)
  await sql`update fiscal_settings set auto_issue_on_payment=true`
  await api.retryAutomaticFiscalJob(disabled)
  assert.equal(calls, 5)

  // Manual payment confirmation enters the same persisted queue.
  await addCharge("manual")
  await api.saveRecord("charges", "manual", { status: "pago", paidAt: "2026-11-07T12:00:00Z" })
  assert.equal((await job("manual")).status, "pending")
  await flush()
  assert.equal((await job("manual")).status, "completed")

  // Unique index also protects manual issuance racing automatic issuance.
  await addCharge("race", { status: "pago" })
  const race = await api.enqueuePaidCharge("race")
  const input = { clientId: "client", chargeId: "race", tomador: { ...client, phone: client.whatsapp, address: { ...client.address, cep: client.address.zip, uf: "BA", ibgeCode: "2927408" } }, serviceDescription: "Serviço contratado", serviceItem: "010701", amount: 100, issRate: 5, issRetained: false, retentions: { ir: 0, pis: 0, cofins: 0, csll: 0, inss: 0 }, competenceDate: "2026-11-07" }
  const beforeRace = calls
  await Promise.all([api.processFiscalJob(race), api.issueInvoiceAction(input)])
  assert.equal((await sql`select id from invoices where charge_id='race'`).length, 1)
  assert.equal(calls, beforeRace + 1)

  await addCharge("recovery", { status: "pago" })
  await api.enqueuePaidCharge("recovery")
  await api.processPendingFiscalJobs()
  assert.equal((await job("recovery")).status, "completed")
  await addCharge("refunded", { status: "pago" })
  const refunded = await api.enqueuePaidCharge("refunded")
  await sql`update crm_records set data=data || '{"status":"cancelado"}'::jsonb where resource='charges' and id='refunded'`
  const beforeRefund = calls
  await api.processFiscalJob(refunded)
  assert.equal(calls, beforeRefund)
  assert.equal((await job("refunded")).status, "blocked")

  await addCharge("rejected", { status: "pago" })
  mode = "rejected"
  const rejected = await api.enqueuePaidCharge("rejected"); await api.processFiscalJob(rejected)
  const [rejectedInvoice] = await sql`select status,error_message from invoices where charge_id='rejected'`
  assert.equal(rejectedInvoice.status, "rejeitada")
  assert.match(rejectedInvoice.error_message, /serviço inválido/)
  mode = "success"

  await addCharge("missing-token", { status: "pago" })
  await sql`update fiscal_settings set token_encrypted=null`
  const noToken = await api.enqueuePaidCharge("missing-token"); await api.processFiscalJob(noToken)
  assert.match((await job("missing-token")).error, /token/)
  await sql`update fiscal_settings set token_encrypted=${api.encryptSecret("synthetic-fiscal-token")}`

  await addCharge("changed-env", { status: "pago" })
  const changedEnvironment = await api.enqueuePaidCharge("changed-env")
  await sql`update fiscal_settings set environment='producao'`
  await api.processFiscalJob(changedEnvironment)
  assert.match((await job("changed-env")).error, /ambiente fiscal mudou/)
  await sql`update fiscal_settings set environment='homologacao'`

  await addCharge("interrupted", { status: "pago" })
  const interrupted = await api.enqueuePaidCharge("interrupted")
  await sql`update crm_records set data=data || '{"status":"processing"}'::jsonb,updated_at=now()-interval '3 minutes' where resource='fiscalJobs' and id=${interrupted}`
  await api.processPendingFiscalJobs()
  assert.equal((await job("interrupted")).status, "completed")

  for (const role of ["comercial", "operacao"]) {
    globalThis.__fiscalTest.role = role
    await assert.rejects(api.retryAutomaticFiscalJob(missing), /permissão/)
  }
  console.log("OK: pagamento via webhook e manual, fila persistente, recuperação, concorrência, bloqueios, permissões e proteção contra duplicidade/incerteza. Nenhuma nota real emitida.")
} finally {
  globalThis.fetch = originalFetch
  delete globalThis.__fiscalTest
  if (api) await api.close()
  await sql.end()
  await base.unsafe(`drop schema if exists "${schema}" cascade`)
  await base.end()
  process.env.DATABASE_URL = original
}
