"use server"
import { randomUUID } from "node:crypto"
import { sql } from "drizzle-orm"
import { z } from "zod"
import { db, crmRecords, users } from "@/lib/db"
import { getCurrentUser } from "@/lib/auth/session"
import { assertResourceAccess } from "@/lib/data/resource-policy"
import { defaultProjectStages, projectForDeal, projectPlanSchema, projectStatus, type ProjectPlanInput } from "@/lib/projects/plan"
import type { Client, Deal, Project, Quote, Task } from "@/types"

async function authorize(write = false) {
  const user = await getCurrentUser()
  if (!user) throw new Error("Entre novamente para acessar o projeto.")
  assertResourceAccess(user.role, "projects", write ? "write" : "read")
  return user
}
async function record<T>(resource: string, id: string): Promise<T | null> {
  const [row] = await db.select({ data: crmRecords.data }).from(crmRecords).where(sql`${crmRecords.resource}=${resource} and ${crmRecords.id}=${id} and ${crmRecords.deleted}=false`).limit(1)
  return row ? row.data as T : null
}
async function projectContext(clientId: string, projectId: string) {
  z.string().min(1).max(120).parse(clientId); z.string().min(1).max(120).parse(projectId)
  const client = await record<Client>("clients", clientId)
  if (!client || client.deletedAt || client.conversionReverted) throw new Error("Cliente não encontrado.")
  let project = await record<Project>("projects", projectId)
  let deal = project?.dealId ? await record<Deal>("deals", project.dealId) : null
  if (!project && projectId.startsWith("deal_project_")) {
    deal = await record<Deal>("deals", projectId.slice("deal_project_".length))
    if (!deal || deal.stage !== "ganho" || !(deal.clientId === clientId || (client.leadId && deal.leadId === client.leadId))) throw new Error("Projeto não encontrado.")
    const quotes = await db.select({ data: crmRecords.data }).from(crmRecords).where(sql`${crmRecords.resource}='quotes' and ${crmRecords.deleted}=false and ${crmRecords.data}->>'dealId'=${deal.id}`)
    project = projectForDeal(deal, clientId, quotes.map(row => row.data as unknown as Quote))
    await db.insert(crmRecords).values({ resource: "projects", id: project.id, data: { ...project }, created: true }).onConflictDoNothing()
    project = (await record<Project>("projects", projectId))!
  }
  if (!project || project.clientId !== clientId) throw new Error("Projeto não encontrado neste cliente.")
  if (!project.stages) {
    const stages = defaultProjectStages(project)
    await db.update(crmRecords).set({ data: sql`${crmRecords.data} || ${JSON.stringify({ stages })}::jsonb`, created: true, updatedAt: new Date() }).where(sql`${crmRecords.resource}='projects' and ${crmRecords.id}=${project.id} and ${crmRecords.deleted}=false and not (${crmRecords.data} ? 'stages')`)
    project = (await record<Project>("projects", projectId)) || project
  }
  return { project: { ...project, stages: project.stages || defaultProjectStages(project), executionVersion: project.executionVersion || 0 }, deal }
}
export async function getProjectExecutionAction(clientId: string, projectId: string) {
  const user = await authorize()
  const { project, deal } = await projectContext(clientId, projectId)
  const canSeeBilling = user.role !== "operacao"
  return { project, paymentMilestones: canSeeBilling ? deal?.paymentPlan?.milestones || [] : [], canEdit: ["admin", "comercial", "operacao"].includes(user.role) }
}
export async function saveProjectExecutionAction(input: ProjectPlanInput) {
  const user = await authorize(true)
  const parsed = projectPlanSchema.safeParse(input)
  if (!parsed.success) throw new Error(parsed.error.issues[0].message)
  const value = parsed.data
  const { project, deal } = await projectContext(value.clientId, value.projectId)
  const owners = new Set(value.stages.map(stage => stage.assigneeId).filter(Boolean))
  if (owners.size) {
    const rows = await db.select({ id: users.id }).from(users).where(sql`${users.active}=true`)
    const active = new Set(rows.map(row => row.id))
    for (const stage of value.stages) if (stage.assigneeId && !active.has(stage.assigneeId) && project.stages.find(old => old.id === stage.id)?.assigneeId !== stage.assigneeId) throw new Error("Selecione um responsável ativo.")
  }
  for (const stage of value.stages) {
    const previous = project.stages.find(old => old.id === stage.id)
    if (user.role === "operacao" && stage.paymentMilestoneId !== previous?.paymentMilestoneId) throw new Error("Somente Admin ou Comercial podem vincular etapas de pagamento ao projeto.")
    if (stage.paymentMilestoneId && stage.paymentMilestoneId !== previous?.paymentMilestoneId && !deal?.paymentPlan?.milestones.some(item => item.id === stage.paymentMilestoneId)) throw new Error("Etapa de pagamento não encontrada neste projeto.")
  }
  const tasks = await db.select({ data: crmRecords.data }).from(crmRecords).where(sql`${crmRecords.resource}='tasks' and ${crmRecords.deleted}=false and ${crmRecords.data}->>'projectId'=${project.id}`)
  for (const { data } of tasks) {
    const stage = value.stages.find(stage => stage.id === data.projectStageId)
    if (!stage) throw new Error("Desvincule as tarefas antes de remover uma etapa.")
    if (stage.status === "concluida" && data.status !== "done") throw new Error(`Conclua as tarefas de ${stage.name} antes de finalizar a etapa.`)
  }
  const next = { ...project, startDate: value.startDate, deliveryDate: value.deliveryDate, stages: value.stages, status: projectStatus(value.stages, value.paused), executionVersion: value.expectedVersion + 1 }
  const [saved] = await db.update(crmRecords).set({ data: { ...next }, created: true, updatedBy: user.id, updatedAt: new Date() }).where(sql`${crmRecords.resource}='projects' and ${crmRecords.id}=${project.id} and ${crmRecords.deleted}=false and coalesce((${crmRecords.data}->>'executionVersion')::int,0)=${value.expectedVersion}`).returning({ id: crmRecords.id })
  if (!saved) throw new Error("Este projeto foi alterado por outra pessoa. Recarregue o projeto antes de salvar.")
  return next
}
export async function createProjectTaskAction(clientId: string, projectId: string, stageId: string, title: string) {
  const user = await authorize(true)
  const { project } = await projectContext(clientId, projectId)
  const stage = project.stages.find(stage => stage.id === stageId)
  if (!stage || stage.status === "concluida") throw new Error("Escolha uma etapa ainda não concluída.")
  // A etapa precisa ter sido salva antes da criação da tarefa.
  const stored = await record<Project>("projects", project.id)
  if (!stored?.stages?.some(item => item.id === stage.id)) throw new Error("Salve o planejamento antes de criar tarefas.")
  const [owner] = stage.assigneeId ? await db.select({ id: users.id }).from(users).where(sql`${users.id}=${stage.assigneeId} and ${users.active}=true`).limit(1) : []
  const task: Task = { id: randomUUID(), title: z.string().trim().min(1, "Informe o título da tarefa").max(300).parse(title), description: "", status: "todo", priority: "media", assigneeId: owner?.id || user.id, clientId, dealId: project.dealId, projectId, projectStageId: stage.id, projectName: project.name, dueDate: `${stage.dueDate || new Date().toISOString().slice(0, 10)}T18:00:00-03:00`, checklist: [], comments: [], attachments: [], order: 0, createdAt: new Date().toISOString() }
  await db.insert(crmRecords).values({ resource: "tasks", id: task.id, data: { ...task }, created: true, updatedBy: user.id })
  return task
}
export async function linkProjectTaskAction(clientId: string, projectId: string, taskId: string, stageId: string | null) {
  const user = await authorize(true)
  const { project } = await projectContext(clientId, projectId)
  const task = await record<Task>("tasks", z.string().min(1).max(120).parse(taskId))
  if (!task || task.clientId !== clientId || (task.projectId && task.projectId !== projectId)) throw new Error("A tarefa não pertence a este projeto ou cliente.")
  const stage = stageId ? project.stages.find(stage => stage.id === stageId) : null
  if (stageId && (!stage || (stage.status === "concluida" && task.status !== "done"))) throw new Error("Escolha uma etapa aberta para esta tarefa.")
  const patch = stage ? { projectId, projectStageId: stage.id, projectName: project.name, dealId: project.dealId || null } : { projectId: null, projectStageId: null }
  const [saved] = await db.update(crmRecords).set({ data: sql`${crmRecords.data} || ${JSON.stringify(patch)}::jsonb`, updatedBy: user.id, updatedAt: new Date() }).where(sql`${crmRecords.resource}='tasks' and ${crmRecords.id}=${task.id} and ${crmRecords.deleted}=false and (${crmRecords.data}->>'projectId' is null or ${crmRecords.data}->>'projectId'=${projectId})`).returning({ data: crmRecords.data })
  if (!saved) throw new Error("A tarefa foi alterada. Recarregue os dados.")
  return Object.fromEntries(Object.entries(saved.data).filter(([, value]) => value !== null)) as unknown as Task
}
