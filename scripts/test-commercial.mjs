import test from "node:test"
import assert from "node:assert/strict"
import { build } from "esbuild"
import { mkdir } from "node:fs/promises"
import { pathToFileURL } from "node:url"
import path from "node:path"
const dir = path.resolve("node_modules/.cache/commercial-tests")
await mkdir(dir, { recursive: true })
const outfile = path.join(dir, "pure.mjs")
await build({ stdin: { contents: 'export * from "./lib/commercial/model"; export * from "./lib/commercial/metrics"; export * from "./lib/integrations/api-contract"', resolveDir: process.cwd() }, outfile, bundle: true, platform: "node", format: "esm", packages: "external", logLevel: "silent" })
const api = await import(pathToFileURL(outfile).href)
const pipelines = [{ id: "p", stages: [{ key: "negociacao", probability: 75 }] }]
const deal = (id, patch = {}) => ({ id, title: id, pipelineId: "p", stage: "negociacao", probability: 50, value: 1000, ownerId: "a", expectedCloseDate: "2026-11-30T15:00:00Z", ...patch })
test("previsão separa recebimentos, contratos e negócios abertos por mês e responsável", () => {
  const deals = [deal("open"), deal("won", { stage: "ganho", wonAt: "2026-11-01T03:00:00Z" }), deal("lost", { stage: "perdido" }), deal("other-month", { expectedCloseDate: "2026-12-01T03:00:00Z" }), deal("no-date", { expectedCloseDate: "" }), deal("other-owner", { ownerId: "b" })]
  const result = api.forecast(deals, pipelines, "2026-11", "a", "", [{ id: "receipt", amount: 1000, paidAt: "2026-11-10T15:00:00Z", ownerId: "a", pipelineId: "p", monthly: false, source: "site" }])
  assert.equal(result.closed, 1000); assert.equal(result.weighted, 750); assert.equal(result.projected, 1750); assert.equal(result.potential, 1000); assert.equal(result.missingCloseDate, 1)
  assert.equal(api.forecast([deal("x", { probability: 200 })], [], "2026-11").weighted, 1000)
  assert.equal(api.localDay("2026-11-01T02:59:59Z"), "2026-10-31")
  assert.equal(api.localDay("2026-11-01"), "2026-11-01")
})
test("metas respeitam período, equipe, funil e contagem de leads", () => {
  const goal = { month: "2026-11", metric: "wonCount", target: 2, ownerId: "a", pipelineId: "p" }
  assert.deepEqual(api.goalProgress(goal, [deal("w", { stage: "ganho", wonAt: "2026-11-02T15:00:00Z" }), deal("x", { stage: "ganho", ownerId: "b", wonAt: "2026-11-02T15:00:00Z" })], []), { actual: 1, percent: 50, remaining: 1 })
  assert.equal(api.goalSchema.safeParse({ name: "x", ...goal, metric: "newLeads" }).success, false)
  assert.equal(api.goalSchema.safeParse({ name: "x", ...goal, target: 1.5 }).success, false)
  assert.equal(api.monthSchema.safeParse("2026-13").success, false)
})
test("relatório combina filtros, data de ganho e agrupamento sem incluir recursos diferentes", () => {
  const report = { resource: "deals", groupBy: "ownerId", dateField: "wonAt", from: "2026-11-01", to: "2026-11-30", metric: "weightedValue", status: "ganho", ownerId: "a", pipelineId: "p" }
  const rows = [deal("w", { stage: "ganho", wonAt: "2026-11-20T15:00:00Z" }), deal("old", { stage: "ganho", wonAt: "2026-10-31T15:00:00Z" })].map(d => ({ resource: "deals", id: d.id, data: d }))
  assert.deepEqual(api.runReport(report, [...rows, { resource: "leads", id: "l", data: {} }], pipelines), [{ group: "a", count: 1, value: 1000 }])
  assert.equal(api.reportSchema.safeParse({ ...report, name: "r", from: "2026-12-01" }).success, false)
  assert.equal(api.reportSchema.safeParse({ ...report, name: "r", resource: "tasks" }).success, false)
})
test("regras validam condições, ações e campos por tipo de evento", () => {
  const rule = { name: "follow-up", active: true, event: "deal.stage_changed", action: "create_task", title: "Ligar para {nome}", source: "site", stage: "negociacao", minValue: 1000, dueDays: 2 }
  const value = api.automationSchema.parse(rule)
  assert.equal(api.automationMatches(value, "deal.stage_changed", { source: "site", stage: "negociacao", value: 1200 }), true)
  for (const patch of [{ value: 999 }, { source: "manual" }, { stage: "novo_lead" }]) assert.equal(api.automationMatches(value, value.event, { source: "site", stage: "negociacao", value: 1200, ...patch }), false)
  assert.equal(api.automationSchema.safeParse({ ...rule, action: "assign_owner" }).success, false)
  assert.equal(api.automationSchema.safeParse({ ...rule, event: "lead.created" }).success, false)
})
test("contrato da API bloqueia campos internos, transições financeiras e paginação inválida", () => {
  assert.equal(api.leadCreate.safeParse({ name: "A", tokenHash: "secret" }).success, false)
  assert.equal(api.dealUpdate.safeParse({ stage: "ganho" }).success, false)
  assert.equal(api.taskUpdate.safeParse({ projectId: "foreign-project" }).success, false)
  for (const query of ["limit=1.5", "offset=-1", "limit=101", "offset=Infinity"]) assert.throws(() => api.pagination(new URLSearchParams(query)))
  assert.deepEqual(api.projectApiRecord("clients", "c", { name: "A", configEncrypted: "secret", tokenHash: "secret" }), { id: "c", name: "A" })
  const created = api.dealCreate.parse({ title: "Projeto", leadId: "lead", pipelineId: "p", value: 100, startDate: "2026-11-08T15:00:00Z" })
  assert.equal(created.expectedCloseDate, "")
  assert.equal(created.startDate, "2026-11-08T15:00:00Z")
  assert.equal(api.projectApiRecord("deals", "d", created).startDate, created.startDate)
  assert.equal(api.dealUpdate.safeParse({ startDate: "invalid" }).success, false)
})

test("meta financeira usa 597 recebidos em novembro e exclui contratos sem pagamento", () => {
  const goal = { id: "november", name: "Meta Novembro", month: "2026-11", metric: "receivedValue", target: 7000, ownerId: "", pipelineId: "" }
  const contracts = [deal("old-paid", { stage: "ganho", value: 1500, wonAt: "2026-11-06T15:00:00Z" }), deal("unpaid", { stage: "ganho", value: 2000, wonAt: "2026-11-06T15:00:00Z" })]
  const received = [{ month: "2026-09", ownerId: "a", pipelineId: "p", total: 1500 }, { month: "2026-10", ownerId: "a", pipelineId: "p", total: 597 }, { month: "2026-11", ownerId: "a", pipelineId: "p", total: 597 }]
  const progress = api.goalProgress(goal, contracts, [], received)
  assert.equal(progress.actual, 597); assert.equal(progress.remaining, 6403); assert.equal(progress.percent.toFixed(2), "8.53")
  assert.equal(api.goalProgress({ ...goal, month: "2026-09" }, contracts, [], received).actual, 1500)
  assert.equal(api.goalProgress({ ...goal, ownerId: "other" }, contracts, [], received).actual, 0)
  assert.equal(api.goalProgress({ ...goal, pipelineId: "other" }, contracts, [], received).actual, 0)
  assert.ok(api.goalSchema.safeParse({ name: "Meta", month: "2026-11", metric: "receivedValue", target: 7000.5 }).success)
})

test("receita do relatório usa pagamentos de novembro e exclui projeto recebido em setembro", () => {
  const report = { name: "Receita", resource: "deals", groupBy: "month", dateField: "paidAt", from: "2026-11-01", to: "2026-11-30", metric: "receivedValue", ownerId: "", pipelineId: "", status: "" }
  const rows = [{ resource: "deals", id: "dourado", data: deal("dourado", { value: 1500, stage: "ganho", createdAt: "2026-11-08T19:45:00Z", wonAt: "2026-11-08T19:50:00Z" }) }]
  const payment = (id, paidAt, amount, patch = {}) => ({ id, paidAt, amount, dealId: "dourado", monthly: false, ownerId: "a", pipelineId: "p", source: "site", ...patch })
  const receipts = [payment("entrada", "2026-09-17T15:00:00Z", 750), payment("entrega", "2026-09-24T15:00:00Z", 750), payment("mensalidade", "2026-11-08T15:00:00Z", 150, { monthly: true }), payment("outubro", "2026-11-01T02:59:59Z", 150), payment("dezembro", "2026-12-01T03:00:00Z", 150)]
  assert.ok(api.reportSchema.safeParse(report).success)
  assert.deepEqual(api.runReport(report, rows, pipelines, {}, receipts), [{ group: "2026-11", count: 1, value: 150 }])
  assert.deepEqual(api.runReport({ ...report, from: "2026-09-01", to: "2026-09-30" }, rows, pipelines, {}, receipts), [{ group: "2026-09", count: 2, value: 1500 }])
  assert.deepEqual(api.runReport({ ...report, from: "2026-11-09" }, rows, pipelines, {}, receipts), [])
  assert.deepEqual(api.runReport({ ...report, ownerId: "other" }, rows, pipelines, {}, receipts), [])
  assert.deepEqual(api.runReport({ ...report, pipelineId: "other" }, rows, pipelines, {}, receipts), [])
  assert.deepEqual(api.runReport({ ...report, status: "perdido" }, rows, pipelines, {}, receipts), [])
  assert.deepEqual(api.runReport(report, rows, pipelines), [])
  for (const patch of [{ dateField: "createdAt" }, { metric: "value" }, { resource: "tasks", groupBy: "ownerId" }]) assert.equal(api.reportSchema.safeParse({ ...report, ...patch }).success, false)
  assert.deepEqual(api.runReport({ ...report, from: "2026-11-30", to: "2026-11-30" }, rows, pipelines, {}, [payment("fim-do-dia", "2026-12-01T02:59:59.999Z", 150)]), [{ group: "2026-11", count: 1, value: 150 }])
})
