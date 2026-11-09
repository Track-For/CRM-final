import { z } from "zod"
import type { Deal, Project, ProjectStage, ProjectStatus, Quote } from "../../types/index"
import { schedulePhases } from "./schedule"

export const STAGE_LABEL = { pendente: "Pendente", em_andamento: "Em andamento", em_revisao: "Em revisão", bloqueada: "Bloqueada", concluida: "Concluída" } as const
const date = z.string().refine(value => value === "" || (/^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(`${value}T12:00:00Z`)) && new Date(`${value}T12:00:00Z`).toISOString().slice(0, 10) === value), "Data inválida")
export const projectPlanSchema = z.object({
  clientId: z.string().min(1).max(120),
  projectId: z.string().min(1).max(120),
  expectedVersion: z.number().int().nonnegative(),
  startDate: date,
  deliveryDate: date,
  paused: z.boolean(),
  stages: z.array(z.object({
    id: z.string().min(1).max(200), name: z.string().trim().min(1, "Informe o nome de cada etapa").max(150),
    description: z.string().trim().max(4000), status: z.enum(["pendente", "em_andamento", "em_revisao", "bloqueada", "concluida"]),
    assigneeId: z.string().max(120), startDate: date, dueDate: date,
    paymentMilestoneId: z.string().max(120).optional(),
  })).min(1, "O projeto precisa de ao menos uma etapa").max(50),
}).superRefine((value, ctx) => {
  if (value.startDate && value.deliveryDate && value.deliveryDate < value.startDate) ctx.addIssue({ code: "custom", message: "A entrega do projeto deve ser posterior ao início", path: ["deliveryDate"] })
  const ids = new Set<string>()
  value.stages.forEach((stage, index) => {
    if (ids.has(stage.id)) ctx.addIssue({ code: "custom", message: "Etapas com identificadores duplicados", path: ["stages", index, "id"] })
    ids.add(stage.id)
    if (stage.startDate && stage.dueDate && stage.dueDate < stage.startDate) ctx.addIssue({ code: "custom", message: `O prazo de ${stage.name} deve ser posterior ao início`, path: ["stages", index, "dueDate"] })
    if (stage.startDate && value.startDate && stage.startDate < value.startDate) ctx.addIssue({ code: "custom", message: `${stage.name} começa antes do projeto`, path: ["stages", index, "startDate"] })
    if (stage.dueDate && value.deliveryDate && stage.dueDate > value.deliveryDate) ctx.addIssue({ code: "custom", message: `${stage.name} termina depois da entrega do projeto`, path: ["stages", index, "dueDate"] })
  })
})
export type ProjectPlanInput = z.infer<typeof projectPlanSchema>
export function projectProgress(stages: ProjectStage[] = []) {
  const done = stages.filter(stage => stage.status === "concluida").length
  return { done, total: stages.length, percent: stages.length ? Math.round(done * 100 / stages.length) : 0 }
}
export function projectStatus(stages: ProjectStage[], paused: boolean): ProjectStatus {
  if (paused) return "pausado"
  if (stages.length && stages.every(stage => stage.status === "concluida")) return "entregue"
  return stages.some(stage => stage.status !== "pendente") ? "em_andamento" : "planejamento"
}
function addDays(date: string, days: number) {
  const value = new Date(`${date}T12:00:00Z`); value.setUTCDate(value.getUTCDate() + days)
  return value.toISOString().slice(0, 10)
}
export function defaultProjectStages(project: Project, days?: number, assigneeId = ""): ProjectStage[] {
  const start = project.startDate?.slice(0, 10) || ""
  const phases = days && days > 0 ? schedulePhases(days) : ["Briefing e planejamento", "Design e aprovação", "Desenvolvimento", "Testes e publicação"].map(label => ({ label, days: 0 }))
  let offset = 0
  return phases.map((phase, index) => {
    const stageStart = start && days ? addDays(start, offset) : ""
    offset += phase.days
    return { id: `${project.id}_stage_${index + 1}`, name: project.projectType === "outros" && phases.length === 4 ? ["Planejamento", "Execução do serviço", "Revisão", "Entrega"][index] : phase.label, description: "", status: project.status === "entregue" ? "concluida" : index === 0 && project.status === "em_andamento" ? "em_andamento" : "pendente", assigneeId, startDate: stageStart, dueDate: start && days ? addDays(start, offset) : "" }
  })
}
/** Materializa somente o projeto de uma venda ganha; não altera um plano já criado. */
export function projectForDeal(deal: Deal, clientId: string, quotes: Quote[]): Project {
  const quote = quotes.filter(quote => quote.dealId === deal.id && quote.status !== "recusado" && quote.status !== "expirado").sort((a, b) => Number(b.status === "aceito") - Number(a.status === "aceito") || b.createdAt.localeCompare(a.createdAt))[0]
  const days = quote?.deadlineDays && Number.isFinite(quote.deadlineDays) ? Math.min(730, Math.max(1, Math.round(quote.deadlineDays))) : undefined
  const startDate = (deal.startDate || deal.wonAt || deal.stageChangedAt || "").slice(0, 10)
  const project: Project = { id: `deal_project_${deal.id}`, clientId, dealId: deal.id, name: deal.title || "Projeto", projectType: deal.projectType || "outros", status: "planejamento", value: deal.value, startDate, deliveryDate: startDate && days ? addDays(startDate, days) : "", executionVersion: 0 }
  project.stages = defaultProjectStages(project, days, deal.ownerId || "")
  return project
}
