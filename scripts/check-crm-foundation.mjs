import { config } from "dotenv"
import postgres from "postgres"
import { build } from "esbuild"
import { mkdir } from "node:fs/promises"
import { randomBytes, randomUUID } from "node:crypto"
import assert from "node:assert/strict"
import { pathToFileURL } from "node:url"
import path from "node:path"
config({ path: ".env.local", quiet: true })
const original = process.env.DATABASE_URL
assert.ok(original && ["localhost", "127.0.0.1"].includes(new URL(original).hostname), "Teste restrito a banco local")
process.env.APP_ENCRYPTION_KEY ||= randomBytes(32).toString("base64")
const base = postgres(original, { max: 1, onnotice: () => {} })
const schema = `foundation_test_${randomBytes(6).toString("hex")}`
const url = new URL(original); url.searchParams.set("search_path", schema)
const sql = postgres(url.toString(), { max: 1 })
let api
try {
  await base.unsafe(`create schema "${schema}"`)
  for (const table of ["users", "sessions", "auth_challenges", "crm_records", "whatsapp_messages", "whatsapp_contacts", "invoices"]) await base.unsafe(`create table "${schema}"."${table}" (like public."${table}" including all)`)
  await sql`insert into users(id,name,email,password_hash,role) values('actor','Admin','actor@example.invalid','disabled','admin')`
  const dir = path.resolve(".next/local-foundation"); await mkdir(dir, { recursive: true })
  const outfile = path.join(dir, "actions.mjs")
  await build({ stdin: { contents: 'export * from "./lib/data/records-actions"; export * from "./lib/projects/actions"; export * from "./lib/whatsapp/ai/access-actions"; export * from "./lib/whatsapp/ai/context"; export { POST as AI_CONTEXT_POST } from "./app/api/whatsapp/ai/context/route"; export * from "./lib/auth/user-actions"; export * from "./lib/forms/public-actions"; export * from "./lib/integrations/actions"; export { GET, POST } from "./app/api/v1/[resource]/route"; import { db } from "./lib/db"; export async function closeDatabase(){await db.$client.end()}', resolveDir: process.cwd(), sourcefile: "foundation-check.ts" }, outfile, bundle: true, platform: "node", format: "esm", packages: "external", logLevel: "silent", plugins: [{ name: "fixture", setup(plugin) {
    plugin.onResolve({ filter: /^@\/lib\/auth\/session$/ }, () => ({ path: "auth", namespace: "fixture" }))
    plugin.onResolve({ filter: /^@\/lib\/boleto\/import$/ }, () => ({ path: "asaas", namespace: "fixture" }))
    plugin.onResolve({ filter: /^@\/lib\/integrations\/webhooks$/ }, () => ({ path: "webhooks", namespace: "fixture" }))
    plugin.onResolve({ filter: /^next\/headers$/ }, () => ({ path: "headers", namespace: "fixture" }))
    plugin.onResolve({ filter: /^next\/server$/ }, () => ({ path: "server", namespace: "fixture" }))
    plugin.onLoad({ filter: /.*/, namespace: "fixture" }, args => ({ contents: {
      auth: 'import {createHash} from "node:crypto"; export const sha256Hex=v=>createHash("sha256").update(v).digest("hex"); export async function getCurrentUser(){return process.env.FOUNDATION_ROLE==="anonymous" ? null : {id:"actor",role:process.env.FOUNDATION_ROLE||"admin"}}',
      asaas: 'export async function syncAsaasReceivables(){return {connected:false}}',
      webhooks: 'export async function dispatchCrmEvent(){}; export async function sendAndLog(){return {status:204,ms:1}}',
      headers: 'export async function headers(){return new Headers({"x-forwarded-for":"203.0.113.10"})}',
      server: 'export class NextResponse { static json(body, options={}){return Response.json(body,options)} }'
    }[args.path], loader: "ts" }))
  } }] })
  process.env.DATABASE_URL = url.toString()
  api = await import(pathToFileURL(outfile).href + `?run=${Date.now()}`)
  for (const role of ["comercial", "operacao", "financeiro"]) {
    process.env.FOUNDATION_ROLE = role
    for (const resource of ["settings", "webhooks", "apiKeys", "userInvitations", ...(role === "financeiro" ? [] : ["entries", "charges"])]) {
      await assert.rejects(api.saveRecord(resource, "forbidden", { id: "forbidden" }, true))
      await assert.rejects(api.deleteRecord(resource, "forbidden"))
    }
  }
  process.env.FOUNDATION_ROLE = "admin"
  for (const resource of ["catalog", "addons", "hostingPlans", "pipelines", "lostReasons", "financialCategories"]) {
    await api.saveRecord(resource, "persisted", { id: "persisted", name: "Antes" }, true)
    await api.saveRecord(resource, "persisted", { name: "Depois" })
    assert.equal((await api.loadRecordOverlay()).find(row => row.resource === resource).data.name, "Depois")
  }
  const template = { id: "persisted", title: "Primeiro contato", category: "primeiro_contato", text: "Olá {nome}" }
  await api.saveRecord("quickMessages", template.id, template, true)
  await api.saveRecord("quickMessages", template.id, { ...template, title: "Contato revisado" })
  assert.equal((await api.loadRecordOverlay()).find(row => row.resource === "quickMessages").data.title, "Contato revisado")
  await assert.rejects(api.saveRecord("quickMessages", "invalid", { title: "Sem texto" }, true))
  await api.saveRecord("integrations", "n8n", { config: { apiKey: "secret-fixture" } })
  assert.ok(!(await sql`select data from crm_records where resource='integrations'`)[0].data.config)
  assert.equal((await api.loadRecordOverlay()).find(row => row.resource === "integrations").data.config.apiKey, "secret-fixture")
  process.env.FOUNDATION_ROLE = "comercial"
  const deal = { id: "fixture-deal", title: "Projeto fixture", clientId: "fixture-client", leadId: "fixture-lead", stage: "ganho", value: 100, monthlyFee: 20, wonAt: "2026-11-06T15:00:00.000Z", stageChangedAt: "2026-11-06T15:00:00.000Z", history: [{ toStage: "ganho" }], paymentPlan: { method: "pix", pixKey: "fixture", milestones: [{ id: "entry", label: "À vista", amount: 100, percent: 100, dueDate: "2026-11-21" }] } }
  await api.saveRecord("deals", deal.id, deal, true)
  assert.ok((await sql`select id from crm_records where resource='charges' and data->>'dealId'=${deal.id}`).length)
  assert.equal((await api.loadRecordOverlay()).some(row => ["charges", "entries", "subscriptions"].includes(row.resource)), false)
  await assert.rejects(api.saveRecord("charges", "manual-forbidden", { amount: 1 }, true))
  process.env.FOUNDATION_ROLE = "admin"
  await api.saveRecord("quotes", "project-quote", { id: "project-quote", dealId: deal.id, status: "aceito", createdAt: "2026-11-05", deadlineDays: 20 }, true)
  await api.saveRecord("clients", "fixture-client", { id: "fixture-client", name: "Cliente de projeto", status: "ativo", leadId: "fixture-lead" }, true)
  await api.saveRecord("deals", deal.id, { ownerId: "actor", projectType: "site" })
  const loadedProject = await api.getProjectExecutionAction("fixture-client", `deal_project_${deal.id}`)
  assert.equal(loadedProject.project.stages.length, 4)
  assert.equal(loadedProject.project.deliveryDate, "2026-11-26")
  await assert.rejects(api.getProjectExecutionAction("other-client", loadedProject.project.id))
  let projectInput = { clientId: "fixture-client", projectId: loadedProject.project.id, expectedVersion: 0, startDate: loadedProject.project.startDate, deliveryDate: loadedProject.project.deliveryDate, paused: false, stages: loadedProject.project.stages }
  process.env.FOUNDATION_ROLE = "financeiro"
  assert.equal((await api.getProjectExecutionAction("fixture-client", loadedProject.project.id)).canEdit, false)
  await assert.rejects(api.saveProjectExecutionAction(projectInput))
  process.env.FOUNDATION_ROLE = "operacao"
  assert.ok((await api.loadRecordOverlay()).some(row => row.resource === "projects"))
  assert.equal((await api.getProjectExecutionAction("fixture-client", loadedProject.project.id)).paymentMilestones.length, 0)
  const savedProject = await api.saveProjectExecutionAction({ ...projectInput, stages: projectInput.stages.map((stage, index) => index === 0 ? { ...stage, status: "em_andamento" } : stage) })
  assert.equal(savedProject.status, "em_andamento"); assert.equal(savedProject.executionVersion, 1)
  await assert.rejects(api.saveProjectExecutionAction(projectInput), /alterado por outra pessoa/)
  projectInput = { ...projectInput, stages: savedProject.stages, expectedVersion: 1 }
  const projectTask = await api.createProjectTaskAction("fixture-client", savedProject.id, savedProject.stages[0].id, "Conferir briefing")
  assert.equal(projectTask.projectStageId, savedProject.stages[0].id)
  await assert.rejects(api.saveProjectExecutionAction({ ...projectInput, stages: projectInput.stages.map((stage, index) => index === 0 ? { ...stage, status: "concluida" } : stage) }), /Conclua as tarefas/)
  await assert.rejects(api.saveProjectExecutionAction({ ...projectInput, stages: projectInput.stages.slice(1) }), /Desvincule/)
  await assert.rejects(api.saveRecord("tasks", projectTask.id, { clientId: "other-client" }))
  await api.saveRecord("tasks", projectTask.id, { status: "done" })
  const completedPhase = await api.saveProjectExecutionAction({ ...projectInput, stages: projectInput.stages.map((stage, index) => index === 0 ? { ...stage, status: "concluida" } : stage) })
  assert.equal(completedPhase.stages[0].status, "concluida")
  await assert.rejects(api.saveRecord("tasks", projectTask.id, { status: "todo" }), /Reabra a etapa/)
  await assert.rejects(api.createProjectTaskAction("fixture-client", savedProject.id, savedProject.stages[0].id, "Tarefa inválida"))
  await api.linkProjectTaskAction("fixture-client", savedProject.id, projectTask.id, savedProject.stages[1].id)
  await api.linkProjectTaskAction("fixture-client", savedProject.id, projectTask.id, null)
  assert.equal((await sql`select data from crm_records where resource='tasks' and id=${projectTask.id}`)[0].data.projectId, null)
  await assert.rejects(api.saveProjectExecutionAction({ ...projectInput, expectedVersion: completedPhase.executionVersion, stages: completedPhase.stages.map((stage, index) => index === 0 ? { ...stage, paymentMilestoneId: "entry" } : stage) }), /Somente Admin ou Comercial/)
  process.env.FOUNDATION_ROLE = "admin"
  const billingBefore = await sql`select resource,id,data from crm_records where resource in ('charges','entries') order by resource,id`
  await api.saveProjectExecutionAction({ ...projectInput, expectedVersion: completedPhase.executionVersion, stages: completedPhase.stages.map((stage, index) => index === 0 ? { ...stage, paymentMilestoneId: "entry" } : stage) })
  assert.deepEqual(await sql`select resource,id,data from crm_records where resource in ('charges','entries') order by resource,id`, billingBefore)
  const legacy = { ...savedProject, id: "legacy-project", stages: undefined, executionVersion: undefined, status: "em_andamento" }
  await sql`insert into crm_records(resource,id,data,created) values('projects',${legacy.id},${sql.json(legacy)},true)`
  const legacyLoaded = await api.getProjectExecutionAction("fixture-client", legacy.id)
  assert.equal(legacyLoaded.project.stages[0].status, "em_andamento")
  await api.createProjectTaskAction("fixture-client", legacy.id, legacyLoaded.project.stages[0].id, "Tarefa de projeto antigo")
  await assert.rejects(api.saveRecord("projects", savedProject.id, { stages: [] }))
  const invite = await api.inviteUserAction({ name: "Convidado", email: "invite@example.invalid", whatsapp: "71999999999", role: "comercial" })
  const token = invite.path.split("/").pop()
  assert.equal(invite.user.active, false)
  assert.equal(JSON.stringify(await api.loadRecordOverlay()).includes(token), false)
  const expired = await api.inviteUserAction({ name: "Expirado", email: "expired@example.invalid", whatsapp: "", role: "operacao" })
  await sql`update crm_records set data=jsonb_set(data,'{expiresAt}',to_jsonb('2000-01-01T00:00:00.000Z'::text)) where resource='userInvitations' and data->>'userId'=${expired.user.id}`
  await assert.rejects(api.acceptInvitationAction(expired.path.split("/").pop(), "senha-forte-de-teste-123"))
  await api.acceptInvitationAction(token, "senha-forte-de-teste-123")
  assert.equal((await sql`select active from users where id=${invite.user.id}`)[0].active, true)
  await assert.rejects(api.acceptInvitationAction(token, "senha-forte-de-teste-123"))
  await sql`insert into sessions(id,user_id,expires_at) values('fixture-session',${invite.user.id},now()+interval '1 day')`
  await api.updateUserAction(invite.user.id, { active: false })
  assert.equal((await sql`select * from sessions`).length, 0)
  await assert.rejects(api.updateUserAction("actor", { active: false }))
  const form = { id: "form-fixture", slug: "public-fixture", active: true, name: "Fixture", title: "Contato", defaultSource: "manual", submissions: 0, fields: [{ key: "name", label: "Nome", type: "text", required: true }, { key: "email", label: "E-mail", type: "email", required: true }] }
  await api.saveRecord("forms", form.id, form, true)
  process.env.FOUNDATION_ROLE = "anonymous"
  assert.ok(await api.getPublicFormAction(form.slug))
  await assert.rejects(api.loadRecordOverlay())
  const submission = randomUUID()
  await api.submitPublicFormAction(form.slug, { name: "Lead público", email: "lead@example.invalid" }, submission)
  await api.submitPublicFormAction(form.slug, { name: "Lead público", email: "lead@example.invalid" }, submission)
  assert.equal((await sql`select * from crm_records where resource='leads'`).length, 1)
  assert.equal((await sql`select data from crm_records where resource='forms'`)[0].data.submissions, 1)
  await assert.rejects(api.submitPublicFormAction(form.slug, { name: "", email: "bad" }, randomUUID()))
  for (let i = 0; i < 8; i++) await api.submitPublicFormAction(form.slug, { name: "Lead", email: "lead@example.invalid" }, randomUUID())
  await assert.rejects(api.submitPublicFormAction(form.slug, { name: "Lead", email: "lead@example.invalid" }, randomUUID()))
  process.env.FOUNDATION_ROLE = "admin"
  const key = await api.createApiKeyAction("fixture", ["leads:read", "leads:write", "tasks:write"])
  assert.equal(JSON.stringify(await api.loadRecordOverlay()).includes("tokenHash"), false)
  const request = { headers: new Headers({ authorization: `Bearer ${key.token}` }), nextUrl: new URL("https://crm.example/api/v1/leads"), text: async () => JSON.stringify({ name: "API lead" }) }
  assert.equal((await api.POST(request, { params: Promise.resolve({ resource: "leads" }) })).status, 201)
  assert.equal((await api.GET(request, { params: Promise.resolve({ resource: "leads" }) })).status, 200)
  assert.equal((await api.GET(request, { params: Promise.resolve({ resource: "charges" }) })).status, 403)
  const taskRequest = { ...request, text: async () => JSON.stringify({ title: "Tarefa API" }) }
  const taskResponse = await api.POST(taskRequest, { params: Promise.resolve({ resource: "tasks" }) })
  assert.equal(taskResponse.status, 201)
  const task = (await taskResponse.json()).data
  assert.equal(task.status, "todo"); assert.deepEqual(task.comments, []); assert.deepEqual(task.attachments, [])
  await api.deleteRecord("apiKeys", key.key.id)
  assert.equal((await api.GET(request, { params: Promise.resolve({ resource: "leads" }) })).status, 403)
  process.env.FOUNDATION_ROLE = "comercial"
  const aiPermissions = { projects: true, billing: false, quotes: true, publicInformation: "Atendimento de segunda a sexta" }
  await assert.rejects(api.createHermesAccessAction(aiPermissions))
  process.env.FOUNDATION_ROLE = "admin"
  const aiKey = await api.createHermesAccessAction(aiPermissions)
  const aiToken = `Bearer ${aiKey.token}`
  await sql`insert into crm_records(resource,id,data,created) values('clients','ai-a',${sql.json({ id: "ai-a", name: "Cliente AI A", contactName: "Pessoa A", whatsapp: "+5571999999999", status: "ativo", document: "DOC-PRIVADO" })},true),('clients','ai-b',${sql.json({ id: "ai-b", name: "CLIENTE B PRIVADO", whatsapp: "+5511988888888", status: "ativo" })},true),('projects','ai-project',${sql.json({ id: "ai-project", clientId: "ai-a", name: "Projeto do cliente A", stages: [{ name: "Design", status: "em_andamento", description: "NOTA INTERNA PRIVADA" }] })},true),('projects','ai-project-b',${sql.json({ id: "ai-project-b", clientId: "ai-b", name: "PROJETO B PRIVADO" })},true),('charges','ai-charge',${sql.json({ id: "ai-charge", clientId: "ai-a", amount: 50, status: "pendente" })},true)`
  await sql`insert into crm_records(resource,id,data,created) values('leads','ai-lead-a',${sql.json({ id: "ai-lead-a", clientId: "ai-a", name: "Pessoa A", whatsapp: "+5571999999999" })},true),('quotes','ai-quote-a',${sql.json({ id: "ai-quote-a", leadId: "ai-lead-a", number: "ORC-CLIENTE-A", status: "enviado", total: 50 })},true),('quotes','ai-quote-b',${sql.json({ id: "ai-quote-b", clientId: "ai-b", leadId: "ai-lead-a", number: "ORC-OUTRO-CLIENTE", status: "enviado", total: 5000 })},true)`
  await sql`insert into invoices(id,client_id,status,environment,tomador,service_description,service_item,amount,iss_rate,competence_date) values('ai-invoice','ai-a','emitida','homologacao','{}'::jsonb,'Serviço fixture','010701',50,5,'2026-11-06')`
  const instance = process.env.EVOLUTION_INSTANCE || "crm-principal"
  await sql`insert into whatsapp_messages(id,instance,provider_id,remote_jid,phone,direction,text,sent_at) values('ai-message',${instance},'ai-provider-id','5571999999999@s.whatsapp.net','5571999999999','in','Olá',now())`
  await assert.rejects(api.getHermesCustomerContext(null, { chatId: "5571999999999@s.whatsapp.net" }), error => error.status === 401)
  await assert.rejects(api.getHermesCustomerContext(`Bearer ${key.token}`, { chatId: "5571999999999@s.whatsapp.net" }), error => error.status === 403)
  await assert.rejects(api.getHermesCustomerContext(aiToken, { chatId: "120363000@g.us" }), error => error.status === 400)
  await assert.rejects(api.getHermesCustomerContext(aiToken, { chatId: "5571999999999@s.whatsapp.net", clientId: "ai-b" }), error => error.status === 400)
  const aiContext = await api.getHermesCustomerContext(aiToken, { chatId: "5571999999999@s.whatsapp.net" })
  assert.equal(aiContext.customer.name, "Pessoa A"); assert.equal(aiContext.projects.length, 1); assert.equal(aiContext.charges.length, 0); assert.equal(aiContext.quotes.length, 1); assert.equal(aiContext.quotes[0].number, "ORC-CLIENTE-A")
  for (const marker of ["DOC-PRIVADO", "NOTA INTERNA PRIVADA", "CLIENTE B PRIVADO", "PROJETO B PRIVADO"]) assert.equal(JSON.stringify(aiContext).includes(marker), false)
  await sql`insert into whatsapp_messages(id,instance,provider_id,remote_jid,phone,direction,text,sent_at) values('ai-unknown',${instance},'ai-provider-unknown','5585999999999@s.whatsapp.net','5585999999999','in','Olá',now())`
  const unknown = await api.getHermesCustomerContext(aiToken, { chatId: "5585999999999@s.whatsapp.net" })
  assert.equal(unknown.match, "unknown"); assert.equal(unknown.customer, null); assert.deepEqual(unknown.projects, [])
  await sql`insert into whatsapp_contacts(instance,lid,phone) values(${instance},'999999999999999@lid','5571999999999')`
  assert.equal((await api.getHermesCustomerContext(aiToken, { chatId: "999999999999999@lid" })).customer.name, "Pessoa A")
  await assert.rejects(api.getHermesCustomerContext(aiToken, { chatId: "777777777777777@lid" }), error => error.status === 409)
  const fullAiKey = await api.createHermesAccessAction({ ...aiPermissions, billing: true })
  const fullAiContext = await api.getHermesCustomerContext(`Bearer ${fullAiKey.token}`, { chatId: "5571999999999@s.whatsapp.net" }); assert.equal(fullAiContext.charges.length, 1); assert.equal(fullAiContext.invoices.length, 1)
  await sql`insert into crm_records(resource,id,data,created) values('clients','ai-duplicate',${sql.json({ id: "ai-duplicate", name: "Duplicado", whatsapp: "+5571999999999", status: "ativo" })},true)`
  const ambiguous = await api.getHermesCustomerContext(aiToken, { chatId: "5571999999999@s.whatsapp.net" })
  assert.equal(ambiguous.match, "ambiguous"); assert.deepEqual(ambiguous.projects, []); assert.deepEqual(ambiguous.charges, [])
  const aiResponse = await api.AI_CONTEXT_POST(new Request("https://crm.example/api/whatsapp/ai/context", { method: "POST", headers: { Authorization: aiToken }, body: JSON.stringify({ chatId: "5571999999999@s.whatsapp.net" }) }))
  assert.equal(aiResponse.status, 200); assert.match(aiResponse.headers.get("Cache-Control"), /no-store/)
  for (let i = 0; i < 26; i++) await api.getHermesCustomerContext(aiToken, { chatId: "5571999999999@s.whatsapp.net" })
  await assert.rejects(api.getHermesCustomerContext(aiToken, { chatId: "5571999999999@s.whatsapp.net" }), error => error.status === 429)
  await api.revokeHermesAccessAction(aiKey.id)
  await assert.rejects(api.getHermesCustomerContext(aiToken, { chatId: "5571999999999@s.whatsapp.net" }), error => error.status === 403)
  assert.equal((await api.getHermesAccessAction()).length, 1)
  console.log("OK: permissões, persistência, projetos/etapas/tarefas, conflitos de edição, Hermes/isolamento por contato, criptografia, convites, sessões, formulários e API.")
} finally {
  if (api) await api.closeDatabase()
  await sql.end(); await base.unsafe(`drop schema if exists "${schema}" cascade`); await base.end()
  process.env.DATABASE_URL = original
  delete process.env.FOUNDATION_ROLE
}
