import { test } from "node:test"
import assert from "node:assert/strict"
import { build } from "esbuild"
import { mkdir } from "node:fs/promises"
import { pathToFileURL } from "node:url"
import path from "node:path"
const dir = path.resolve(".next/project-unit"); await mkdir(dir, { recursive: true })
const outfile = path.join(dir, "plan.mjs")
await build({ entryPoints: ["lib/projects/plan.ts"], outfile, bundle: true, platform: "node", format: "esm", packages: "external", logLevel: "silent" })
const { projectForDeal, projectPlanSchema, projectProgress, projectStatus, defaultProjectStages } = await import(pathToFileURL(outfile).href)
const deal = { id: "deal-test", title: "Site", clientId: "client-test", projectType: "site", value: 100, wonAt: "2026-11-06T15:00:00.000Z", ownerId: "owner" }
const input = project => ({ clientId: project.clientId, projectId: project.id, expectedVersion: 0, startDate: project.startDate, deliveryDate: project.deliveryDate, paused: false, stages: project.stages })
test("projeto usa o orçamento aceito e preserva soma e datas do cronograma", () => {
  const project = projectForDeal(deal, deal.clientId, [{ id: "accepted", dealId: deal.id, status: "aceito", createdAt: "2026-11-01", deadlineDays: 20 }, { id: "draft", dealId: deal.id, status: "rascunho", createdAt: "2026-11-05", deadlineDays: 40 }])
  assert.equal(project.id, "deal_project_deal-test"); assert.equal(project.deliveryDate, "2026-11-26")
  assert.equal(project.stages.length, 4); assert.equal(project.stages.at(-1).dueDate, project.deliveryDate)
  assert.equal(project.stages[0].startDate, project.startDate)
  project.stages.forEach(stage => assert.equal(stage.assigneeId, "owner"))
  assert.ok(projectPlanSchema.safeParse(input(project)).success)
})
test("sem orçamento cria etapas editáveis sem inventar datas de entrega", () => {
  const project = projectForDeal(deal, deal.clientId, [])
  assert.equal(project.deliveryDate, ""); assert.equal(project.stages.length, 4)
  assert.ok(project.stages.every(stage => stage.startDate === "" && stage.dueDate === ""))
})
test("datas inválidas, prazos invertidos, etapas duplicadas e planos vazios são rejeitados", () => {
  const project = projectForDeal(deal, deal.clientId, []); const value = input(project)
  for (const patch of [{ stages: [] }, { startDate: "2026-02-30" }, { startDate: "2026-13-01" }, { deliveryDate: "2026-01-01" }, { stages: [project.stages[0], project.stages[0]] }, { stages: [{ ...project.stages[0], startDate: "2026-11-09", dueDate: "2026-11-08" }] }, { stages: [{ ...project.stages[0], name: "" }] }]) assert.equal(projectPlanSchema.safeParse({ ...value, ...patch }).success, false)
})
test("progresso conta etapas concluídas e andamento é independente do financeiro", () => {
  const stages = projectForDeal(deal, deal.clientId, []).stages
  assert.deepEqual(projectProgress(stages), { done: 0, total: 4, percent: 0 })
  stages[0].status = "concluida"
  assert.deepEqual(projectProgress(stages), { done: 1, total: 4, percent: 25 })
  assert.equal(projectStatus(stages, false), "em_andamento"); assert.equal(projectStatus(stages, true), "pausado")
  stages.forEach(stage => stage.status = "concluida")
  assert.equal(projectStatus(stages, false), "entregue")
  assert.deepEqual(projectProgress([]), { done: 0, total: 0, percent: 0 })
})
test("projetos antigos entregues não voltam ao planejamento ao abrir etapas", () => {
  const project = { ...projectForDeal(deal, deal.clientId, []), status: "entregue" }
  assert.ok(defaultProjectStages(project).every(stage => stage.status === "concluida"))
})
