// Exercita persistência, concorrência e autorização em schema isolado do Postgres local.
import { config } from "dotenv"
import postgres from "postgres"
import { build } from "esbuild"
import { mkdir } from "node:fs/promises"
import { randomBytes } from "node:crypto"
import { pathToFileURL } from "node:url"
import path from "node:path"
import assert from "node:assert/strict"
config({ path: ".env.local", quiet: true })
const database = process.env.DATABASE_URL
assert.ok(database && ["localhost", "127.0.0.1"].includes(new URL(database).hostname), "Somente banco local")
const base = postgres(database, { max: 1, onnotice: () => {} })
const schema = `commercial_test_${randomBytes(6).toString("hex")}`
const url = new URL(database); url.searchParams.set("search_path", schema)
const sql = postgres(url.toString(), { max: 1, onnotice: () => {} })
let api
try {
  await base.unsafe(`create schema "${schema}"`)
  for (const table of ["users", "crm_records"]) await base.unsafe(`create table "${schema}"."${table}" (like public."${table}" including all)`)
  process.env.DATABASE_URL = url.toString()
  globalThis.__commercialRole = "admin"
  const dir = path.resolve("node_modules/.cache/commercial-api-check"); await mkdir(dir, { recursive: true })
  const outfile = path.join(dir, "check.mjs")
  await build({ stdin: { contents: 'export {GET as list,POST as create} from "./app/api/v1/[resource]/route"; export {GET as detail,PATCH as patch} from "./app/api/v1/[resource]/[id]/route"; export {GET as forecast} from "./app/api/v1/forecast/route"; export {GET as openapi} from "./app/api/v1/openapi/route"; export * from "./lib/commercial/actions"; export {runReport} from "./lib/commercial/metrics"; export * from "./lib/commercial/automations"; export {createApiKeyAction} from "./lib/integrations/actions"; export {saveChargePaymentDate} from "./lib/finance/payment-actions"; export {rowPatchFromPayment} from "./lib/boleto/sync"; export {getReceiptMetrics} from "./lib/finance/receipt-actions"; import {db} from "./lib/db"; export async function close(){await db.$client.end()}', resolveDir: process.cwd() }, outfile, bundle: true, platform: "node", format: "esm", packages: "external", logLevel: "silent", plugins: [{ name: "auth-only", setup(p) {
    p.onResolve({ filter: /^@\/lib\/auth\/session$/ }, () => ({ path: "auth", namespace: "fixture" }))
    p.onResolve({ filter: /^@\/lib\/fiscal\/automatic-schedule$/ }, () => ({ path: "fiscal", namespace: "fixture" }))
    p.onLoad({ filter: /.*/, namespace: "fixture" }, args => ({ contents: args.path === "fiscal" ? "export async function schedulePaidChargeInvoice(){}" : 'import {createHash} from "node:crypto"; export const sha256Hex=v=>createHash("sha256").update(v).digest("hex"); export async function getCurrentUser(){return globalThis.__commercialRole === "anonymous" ? null : {id:"actor",role:globalThis.__commercialRole}}; export async function requireUser(){const u=await getCurrentUser();if(!u)throw Error("Não autenticado");return u}', loader: "js" }))
  } }] })
  api = await import(pathToFileURL(outfile).href)
  await sql`insert into users(id,name,email,password_hash,role,active) values('actor','Teste','fixture@example.invalid','disabled','admin',true),('seller','Vendedor','seller@example.invalid','disabled','comercial',true)`
  const scopes = ["leads:read", "leads:write", "tasks:read", "tasks:write", "deals:read", "deals:write", "clients:read", "clients:write", "pipelines:read", "reports:read"]
  const { token, key } = await api.createApiKeyAction("Integração fixture", scopes)
  const context = (resource, id) => ({ params: Promise.resolve({ resource, id }) })
  const req = (resource, method = "GET", body, extra = {}) => {
    const request = new Request(`https://crm.example.invalid/api/v1/${resource}`, { method, headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...extra }, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) })
    request.nextUrl = new URL(request.url); return request
  }
  const rule = { name: "Contato inicial", active: true, event: "lead.created", action: "create_task", title: "Ligar para {nome}", userId: "seller", dueDays: 1 }
  const { id: ruleId } = await api.saveCommercialRecord("automationRules", null, rule)
  const response = await api.create(req("leads", "POST", { name: "Lead fixture", source: "site" }, { "Idempotency-Key": "form-1" }), context("leads"))
  assert.equal(response.status, 201); const lead = (await response.json()).data
  const repeated = await Promise.all([1, 2].map(() => api.create(req("leads", "POST", { name: "Lead fixture", source: "site" }, { "Idempotency-Key": "form-1" }), context("leads"))))
  for (const r of repeated) { assert.equal(r.status, 200); assert.equal((await r.json()).data.id, lead.id) }
  const concurrent = await Promise.all([1, 2].map(() => api.create(req("clients", "POST", { name: "Cliente concorrente" }, { "Idempotency-Key": "client-concurrent" }), context("clients"))))
  assert.deepEqual(concurrent.map(r => r.status).sort(), [200, 201])
  assert.equal((await sql`select * from crm_records where resource='clients'`).length, 1)
  assert.equal((await api.create(req("leads", "POST", { name: "Outro" }, { "Idempotency-Key": "form-1" }), context("leads"))).status, 409)
  await Promise.all([api.processAutomationEvents(), api.processAutomationEvents()])
  const tasks = await sql`select data from crm_records where resource='tasks'`
  assert.equal(tasks.length, 1); assert.equal(tasks[0].data.title, "Ligar para Lead fixture"); assert.equal(tasks[0].data.leadId, lead.id); assert.equal(tasks[0].data.assigneeId, "seller")
  assert.equal((await sql`select * from crm_records where resource='automationRuns'`).length, 1)
  assert.equal((await api.create(req("leads", "POST", { name: "X", secret: "blocked" }), context("leads"))).status, 400)
  assert.equal((await api.create(req("tasks", "POST", { title: "X", clientId: "missing" }), context("tasks"))).status, 400)
  assert.equal((await api.create(req("leads", "POST", { name: "x".repeat(21000) }), context("leads"))).status, 413)
  const list = await api.list(req("leads?limit=1&source=site"), context("leads")); const page = await list.json()
  assert.equal(page.total, 1); assert.equal(page.data[0].id, lead.id); assert.equal(page.hasMore, false)
  assert.equal((await api.list(req("leads?limit=1.5"), context("leads"))).status, 400)
  assert.equal((await api.list(req("apiKeys"), context("apiKeys"))).status, 404)
  const edited = await api.patch(req("leads", "PATCH", { company: "Empresa" }), context("leads", lead.id)); assert.equal(edited.status, 200)
  assert.equal((await (await api.detail(req("leads"), context("leads", lead.id))).json()).data.company, "Empresa")
  const dealResponse = await api.create(req("deals", "POST", { title: "Negócio fixture", leadId: lead.id, pipelineId: "pip_sites", value: 2000, expectedCloseDate: "2026-11-30T15:00:00Z" }), context("deals"))
  assert.equal(dealResponse.status, 201); const deal = (await dealResponse.json()).data
  assert.equal((await api.patch(req("deals", "PATCH", { stage: "ganho" }), context("deals", deal.id))).status, 400)
  const forecast = await (await api.forecast(req("forecast?month=2026-11"))).json(); assert.equal(forecast.data.weighted, 200)
  const goal = { name: "Meta", month: "2026-11", metric: "wonValue", target: 5000 }
  await api.saveCommercialRecord("salesGoals", null, goal)
  const { id: reportId } = await api.saveCommercialRecord("savedReports", null, { name: "Por origem", resource: "deals", groupBy: "source", dateField: "createdAt", metric: "value", from: "2026-01-01", to: "2026-12-31" })
  assert.ok((await api.getCommercialData()).rows.some(r => r.id === reportId))
  globalThis.__commercialRole = "comercial"
  await assert.rejects(api.saveCommercialRecord("automationRules", ruleId, rule), /permissão/)
  assert.ok(!(await api.getCommercialData()).rows.some(r => r.resource === "automationRules" || r.resource === "automationRuns" || r.resource === "automationEvents"))
  globalThis.__commercialRole = "operacao"; await assert.rejects(api.getCommercialData(), /permissão/)
  globalThis.__commercialRole = "anonymous"; await assert.rejects(api.getCommercialData(), /autenticado/)
  globalThis.__commercialRole = "admin"
  // Responsável desativado causa rollback integral e permite recuperação do evento.
  await api.saveCommercialRecord("automationRules", ruleId, { ...rule, action: "assign_owner" })
  await sql`update users set active=false where id='seller'`
  await api.create(req("leads", "POST", { name: "Falha recuperável" }), context("leads"))
  for (let i = 0; i < 5; i++) await api.processAutomationEvents()
  const [failed] = await sql`select id from crm_records where resource='automationEvents' and data->>'state'='failed'`
  assert.ok(failed)
  assert.equal((await sql`select * from crm_records where resource='automationRuns'`).length, 1)
  await sql`update users set active=true where id='seller'`
  await api.retryAutomation(failed.id); await api.processAutomationEvents()
  assert.equal((await sql`select * from crm_records where resource='automationEvents' and data->>'state'='failed'`).length, 0)
  assert.equal((await sql`select * from crm_records where resource='leads' and data->>'ownerId'='seller'`).length, 1)
  const providerRow = { amount: "100.00", dueDate: "2026-09-18", paidAt: null }
  assert.equal(api.rowPatchFromPayment(providerRow, { id: "fixture-payment", value: 100 }, "pago").paidAt, null)
  assert.equal(api.rowPatchFromPayment(providerRow, { id: "fixture-payment", value: 100, paymentDate: "2026-09-18" }, "pago").paidAt.toISOString(), "2026-09-18T12:00:00.000Z")
  const originallyPaidAt = "2026-11-06T19:41:00Z"
  const projectPayment = { id: "receipt-project", description: "Projeto histórico", status: "pago", amount: 750, paidAt: originallyPaidAt, dueDate: "2026-09-18T15:00:00Z", dealId: deal.id }
  await sql`insert into crm_records(resource,id,data,created) values('charges',${projectPayment.id},${sql.json(projectPayment)},true),('entries','receipt-entry',${sql.json({ ...projectPayment, id: "receipt-entry", chargeId: projectPayment.id, type: "receita", categoryId: "fc_projetos" })},true)`
  const corrected = await api.saveChargePaymentDate(projectPayment.id, "2026-09-18", originallyPaidAt)
  assert.equal(corrected.charge.paidAt, "2026-09-18T15:00:00.000Z"); assert.equal(corrected.entries[0].paidAt, corrected.charge.paidAt); assert.equal(corrected.charge.dueDate, projectPayment.dueDate)
  const reportData = await api.getCommercialData()
  const paymentReport = { name: "Receita", resource: "deals", groupBy: "month", metric: "receivedValue", dateField: "paidAt", from: "2026-11-01", to: "2026-11-30", ownerId: "", pipelineId: "", status: "" }
  assert.deepEqual(api.runReport(paymentReport, reportData.rows, reportData.pipelines, reportData.projectPaidByDeal, reportData.receipts), [])
  assert.deepEqual(api.runReport({ ...paymentReport, from: "2026-09-01", to: "2026-09-30" }, reportData.rows, reportData.pipelines, reportData.projectPaidByDeal, reportData.receipts), [{ group: "2026-09", count: 1, value: 750 }])
  await api.saveCommercialRecord("savedReports", null, paymentReport)
  await assert.rejects(api.saveChargePaymentDate(projectPayment.id, "2026-09-19", originallyPaidAt), /alterado/)
  await assert.rejects(api.saveChargePaymentDate(projectPayment.id, "3000-01-01", corrected.charge.paidAt), /até hoje/)
  const monthly = { id: "receipt-monthly", status: "pendente", subscriptionId: "sub", amount: 150, dueDate: "2026-11-01T15:00:00Z" }
  await sql`insert into crm_records(resource,id,data,created) values('charges',${monthly.id},${sql.json(monthly)},true)`
  await api.saveChargePaymentDate(monthly.id, "2026-09-22", null)
  const receiptRequest = { current: { from: "2026-09-01T03:00:00.000Z", to: "2026-10-01T02:59:59.999Z" }, previous: { from: "2026-11-01T03:00:00.000Z", to: "2026-12-01T02:59:59.999Z" }, months: [] }
  const paidMetrics = await api.getReceiptMetrics(receiptRequest)
  const cashForecast = await (await api.forecast(req("forecast?month=2026-09"))).json()
  assert.equal(cashForecast.data.closed, 900); assert.equal(cashForecast.data.monthlyReceived, 150)
  assert.equal(paidMetrics.current.total, 900); assert.equal(paidMetrics.current.monthly, 150); assert.equal(paidMetrics.previous.total, 0)
  assert.equal((await sql`select * from crm_records where resource='paymentDateChanges'`).length, 2)
  const wonContract = { id: "won-receivable", title: "Contrato a receber", stage: "ganho", ownerId: "admin-test", pipelineId: "pending-pipe", value: 1000, wonAt: "2026-08-01" }
  const pendingContract = { id: "pending-contract", dealId: wonContract.id, description: "Entrega", status: "pendente", amount: 425.5, dueDate: "2026-09-28" }
  await sql`insert into crm_records(resource,id,data,created) values ('deals',${wonContract.id},${sql.json(wonContract)},true),('charges',${pendingContract.id},${sql.json(pendingContract)},true),('entries','pending-contract-mirror',${sql.json({ ...pendingContract, type: "receita", chargeId: pendingContract.id })},true)`
  const pendingForecast = await (await api.forecast(req("forecast?month=2026-09"))).json()
  assert.equal(pendingForecast.data.contractedReceivable, 425.5)
  assert.equal(pendingForecast.data.projected, pendingForecast.data.closed + pendingForecast.data.weighted + 425.5)
  assert.equal(pendingForecast.data.receivables[0].id, pendingContract.id)
  const commercialData = await api.getCommercialData()
  assert.equal(commercialData.contractReceivables.find(r => r.id === pendingContract.id).amount, 425.5)
  const futureForecast = await (await api.forecast(req("forecast?month=2026-10&pipelineId=pending-pipe"))).json()
  assert.equal(futureForecast.data.contractedReceivable, 0)
  await sql`update crm_records set data=data || '{"gatewayId":"provider-owned"}'::jsonb where resource='charges' and id=${monthly.id}`
  await assert.rejects(api.saveChargePaymentDate(monthly.id, "2026-09-23", "2026-09-22T15:00:00.000Z"), /Asaas/)
  globalThis.__commercialRole = "comercial"
  assert.equal((await api.getReceiptMetrics(receiptRequest)).current.total, 900)
  await assert.rejects(api.saveChargePaymentDate(projectPayment.id, "2026-09-19", corrected.charge.paidAt), /permissão/)
  globalThis.__commercialRole = "operacao"; await assert.rejects(api.getReceiptMetrics(receiptRequest), /permissão/)
  globalThis.__commercialRole = "admin"
  const spec = await (await api.openapi()).json(); assert.equal(spec.openapi, "3.1.0"); assert.ok(spec.paths["/leads/{id}"].patch)
  assert.equal((await api.list(req("charges"), context("charges"))).status, 403)
  const bucket = `${key.id}:${Math.floor(Date.now() / 60000)}`
  await sql`insert into crm_records(resource,id,data,created) values('apiRate',${bucket},'{"count":120}',true) on conflict(resource,id) do update set data=excluded.data`
  const limited = await api.list(req("leads"), context("leads")); assert.equal(limited.status, 429); assert.equal(limited.headers.get("Retry-After"), "60")
  await sql`update crm_records set deleted=true where resource='apiKeys' and id=${key.id}`
  assert.equal((await api.list(req("leads"), context("leads"))).status, 401)
  console.log("OK | Gestão comercial e API: persistência, previsões, permissões, idempotência concorrente, filtros, validação, regras, rollback, retomada, limites e revogação")
} finally {
  await api?.close(); await sql.end(); await base.unsafe(`drop schema if exists "${schema}" cascade`); await base.end()
}
