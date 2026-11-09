import { z } from "zod"
import { canUseResource } from "@/lib/data/resource-policy"
import { paymentStatus } from "@/lib/finance/payment-status"
import type { Role } from "@/types"

export const managementResources = ["leads", "deals", "quotes", "charges", "projects", "tasks"] as const
export const managementPromptSchema = z.string().trim().max(2000, "O prompt deve ter até 2.000 caracteres.")
export type ManagementResource = typeof managementResources[number]
export const managementLabels: Record<ManagementResource, string> = { leads: "Leads", deals: "Negócios", quotes: "Propostas", charges: "Cobranças", projects: "Projetos", tasks: "Tarefas" }
type Row = { resource: string; id: string; data: Record<string, unknown>; deleted?: boolean }
export type ManagementSource = { key: string; resource: ManagementResource; id: string; label: string; href: string; facts: Record<string, string | number> }
export type ManagementContext = { checkedAt: string; coverage: { resource: ManagementResource; total: number; included: number }[]; records: ManagementSource[] }
const text = (value: unknown, max = 160) => typeof value === "string" ? value.slice(0, max) : ""
const amount = (value: unknown) => typeof value === "number" && Number.isFinite(value) ? value : 0
function day(value: unknown) {
  const raw = text(value)
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw
  const parsed = new Date(raw)
  return Number.isFinite(parsed.getTime()) ? new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(parsed) : ""
}

/** Projeções explícitas: nenhum telefone, chave, mensagem ou objeto bruto vai ao provedor. */
export function buildManagementContext(rows: Row[], role: Role, now = new Date()): ManagementContext {
  const today = day(now.toISOString())
  const records: ManagementSource[] = []
  const coverage: ManagementContext["coverage"] = []
  for (const resource of managementResources.filter(r => canUseResource(role, r, "read"))) {
    const candidates: { source: ManagementSource; rank: string }[] = []
    for (const row of rows) {
      const d = row.data
      if (row.resource !== resource || row.deleted || d.deletedAt || d.conversionReverted || d.awaitingProjectPayment) continue
      const status = text(d.status)
      let label = text(d.name || d.title || d.number) || managementLabels[resource]
      let href = "/tarefas"
      let facts: ManagementSource["facts"] = {}
      let rank = ""
      const id = encodeURIComponent(row.id)
      if (resource === "leads") {
        if (["convertido", "perdido"].includes(status)) continue
        href = `/leads/${id}`
        facts = { status, temperature: text(d.temperature), projectType: text(d.projectType), updatedAt: day(d.updatedAt), createdAt: day(d.createdAt) }
        rank = day(d.updatedAt) || day(d.createdAt)
      } else if (resource === "deals") {
        if (d.wonAt || d.lostAt || ["ganho", "perdido"].includes(text(d.stage))) continue
        href = `/vendas/${id}`
        facts = { stage: text(d.stage), value: amount(d.value), expectedCloseDate: day(d.expectedCloseDate), stageChangedAt: day(d.stageChangedAt) }
        rank = day(d.stageChangedAt)
      } else if (resource === "quotes") {
        if (!["enviado", "visualizado"].includes(status)) continue
        href = `/orcamentos/${id}`
        label = text(d.number) || "Proposta"
        facts = { status, total: amount(d.total), validUntil: day(d.validUntil), sentAt: day(d.sentAt), viewedAt: day(d.viewedAt) }
        rank = day(d.validUntil)
      } else if (resource === "charges") {
        if (!["pendente", "vencido"].includes(status)) continue
        href = `/financeiro/cobrancas?cobranca=${id}`
        facts = { status: paymentStatus({ status: status as "pendente" | "vencido", dueDate: text(d.dueDate) }, now), amount: amount(d.amount), dueDate: day(d.dueDate) }
        rank = day(d.dueDate)
      } else if (resource === "projects") {
        if (status === "entregue") continue
        href = text(d.clientId) ? `/clientes/${encodeURIComponent(text(d.clientId))}?projeto=${id}` : "/clientes"
        const stages = Array.isArray(d.stages) ? d.stages as Record<string, unknown>[] : []
        facts = { status, deliveryDate: day(d.deliveryDate), blockedStages: stages.filter(s => s.status === "bloqueada").length, pendingStages: stages.filter(s => s.status !== "concluida").length }
        rank = day(d.deliveryDate)
      } else {
        if (status === "done") continue
        facts = { status, priority: text(d.priority), dueDate: day(d.dueDate) }
        rank = day(d.dueDate)
      }
      if (rank && rank < today) facts.overdueOrStaleDays = Math.max(0, Math.floor((Date.parse(today) - Date.parse(rank)) / 86400000))
      candidates.push({ source: { key: `${resource}:${row.id}`, resource, id: row.id, label, href, facts }, rank })
    }
    candidates.sort((a, b) => (a.rank || "9999").localeCompare(b.rank || "9999") || a.source.key.localeCompare(b.source.key))
    coverage.push({ resource, total: candidates.length, included: Math.min(20, candidates.length) })
    records.push(...candidates.slice(0, 20).map(c => c.source))
  }
  return { checkedAt: now.toISOString(), coverage, records }
}

export const managementAnalysisSchema = z.object({
  summary: z.string().min(1).max(2400),
  findings: z.array(z.object({
    area: z.enum(managementResources),
    priority: z.enum(["alta", "media", "baixa"]),
    title: z.string().min(1).max(160),
    observation: z.string().min(1).max(1000),
    nextStep: z.string().min(1).max(800),
    evidence: z.array(z.string().min(1).max(180)).min(1).max(5),
  }).strict()).max(12),
}).strict()
export type ManagementAnalysis = z.infer<typeof managementAnalysisSchema>
export type ManagementReport = { analysis: ManagementAnalysis; context: ManagementContext; prompt?: string }

export function validateManagementAnalysis(value: unknown, context: ManagementContext) {
  const result = managementAnalysisSchema.parse(value)
  const sources = new Map(context.records.map(r => [r.key, r]))
  for (const finding of result.findings) {
    if (finding.evidence.some(key => !sources.has(key)) || !finding.evidence.some(key => sources.get(key)?.resource === finding.area)) {
      throw Error("A IA retornou uma recomendação sem referência válida aos registros. Gere uma nova análise.")
    }
  }
  return result
}
