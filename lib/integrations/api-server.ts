import { createHash, randomUUID } from "node:crypto"
import { sql } from "drizzle-orm"
import { z } from "zod"
import { db, crmRecords, users } from "@/lib/db"
import { pipelines as defaults } from "@/lib/mock/static"
import { API_SCOPES, createSchemas, patchSchemas } from "./api-contract"
import { dispatchCrmEvent } from "./webhooks"
import { queueAutomationEvent } from "@/lib/commercial/automations"

export class ApiError extends Error { constructor(public status: number, message: string) { super(message) } }
const hash = (s: string) => createHash("sha256").update(s).digest("hex")
export async function authorizeApi(request: Request, scope: string) {
  const token = request.headers.get("authorization")?.replace(/^Bearer /i, "") || ""
  if (!/^sk_live_[A-Za-z0-9_-]{43}$/.test(token)) throw new ApiError(401, "Informe uma chave Bearer válida.")
  const [key] = await db.select().from(crmRecords).where(sql`${crmRecords.resource}='apiKeys' and ${crmRecords.deleted}=false and ${crmRecords.data}->>'tokenHash'=${hash(token)}`).limit(1)
  if (!key) throw new ApiError(401, "Chave inválida ou revogada.")
  if (!(API_SCOPES as readonly string[]).includes(scope) || !Array.isArray(key.data.scopes) || !key.data.scopes.includes(scope)) throw new ApiError(403, "Chave sem permissão para esta operação.")
  const bucket = `${key.id}:${Math.floor(Date.now() / 60000)}`
  const rate = await db.execute(sql`insert into crm_records(resource,id,data,created) values('apiRate',${bucket},'{"count":1}',true) on conflict(resource,id) do update set data=jsonb_build_object('count',(crm_records.data->>'count')::int+1) where (crm_records.data->>'count')::int<120 returning id`)
  if (!(rate as unknown[]).length) throw new ApiError(429, "Limite de 120 chamadas por minuto atingido.")
  await db.update(crmRecords).set({ data: sql`${crmRecords.data} || ${JSON.stringify({ lastUsedAt: new Date().toISOString() })}::jsonb` }).where(sql`${crmRecords.resource}='apiKeys' and ${crmRecords.id}=${key.id}`)
  return key.id
}
export function apiFailure(error: unknown) {
  const status = error instanceof ApiError ? error.status : error instanceof z.ZodError || error instanceof SyntaxError ? 400 : 500
  const message = error instanceof ApiError ? error.message : status === 400 ? "Dados ou parâmetros inválidos." : "Não foi possível concluir a operação."
  return Response.json({ error: message }, { status, headers: { "Cache-Control": "no-store", ...(status === 429 ? { "Retry-After": "60" } : {}) } })
}
export async function readApiBody(request: Request) {
  const reader = request.body?.getReader()
  if (!reader) throw new ApiError(400, "Informe um corpo JSON.")
  const chunks: Uint8Array[] = []; let length = 0
  try { while (true) { const part = await reader.read(); if (part.done) break; length += part.value.length; if (length > 20000) throw new ApiError(413, "Corpo excede 20 KB."); chunks.push(part.value) } }
  finally { await reader.cancel().catch(() => {}) }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"))
}
export async function apiPipelines() {
  const rows = await db.select().from(crmRecords).where(sql`${crmRecords.resource}='pipelines'`)
  return defaults.filter(p => !rows.some(r => r.id === p.id)).concat(rows.filter(r => !r.deleted).map(r => ({ ...r.data, id: r.id }) as unknown as typeof defaults[number]))
}
async function references(data: Record<string, unknown>) {
  for (const field of ["ownerId", "assigneeId"]) if (data[field]) {
    const [person] = await db.select({ id: users.id }).from(users).where(sql`${users.id}=${String(data[field])} and ${users.active}=true`).limit(1)
    if (!person) throw new ApiError(400, "Responsável não encontrado.")
  }
  for (const [field, resource] of [["clientId", "clients"], ["leadId", "leads"], ["dealId", "deals"]]) if (data[field]) {
    const [row] = await db.select({ id: crmRecords.id }).from(crmRecords).where(sql`${crmRecords.resource}=${resource} and ${crmRecords.id}=${String(data[field])} and ${crmRecords.deleted}=false`).limit(1)
    if (!row) throw new ApiError(400, `Referência inválida: ${field}.`)
  }
}
export async function createApiRecord(resource: string, input: unknown, keyId: string, idempotency: string | null) {
  const schema = createSchemas[resource as keyof typeof createSchemas]
  if (!schema) throw new ApiError(405, "Criação indisponível para este recurso.")
  const parsed = schema.parse(input)
  await references(parsed)
  const now = new Date().toISOString()
  let data: Record<string, unknown> = { ...parsed, createdAt: now, updatedAt: now }
  if (resource === "leads") data = { ...data, utm: {}, revenue: "sem_faturamento" }
  if (resource === "tasks") data = { dueDate: now, ...data, checklist: [], comments: [], attachments: [], order: 0 }
  if (resource === "clients") data = { ...data, status: "ativo", address: { zip: "", street: "", number: "", district: "", city: "", state: "" } }
  if (resource === "deals") {
    const pipeline = (await apiPipelines()).find(p => p.id === data.pipelineId)
    if (!pipeline) throw new ApiError(400, "Funil inválido.")
    const [lead] = await db.select().from(crmRecords).where(sql`${crmRecords.resource}='leads' and ${crmRecords.id}=${String(data.leadId)} and ${crmRecords.deleted}=false`).limit(1)
    data = { ...data, stage: "novo_lead", stageChangedAt: now, probability: pipeline.stages.find(s => s.key === "novo_lead")?.probability || 0, source: lead.data.source || "manual", projectType: lead.data.projectType || "outros", history: [] }
  }
  if (idempotency) z.string().min(1).max(120).regex(/^[\w.:-]+$/).parse(idempotency)
  const receipt = idempotency ? hash(`${keyId}:${idempotency}`) : null
  const fingerprint = hash(JSON.stringify([resource, parsed]))
  const result = await db.transaction(async tx => {
    if (receipt) {
      const [claimed] = await tx.insert(crmRecords).values({ resource: "apiIdempotency", id: receipt, data: { fingerprint }, created: true }).onConflictDoNothing().returning({ id: crmRecords.id })
      if (!claimed) {
        const [previous] = await tx.select().from(crmRecords).where(sql`${crmRecords.resource}='apiIdempotency' and ${crmRecords.id}=${receipt}`)
        if (previous.data.fingerprint !== fingerprint) throw new ApiError(409, "Idempotency-Key já utilizada com outro conteúdo.")
        return { data: previous.data.response as Record<string, unknown>, replayed: true }
      }
    }
    const id = randomUUID(); const record = { ...data, id }
    await tx.insert(crmRecords).values({ resource, id, data: record, created: true })
    if (receipt) await tx.update(crmRecords).set({ data: { fingerprint, response: record } }).where(sql`${crmRecords.resource}='apiIdempotency' and ${crmRecords.id}=${receipt}`)
    return { data: record, replayed: false }
  })
  // A fila é idempotente: uma repetição também recupera o evento após interrupção.
  if (resource === "leads" || resource === "deals") {
    const event = resource === "leads" ? "lead.created" : "deal.created"
    await queueAutomationEvent(event, result.data)
    if (!result.replayed) await dispatchCrmEvent(event, result.data).catch(() => {})
  }
  return result
}
export async function patchApiRecord(resource: string, id: string, input: unknown) {
  const schema = patchSchemas[resource as keyof typeof patchSchemas]
  if (!schema) throw new ApiError(405, "Edição indisponível para este recurso.")
  const patch = schema.parse(input)
  if (!Object.keys(patch).length) throw new ApiError(400, "Informe ao menos um campo.")
  await references(patch)
  const result = await db.transaction(async tx => {
    const [row] = await tx.select().from(crmRecords).where(sql`${crmRecords.resource}=${resource} and ${crmRecords.id}=${id} and ${crmRecords.deleted}=false`).for("update")
    if (!row) throw new ApiError(404, "Registro não encontrado.")
    if (resource === "tasks" && (row.data.projectId || row.data.projectStageId)) throw new ApiError(409, "Edite tarefas de projeto pelo acompanhamento do projeto.")
    if (resource === "leads" && row.data.status === "convertido") throw new ApiError(409, "Edite leads convertidos pelo CRM.")
    const data = { ...row.data, ...patch, id, updatedAt: new Date().toISOString() }
    await tx.update(crmRecords).set({ data, updatedAt: new Date() }).where(sql`${crmRecords.resource}=${resource} and ${crmRecords.id}=${id}`)
    return data
  })
  if (resource === "leads") await dispatchCrmEvent("lead.updated", result).catch(() => {})
  return result
}
