import { z } from "zod"

export const stages = ["novo_lead", "contato_feito", "call_agendada", "proposta_enviada", "negociacao", "ganho", "perdido"] as const
export const sources = ["meta_ads", "google_ads", "instagram", "indicacao", "site", "whatsapp", "manual"] as const
export const identifier = z.string().trim().min(1).max(120)
export const monthSchema = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/)
export const goalSchema = z.object({
  name: z.string().trim().min(1).max(120), month: monthSchema,
  ownerId: z.string().max(120).default(""), pipelineId: z.string().max(120).default(""),
  metric: z.enum(["receivedValue", "wonValue", "wonCount", "newLeads"]), target: z.number().positive().max(1e12),
}).strict().refine(value => ["receivedValue", "wonValue"].includes(value.metric) || Number.isInteger(value.target), "Metas de quantidade devem ser inteiras.")
  .refine(value => value.metric !== "newLeads" || !value.pipelineId, "Metas de leads não são filtradas por funil.")
export const reportSchema = z.object({
  name: z.string().trim().min(1).max(120), resource: z.enum(["deals", "leads", "tasks"]),
  groupBy: z.enum(["ownerId", "source", "stage", "status", "month"]),
  dateField: z.enum(["createdAt", "expectedCloseDate", "wonAt", "dueDate", "paidAt"]),
  metric: z.enum(["count", "value", "weightedValue", "monthlyFee", "receivedValue"]),
  from: z.iso.date(), to: z.iso.date(), ownerId: z.string().max(120).default(""),
  pipelineId: z.string().max(120).default(""), status: z.string().max(40).default(""),
}).strict().superRefine((v, ctx) => {
  if (v.from > v.to) ctx.addIssue({ code: "custom", message: "A data inicial deve ser anterior à final." })
  if ((v.metric === "receivedValue") !== (v.dateField === "paidAt")) ctx.addIssue({ code: "custom", message: "Receita recebida deve usar a data do pagamento." })
  if (v.resource === "deals" && v.dateField === "dueDate") ctx.addIssue({ code: "custom", message: "Negócios não possuem data de vencimento." })
  if (v.resource !== "deals" && (v.metric !== "count" || v.pipelineId || !["createdAt", ...(v.resource === "tasks" ? ["dueDate"] : [])].includes(v.dateField))) ctx.addIssue({ code: "custom", message: "Campos incompatíveis com o recurso escolhido." })
  const groups = v.resource === "deals" ? ["ownerId", "source", "stage", "month"] : v.resource === "leads" ? ["ownerId", "source", "status", "month"] : ["ownerId", "status", "month"]
  if (!groups.includes(v.groupBy)) ctx.addIssue({ code: "custom", message: "Agrupamento incompatível." })
})
export const automationEvents = ["lead.created", "deal.created", "deal.stage_changed", "deal.won", "deal.lost"] as const
export const automationSchema = z.object({
  name: z.string().trim().min(1).max(120), active: z.boolean(), event: z.enum(automationEvents),
  stage: z.enum(stages).or(z.literal("")).default(""), source: z.enum(sources).or(z.literal("")).default(""),
  minValue: z.number().min(0).max(1e12).default(0),
  action: z.enum(["create_task", "assign_owner"]), title: z.string().trim().max(300).default(""),
  userId: z.string().max(120).default(""), dueDays: z.number().int().min(0).max(365).default(1),
}).strict().superRefine((v, ctx) => {
  if (v.action === "create_task" && !v.title) ctx.addIssue({ code: "custom", message: "Informe o título da tarefa." })
  if (v.action === "assign_owner" && !v.userId) ctx.addIssue({ code: "custom", message: "Escolha o responsável." })
  if (v.event === "lead.created" && (v.stage || v.minValue)) ctx.addIssue({ code: "custom", message: "Etapa e valor se aplicam apenas a negócios." })
})
export type Goal = z.infer<typeof goalSchema> & { id: string }
export type SavedReport = z.infer<typeof reportSchema> & { id: string }
export type Automation = z.infer<typeof automationSchema> & { id: string }
export type CommercialResource = "salesGoals" | "savedReports" | "automationRules"
export type StoredRow = { resource: string; id: string; data: Record<string, unknown> }

export function automationMatches(rule: z.infer<typeof automationSchema>, event: string, data: Record<string, unknown>) {
  return rule.active && rule.event === event && (!rule.stage || rule.stage === data.stage) && (!rule.source || rule.source === data.source) && (!rule.minValue || Number(data.value) >= rule.minValue)
}
