"use server"

import { evolutionConfig } from "@/lib/whatsapp/client"

import { dispatchCrmEvent } from "@/lib/integrations/webhooks"
import { randomUUID } from "node:crypto"
import { and, desc, eq, inArray, sql } from "drizzle-orm"
import { z } from "zod"
import { requireUser } from "@/lib/auth/session"
import { crmRecords, db, whatsappMessages } from "@/lib/db"
import { pipelines as defaults } from "@/lib/mock/static"
import { matchWhatsappContact } from "@/lib/whatsapp/contact-match"
import { normalizePhone, phoneIdentity } from "@/lib/whatsapp/normalize"
import type { Activity, Client, Deal, Lead, Pipeline, Task } from "@/types"
import { aiConfigured, requestConversationAnalysis } from "./provider"
import { validateEvidence, type ConversationAnalysis, type SourceMessage } from "./whatsapp-schema"

type Draft = { id: string; owner: string; phone: string; createdAt: string; result: ConversationAnalysis; messages: SourceMessage[]; lead?: Lead; client?: Client; deal?: Deal; applied: string[] }
async function authorize() {
  const user = await requireUser()
  if (!["admin", "comercial"].includes(user.role)) throw new Error("Sem permissão para analisar conversas comerciais.")
  return user
}
async function context(input: string) {
  if (!/^\+?[\d\s().-]{7,25}$/.test(input)) throw new Error("Identifique o telefone deste contato antes de analisar.")
  const phone = normalizePhone(input)
  const records = await db.select().from(crmRecords).where(and(eq(crmRecords.deleted, false), inArray(crmRecords.resource, ["leads", "clients", "deals", "tasks", "pipelines"])))
  const collection = <T,>(resource: string) => records.filter(row => row.resource === resource).map(row => row.data as T)
  const match = matchWhatsappContact(phone, collection<Lead>("leads"), collection<Client>("clients"))
  if (match.ambiguous) throw new Error("Há cadastros com o mesmo telefone. Resolva a duplicidade antes de analisar.")
  if (!match.lead && !match.client) throw new Error("Cadastre ou vincule este contato a um lead ou cliente antes de analisar.")
  const deals = collection<Deal>("deals").filter(deal => (Boolean(match.lead && deal.leadId === match.lead.id) || Boolean(match.client && deal.clientId === match.client.id)) && !deal.wonAt && !deal.lostAt && !["ganho", "perdido"].includes(deal.stage))
  const deal = deals.length === 1 ? deals[0] : undefined
  const pipeline = deal ? [...collection<Pipeline>("pipelines"), ...defaults].find(p => p.id === deal.pipelineId) : undefined
  const allowedStages = pipeline?.stages.filter(stage => stage.kind === "open" && !["ganho", "perdido"].includes(stage.key)) ?? []
  const tasks = collection<Task>("tasks").filter(task => task.status !== "done" && (Boolean(match.lead && task.leadId === match.lead.id) || Boolean(match.client && task.clientId === match.client.id)))
  return { phone, ...match, deal, allowedStages, tasks }
}

export async function getWhatsappAiAvailability() { await authorize(); return { configured: await aiConfigured() } }

export async function analyzeWhatsappConversation(input: string) {
  const user = await authorize()
  if (!await aiConfigured()) throw new Error("IA pendente: peça ao administrador para configurar a chave e o modelo em Integrações → WhatsApp e IA.")
  const c = await context(input)
  // Reserva atômica por usuário/contato: chamadas simultâneas não multiplicam o consumo.
  const rateId = `${user.id}:${phoneIdentity(c.phone)}`
  const reserved = await db.execute(sql`INSERT INTO crm_records (resource,id,data,created,deleted,updated_by,updated_at)
    VALUES ('whatsappAiRate',${rateId},'{}'::jsonb,true,false,${user.id},now())
    ON CONFLICT (resource,id) DO UPDATE SET updated_at=now()
    WHERE crm_records.updated_at < now() - interval '1 minute' RETURNING id`)
  if (!(reserved as unknown[]).length) throw new Error("Aguarde um minuto antes de analisar esta conversa novamente.")
  const identity = phoneIdentity(c.phone)
  const aliases = /^55\d{10}$/.test(identity) ? [identity, identity.slice(0, 4) + "9" + identity.slice(4)] : [c.phone]
  const rows = await db.select().from(whatsappMessages).where(and(eq(whatsappMessages.instance, (await evolutionConfig()).instance), inArray(whatsappMessages.phone, aliases))).orderBy(desc(whatsappMessages.sentAt)).limit(100)
  const media = rows.length ? await db.select().from(crmRecords).where(and(eq(crmRecords.resource, "whatsappMediaAnalyses"), inArray(crmRecords.id, rows.map(row => row.id)))) : []
  const readings = new Map(media.filter(row => row.data.state === "completed").map(row => [row.id, String(row.data.text || "")]))
  let budget = 16000
  const messages: SourceMessage[] = []
  for (const row of rows) {
    if (messages.length >= 50 || budget <= 0) break
    const reading = readings.get(row.id)
    const source = row.messageType === "text" ? row.text : reading ? `${row.text}\n[Conteúdo extraído por IA; confira o original]\n${reading}` : ""
    if (!source.trim()) continue
    const text = source.slice(0, Math.min(4000, budget)); budget -= text.length
    messages.push({ id: row.id, text, direction: row.direction as "in" | "out", sentAt: row.sentAt.toISOString() })
  }
  messages.reverse()
  if (!messages.length) throw new Error("Não há conteúdo disponível para analisar. Transcreva os áudios ou leia os anexos na conversa antes de analisar.")
  const result = validateEvidence(await requestConversationAnalysis({ today: new Date().toISOString().slice(0, 10), messages, lead: c.lead && { name: c.lead.name, status: c.lead.status, temperature: c.lead.temperature, projectType: c.lead.projectType }, deal: c.deal && { title: c.deal.title, stage: c.deal.stage }, allowedStages: c.allowedStages.map(s => ({ key: s.key, name: s.name })), pendingTasks: c.tasks.map(task => ({ title: task.title, dueDate: task.dueDate })) }), messages, c.allowedStages.map(s => s.key))
  if (!c.lead || ["convertido", "perdido"].includes(c.lead.status)) result.qualification = { status: null, temperature: null, projectType: null, reason: "Qualificação indisponível para este contato.", evidence: [] }
  const draft: Draft = { id: randomUUID(), owner: user.id, phone: c.phone, createdAt: new Date().toISOString(), result, messages, lead: c.lead, client: c.client, deal: c.deal, applied: [] }
  await db.insert(crmRecords).values({ resource: "whatsappAiAnalyses", id: draft.id, data: draft, created: true, updatedBy: user.id })
  return draft
}

export async function applyWhatsappSuggestion(id: string, action: string) {
  const user = await authorize()
  z.string().uuid().parse(id)
  if (!/^(summary|qualification|stage|task:[0-2])$/.test(action)) throw new Error("Sugestão inválida.")
  const [row] = await db.select().from(crmRecords).where(and(eq(crmRecords.resource, "whatsappAiAnalyses"), eq(crmRecords.id, id), eq(crmRecords.deleted, false)))
  const draft = row?.data as Draft | undefined
  if (!draft || draft.owner !== user.id) throw new Error("Análise não encontrada.")
  if (draft.applied.includes(action)) return { applied: true }
  if (Date.now() - Date.parse(draft.createdAt) > 86400000) throw new Error("Análise expirada. Analise a conversa novamente.")
  const c = await context(draft.phone)
  if (c.lead?.id !== draft.lead?.id || c.client?.id !== draft.client?.id || c.deal?.id !== draft.deal?.id) throw new Error("O vínculo do contato mudou. Analise novamente.")
  validateEvidence(draft.result, draft.messages, c.allowedStages.map(s => s.key))
  const now = new Date().toISOString()
  const links = { leadId: c.lead?.id, clientId: c.client?.id, dealId: c.deal?.id }
  let resource: string, value: Lead | Deal | Task | Activity, previous: Lead | Deal | undefined
  if (action === "qualification") {
    if (!c.lead || ["convertido", "perdido"].includes(c.lead.status)) throw new Error("Este lead não pode ser requalificado.")
    if (["status", "temperature", "projectType"].some(key => c.lead![key as keyof Lead] !== draft.lead![key as keyof Lead])) throw new Error("A qualificação mudou. Analise novamente.")
    const q = draft.result.qualification
    if (!q.status && !q.temperature && !q.projectType) throw new Error("Não há qualificação sugerida.")
    resource = "leads"; previous = c.lead
    value = { ...c.lead, ...(q.status && { status: q.status }), ...(q.temperature && { temperature: q.temperature }), ...(q.projectType && { projectType: q.projectType }), updatedAt: now }
  } else if (action === "stage") {
    const stage = c.allowedStages.find(s => s.key === draft.result.stage.key)
    if (!c.deal || !stage || c.deal.stage !== draft.deal?.stage) throw new Error("O negócio mudou ou não possui uma etapa sugerida. Analise novamente.")
    resource = "deals"; previous = c.deal
    value = { ...c.deal, stage: stage.key, probability: stage.probability, stageChangedAt: now, history: [...(c.deal.history || []), { id: randomUUID(), type: "stage", description: `Sugestão da IA revisada: ${draft.result.stage.reason}`, authorId: user.id, createdAt: now, fromStage: c.deal.stage, toStage: stage.key }] }
  } else if (action.startsWith("task:")) {
    const task = draft.result.tasks[Number(action.split(":")[1])]
    if (!task) throw new Error("Tarefa inválida.")
    if (c.tasks.some(t => t.title.trim().toLocaleLowerCase() === task.title.trim().toLocaleLowerCase())) throw new Error("Já existe uma tarefa pendente com este título.")
    resource = "tasks"
    value = { id: `task_ai_${id}_${action.slice(-1)}`, ...links, title: task.title, description: task.description, dueDate: task.dueDate || "", status: "todo", priority: "media", assigneeId: user.id, checklist: [], comments: [], attachments: [], order: 0, createdAt: now }
  } else {
    resource = "activities"
    value = { id: `activity_ai_${id}`, ...links, type: "nota", title: "Resumo do WhatsApp · IA revisada", description: draft.result.summary, authorId: user.id, createdAt: now }
  }
  // Uma única instrução PostgreSQL torna gravação e marcação idempotentes também no Neon HTTP.
  const changed = await db.execute(sql`WITH locked AS (
    SELECT * FROM crm_records WHERE resource='whatsappAiAnalyses' AND id=${id} AND data=${JSON.stringify(draft)}::jsonb
      ${c.lead ? sql`AND EXISTS (SELECT 1 FROM crm_records contact WHERE contact.resource='leads' AND contact.id=${c.lead.id} AND contact.deleted=false AND contact.data=${JSON.stringify(c.lead)}::jsonb)` : sql``}
      ${c.client ? sql`AND EXISTS (SELECT 1 FROM crm_records contact WHERE contact.resource='clients' AND contact.id=${c.client.id} AND contact.deleted=false AND contact.data=${JSON.stringify(c.client)}::jsonb)` : sql``}
      FOR UPDATE
  ), saved AS (
    INSERT INTO crm_records (resource,id,data,created,deleted,updated_by,updated_at)
    SELECT ${resource},${value.id},${JSON.stringify(value)}::jsonb,true,false,${user.id},now() FROM locked
    ON CONFLICT (resource,id) DO UPDATE SET data=excluded.data,updated_by=excluded.updated_by,updated_at=now()
    WHERE ${previous ? sql`crm_records.data=${JSON.stringify(previous)}::jsonb AND crm_records.deleted=false` : sql`false`}
    RETURNING id
  ) UPDATE crm_records SET data=${JSON.stringify({ ...draft, applied: [...draft.applied, action] })}::jsonb,updated_at=now()
    WHERE resource='whatsappAiAnalyses' AND id=${id} AND EXISTS (SELECT 1 FROM saved) RETURNING id`)
  if (!(changed as unknown[]).length) throw new Error("O registro mudou durante a revisão. Atualize a análise antes de aplicar.")
  if (resource === "leads" || resource === "deals") await dispatchCrmEvent(resource === "leads" ? "lead.updated" : "deal.stage_changed", value).catch(() => {})
  return { applied: true, record: { resource, value } }
}
