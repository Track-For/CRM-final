import { z } from "zod"
import { identifier, sources } from "@/lib/commercial/model"

export const API_SCOPES = ["leads:read", "leads:write", "deals:read", "deals:write", "tasks:read", "tasks:write", "clients:read", "clients:write", "projects:read", "quotes:read", "charges:read", "subscriptions:read", "pipelines:read", "reports:read"] as const
export const API_RESOURCES = ["leads", "deals", "tasks", "clients", "projects", "quotes", "charges", "subscriptions", "pipelines"] as const
const text = (max: number) => z.string().trim().max(max)
const leadFields = {
  name: text(200).min(1), email: z.email().or(z.literal("")), whatsapp: text(30), company: text(200),
  source: z.enum(sources), ownerId: text(120), projectType: z.enum(["app", "sistema", "site", "anuncio", "outros"]),
  temperature: z.enum(["frio", "morno", "quente"]), status: z.enum(["novo", "em_contato", "qualificado", "perdido"]),
}
export const leadCreate = z.object({ ...leadFields, email: leadFields.email.default(""), whatsapp: leadFields.whatsapp.default(""), company: leadFields.company.default(""), source: leadFields.source.default("manual"), ownerId: leadFields.ownerId.default(""), projectType: leadFields.projectType.default("outros"), temperature: leadFields.temperature.default("morno"), status: leadFields.status.default("novo") }).strict()
export const leadUpdate = z.object(leadFields).partial().strict()
const taskFields = { title: text(300).min(1), description: text(4000), dueDate: z.iso.datetime({ offset: true }), clientId: text(120), leadId: text(120), dealId: text(120), assigneeId: text(120), status: z.enum(["todo", "doing", "done"]), priority: z.enum(["baixa", "media", "alta", "urgente"]) }
export const taskCreate = z.object({ ...taskFields, description: taskFields.description.default(""), dueDate: taskFields.dueDate.optional(), clientId: taskFields.clientId.optional(), leadId: taskFields.leadId.optional(), dealId: taskFields.dealId.optional(), assigneeId: taskFields.assigneeId.default(""), status: taskFields.status.default("todo"), priority: taskFields.priority.default("media") }).strict()
export const taskUpdate = z.object(taskFields).partial().strict()
export const dealUpdate = z.object({ title: text(300).min(1).optional(), ownerId: text(120).optional(), startDate: z.iso.datetime({ offset: true }).or(z.literal("")).optional(), expectedCloseDate: z.iso.datetime({ offset: true }).optional(), nextAction: text(1000).optional(), nextActionDate: z.iso.datetime({ offset: true }).optional() }).strict()
export const clientCreate = z.object({ name: text(200).min(1), legalName: text(200).default(""), email: z.email().or(z.literal("")).default(""), whatsapp: text(30).default(""), contactName: text(200).default(""), documentType: z.enum(["cpf", "cnpj"]).default("cnpj"), document: text(30).default(""), ownerId: text(120).default("") }).strict()
export const dealCreate = z.object({ title: text(300).min(1), leadId: identifier, pipelineId: identifier, ownerId: text(120).default(""), value: z.number().min(0).max(1e12), monthlyFee: z.number().min(0).max(1e12).default(0), startDate: z.iso.datetime({ offset: true }).optional(), expectedCloseDate: z.iso.datetime({ offset: true }).or(z.literal("")).default("") }).strict()
export const createSchemas = { leads: leadCreate, tasks: taskCreate, clients: clientCreate, deals: dealCreate }
export const patchSchemas = { leads: leadUpdate, tasks: taskUpdate, deals: dealUpdate }
export function pagination(params: URLSearchParams) {
  return z.object({ limit: z.coerce.number().int().min(1).max(100).default(50), offset: z.coerce.number().int().min(0).max(1000000).default(0) }).parse({ limit: params.get("limit") ?? undefined, offset: params.get("offset") ?? undefined })
}
// Lista explícita impede que futuras credenciais/campos internos entrem na API.
const fields: Record<string, string[]> = {
  leads: ["name", "email", "whatsapp", "company", "projectType", "revenue", "source", "temperature", "status", "ownerId", "utm", "clientId", "createdAt", "updatedAt"],
  deals: ["title", "leadId", "clientId", "pipelineId", "stage", "projectType", "source", "value", "monthlyFee", "probability", "startDate", "expectedCloseDate", "ownerId", "wonAt", "lostAt", "stageChangedAt", "createdAt", "nextAction", "nextActionDate"],
  tasks: ["title", "description", "status", "priority", "assigneeId", "clientId", "dealId", "leadId", "projectId", "projectStageId", "dueDate", "createdAt"],
  clients: ["name", "legalName", "documentType", "document", "email", "whatsapp", "contactName", "address", "leadId", "ownerId", "status", "createdAt"],
  projects: ["name", "dealId", "clientId", "projectType", "status", "value", "startDate", "deliveryDate"],
  quotes: ["number", "leadId", "dealId", "clientId", "status", "total", "createdAt", "validUntil"],
  charges: ["number", "clientId", "dealId", "subscriptionId", "description", "amount", "dueDate", "status", "method", "paidAt", "createdAt"],
  subscriptions: ["clientId", "dealId", "description", "amount", "status", "startDate", "nextBillingDate", "createdAt"],
  pipelines: ["name", "description", "stages"],
}
export function projectApiRecord(resource: string, id: string, data: Record<string, unknown>) {
  return { id, ...Object.fromEntries((fields[resource] || []).filter(k => data[k] !== undefined).map(k => [k, data[k]])) }
}
