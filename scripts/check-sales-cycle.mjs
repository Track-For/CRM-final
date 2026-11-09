import { config } from "dotenv"
import postgres from "postgres"
import { build } from "esbuild"
import { mkdir } from "node:fs/promises"
import { randomBytes, randomUUID } from "node:crypto"
import assert from "node:assert/strict"
import { pathToFileURL } from "node:url"
import path from "node:path"

// Banco real e lógica real do store/servidor; transporte e provedores externos isolados.
config({ path: ".env.local", quiet: true })
const original = process.env.DATABASE_URL
assert.ok(original && ["localhost", "127.0.0.1"].includes(new URL(original).hostname), "Teste restrito a banco local")
const base = postgres(original, { max: 1, onnotice: () => {} })
const schema = `sales_cycle_test_${randomBytes(6).toString("hex")}`
const url = new URL(original)
url.searchParams.set("search_path", schema)
const sql = postgres(url.toString(), { max: 1, onnotice: () => {} })
let api
const pending = new Set()
const queues = new Map()
const failures = []
function persist(resource, id, data, created = false) {
  const key = `${resource}:${id}`
  const task = (queues.get(key) || Promise.resolve()).then(() => data === null
    ? api.deleteRecord(resource, id)
    : api.saveRecord(resource, id, Object.fromEntries(Object.entries(data).map(([k, v]) => [k, v === undefined ? null : v])), created))
  queues.set(key, task)
  pending.add(task)
  task.catch(error => failures.push(error)).finally(() => pending.delete(task))
  return task
}
async function flush() {
  while (pending.size) await Promise.allSettled([...pending])
  assert.deepEqual(failures.map(error => error.message), [], "Nenhuma gravação do store pode falhar")
}
const row = async (resource, id) => (await sql`select data from crm_records where resource=${resource} and id=${id} and not deleted`)[0]?.data
try {
  await base.unsafe(`create schema "${schema}"`)
  for (const table of ["users", "crm_records"]) await base.unsafe(`create table "${schema}"."${table}" (like public."${table}" including all)`)
  await sql`insert into users(id,name,email,password_hash,role) values('actor','Teste','cycle@example.invalid','disabled','admin')`
  const dir = path.resolve(".next/local-sales-cycle")
  await mkdir(dir, { recursive: true })
  const outfile = path.join(dir, "cycle.mjs")
  const fixtures = {
    "@/lib/auth/session": 'import {createHash} from "node:crypto"; export const sha256Hex=v=>createHash("sha256").update(v).digest("hex"); export async function getCurrentUser(){return {id:"actor",role:"admin"}}',
    "@/lib/auth/user-actions": 'export async function getCrmIdentity(){return {current:{id:"actor",role:"admin"},users:[]}}',
    "@/lib/store/ui-store": 'export const useUiStore={getState:()=>({role:"admin"})}',
    "@/lib/data/api": 'export const createResource=(r,d)=>globalThis.__salesCycle.persist(r,d.id,d,true); export const updateResource=(r,id,d)=>globalThis.__salesCycle.persist(r,id,d); export const deleteResource=(r,id)=>globalThis.__salesCycle.persist(r,id,null); export const getDatabase=async()=>{throw Error("Bootstrap não usado neste teste")}; export const actions={sendWhatsapp:async()=>{throw Error("Envio externo proibido no teste")}}',
    "@/lib/boleto/import": 'export async function syncAsaasReceivables(){return {connected:false}}',
    "@/lib/integrations/webhooks": 'export async function dispatchCrmEvent(){}',
    "next/headers": 'export async function headers(){return new Headers({"x-forwarded-for":"203.0.113.20"})}',
  }
  await build({ stdin: { contents: 'export * from "./lib/data/records-actions"; export * from "./lib/forms/public-actions"; export * from "./lib/projects/actions"; export {useCrmStore} from "./lib/store/crm-store"; import {db} from "./lib/db"; export async function closeDatabase(){await db.$client.end()}', resolveDir: process.cwd(), sourcefile: "sales-cycle.ts" }, outfile, bundle: true, platform: "node", format: "esm", packages: "external", logLevel: "silent", plugins: [{ name: "isolate-fiscal-scheduling", setup(plugin) {
    plugin.onResolve({ filter: /^@\/lib\/fiscal\/automatic-schedule$/ }, () => ({ path: "fiscal-schedule", namespace: "fiscal-fixture" }))
    plugin.onLoad({ filter: /.*/, namespace: "fiscal-fixture" }, () => ({ contents: "export async function schedulePaidChargeInvoice(){}", loader: "js" }))
  } }, { name: "isolated-transport", setup(builder) {
    builder.onResolve({ filter: /.*/ }, args => args.path in fixtures ? { path: args.path, namespace: "fixture" } : undefined)
    builder.onLoad({ filter: /.*/, namespace: "fixture" }, args => ({ contents: fixtures[args.path], loader: "js" }))
  } }] })
  process.env.DATABASE_URL = url.toString()
  globalThis.__salesCycle = { persist }
  api = await import(pathToFileURL(outfile).href + `?run=${Date.now()}`)
  const store = api.useCrmStore
  const state = () => store.getState()
  store.setState({ currentUserId: "actor" })
  const form = { id: "cycle-form", slug: "cycle-test", name: "Ciclo de venda", active: true, submissions: 0, defaultSource: "manual", fields: [{ key: "name", label: "Nome", type: "text", required: true }, { key: "email", label: "E-mail", type: "email", required: true }] }
  await api.saveRecord("forms", form.id, form, true)
  const requestId = randomUUID()
  await api.submitPublicFormAction(form.slug, { name: "Cliente do ciclo", email: "cycle@example.invalid" }, requestId)
  await api.submitPublicFormAction(form.slug, { name: "Cliente do ciclo", email: "cycle@example.invalid" }, requestId)
  const leadId = `form_${requestId}`
  assert.equal((await row("forms", form.id)).submissions, 1)
  state().replace("leads", [await row("leads", leadId)])
  const deal = { id: "cycle-deal", title: "Site do ciclo", leadId, pipelineId: state().pipelines[0].id, stage: "novo_lead", value: 1000, monthlyFee: 100, probability: 10, history: [], ownerId: "actor", projectType: "site", startDate: "2026-10-15T15:00:00.000Z", expectedCloseDate: "", stageChangedAt: new Date().toISOString(), paymentPlan: { method: "pix", pixKey: "fixture-only", milestones: [{ id: "entry", label: "Entrada", amount: 500, percent: 50, dueDate: "2026-11-10" }, { id: "delivery", label: "Entrega", amount: 500, percent: 50, dueDate: "2026-11-20" }] } }
  state().add("deals", deal)
  for (const stage of ["contato_feito", "call_agendada", "proposta_enviada"]) state().moveDeal(deal.id, stage)
  const quote = { id: "cycle-quote", number: "ORC-CYCLE", leadId, dealId: deal.id, status: "rascunho", total: 1000, monthlyFee: 100, deadlineDays: 20, createdAt: new Date().toISOString() }
  state().add("quotes", quote)
  state().update("quotes", quote.id, { status: "enviado" })
  state().update("quotes", quote.id, { status: "aceito" })
  await flush()
  assert.equal((await row("quotes", quote.id)).status, "aceito")
  assert.throws(() => state().moveDeal(deal.id, "ganho", { wonDate: "2026-02-30" }))
  assert.notEqual(state().deals.find(item => item.id === deal.id).stage, "ganho")
  state().moveDeal(deal.id, "ganho", { wonDate: "2026-10-20" })
  await flush()
  assert.equal((await row("deals", deal.id)).wonAt, "2026-10-20T15:00:00.000Z")
  assert.equal((await row("deals", deal.id)).startDate, deal.startDate)
  assert.notEqual((await row("deals", deal.id)).stageChangedAt, "2026-10-20T15:00:00.000Z")
  const clientId = state().leads[0].clientId
  assert.ok(clientId)
  assert.equal((await row("leads", leadId)).status, "convertido")
  assert.equal((await row("clients", clientId)).leadId, leadId)
  assert.equal((await row("deals", deal.id)).clientId, clientId)
  let overlay = await api.loadRecordOverlay()
  const project = overlay.find(item => item.resource === "projects" && item.data.dealId === deal.id).data
  assert.equal(project.clientId, clientId)
  assert.equal(project.startDate, "2026-10-15")
  assert.ok(project.stages.length)
  assert.ok(project.deliveryDate)
  const projectCharges = overlay.filter(item => item.resource === "charges" && item.data.dealId === deal.id && !item.data.subscriptionId).map(item => item.data)
  assert.equal(projectCharges.length, 2)
  assert.equal(projectCharges.reduce((sum, item) => sum + item.amount, 0), 1000)
  assert.equal((await row("subscriptions", `sub_deal_${deal.id}`)).status, "aguardando")
  for (const resource of ["charges", "entries", "subscriptions"]) state().replace(resource, overlay.filter(item => item.resource === resource && !item.deleted).map(item => item.data))
  for (const [index, charge] of projectCharges.entries()) {
    const paidAt = "2026-11-20T15:00:00.000Z"
    state().update("charges", charge.id, { status: "pago", paidAt })
    const entry = state().entries.find(item => item.chargeId === charge.id)
    assert.ok(entry)
    state().update("entries", entry.id, { status: "pago", paidAt })
    await flush()
    assert.equal((await row("charges", charge.id)).status, "pago")
    assert.equal((await row("entries", entry.id)).status, "pago")
    if (index === 0) assert.equal((await row("subscriptions", `sub_deal_${deal.id}`)).status, "aguardando")
  }
  overlay = await api.loadRecordOverlay()
  const subscription = await row("subscriptions", `sub_deal_${deal.id}`)
  assert.equal(subscription.status, "ativa")
  assert.equal(subscription.startDate.slice(0, 10), "2026-11-23")
  const monthly = overlay.filter(item => item.resource === "charges" && item.data.subscriptionId === subscription.id)
  assert.equal(monthly.length, 1)
  assert.equal(monthly[0].data.amount, 100)
  assert.equal(monthly[0].data.status, "pendente")
  const execution = await api.getProjectExecutionAction(clientId, project.id)
  const task = await api.createProjectTaskAction(clientId, project.id, execution.project.stages[0].id, "Conferir entrega do ciclo")
  await assert.rejects(api.saveProjectExecutionAction({ clientId, projectId: project.id, expectedVersion: execution.project.executionVersion || 0, startDate: execution.project.startDate, deliveryDate: execution.project.deliveryDate, paused: false, stages: execution.project.stages.map((item, index) => index === 0 ? { ...item, status: "concluida" } : item) }), /Conclua as tarefas/)
  await api.saveRecord("tasks", task.id, { status: "done" })
  const completed = await api.saveProjectExecutionAction({ clientId, projectId: project.id, expectedVersion: execution.project.executionVersion || 0, startDate: execution.project.startDate, deliveryDate: execution.project.deliveryDate, paused: false, stages: execution.project.stages.map(item => ({ ...item, status: "concluida" })) })
  assert.equal(completed.status, "entregue")
  state().moveDeal(deal.id, "proposta_enviada")
  await flush()
  assert.equal((await row("clients", clientId)).conversionReverted, true)
  for (const charge of projectCharges) assert.equal((await row("charges", charge.id)).status, "pago")
  state().moveDeal(deal.id, "ganho")
  await flush()
  const defaultWonAt = (await row("deals", deal.id)).wonAt
  assert.equal(new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date(defaultWonAt)), new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date()))
  await api.loadRecordOverlay()
  await api.loadRecordOverlay()
  assert.equal((await row("clients", clientId)).conversionReverted, false)
  for (const [resource, expected] of [["clients", 1], ["projects", 1], ["subscriptions", 1], ["charges", 3], ["entries", 3]]) {
    const count = await sql`select count(*)::int as n from crm_records where resource=${resource} and not deleted`
    assert.equal(count[0].n, expected, `${resource}: sem duplicação após recarga e reconversão`)
  }
  for (const [id, value, monthlyFee] of [["free", 0, 0], ["maintenance-only", 0, 100], ["project-only", 100, 0]]) {
    const newLead = { ...state().leads[0], id: `lead-${id}`, clientId: undefined, status: "novo" }
    state().add("leads", newLead)
    const newDeal = { ...deal, id, leadId: newLead.id, clientId: undefined, value, monthlyFee, paymentPlan: { method: "pix", pixKey: "fixture-only", milestones: value ? [{ id: "single", label: "À vista", amount: value, percent: 100 }] : [] } }
    state().add("deals", newDeal)
    state().moveDeal(id, "ganho")
    await flush()
    const records = await api.loadRecordOverlay()
    assert.equal((await row("deals", id)).value, value)
    assert.equal((await row("deals", id)).monthlyFee, monthlyFee)
    assert.ok(records.some(item => item.resource === "projects" && item.data.dealId === id))
    const ownCharges = records.filter(item => item.resource === "charges" && item.data.dealId === id)
    assert.equal(ownCharges.filter(item => !item.data.subscriptionId).length, value ? 1 : 0)
    assert.equal(ownCharges.filter(item => item.data.subscriptionId).length, monthlyFee ? 1 : 0)
    if (!monthlyFee) assert.equal(await row("subscriptions", `sub_deal_${id}`), undefined)
    await assert.rejects(api.saveRecord("deals", id, { value: -1 }))
    await assert.rejects(api.saveRecord("deals", id, { monthlyFee: -1 }))
  }
  console.log("OK: valores zerados persistidos e convertidos, sem cobranças de projeto ou manutenção de valor zero; manutenção sem implantação não fica aguardando pagamento inexistente.")
  console.log("OK: formulário idempotente → lead → etapas do Kanban → proposta enviada/aceita → venda ganha → cliente/projeto → parcelas → baixa local e financeiro → mensalidade → entrega; reconversão e recarga sem duplicação.")
  console.log("Escopo: banco e regras reais; sem navegador, envio externo, emissão Asaas ou webhook real de pagamento.")
} finally {
  if (api) await api.closeDatabase()
  await sql.end()
  await base.unsafe(`drop schema if exists "${schema}" cascade`)
  await base.end()
  process.env.DATABASE_URL = original
  delete globalThis.__salesCycle
}
