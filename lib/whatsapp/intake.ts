import { evolutionConfig } from "@/lib/whatsapp/client"
// Triagem persistente: a entrada da mensagem nunca espera pela IA.
import { createHash, randomUUID } from "node:crypto"
import { and, desc, eq, inArray, sql } from "drizzle-orm"
import { db, crmRecords, whatsappMessages } from "@/lib/db"
import { aiConfigured, requestIntakeClassification } from "@/lib/ai/provider"
import { matchWhatsappContact } from "./contact-match"
import { normalizePhone, phoneIdentity } from "./normalize"
import { validateIntake, type IntakeAnalysis, type IntakeData, type IntakeMessage, type IntakeCategory } from "./intake-model"
import type { Client, Lead } from "@/types"

export const intakeId = (instance: string, phone: string) => createHash("sha256").update(`${instance}:${phoneIdentity(phone)}`).digest("hex")
export function intakeAliases(phone: string) {
  const key = phoneIdentity(phone)
  return /^55\d{10}$/.test(key) ? [key, `${key.slice(0, 4)}9${key.slice(4)}`] : [normalizePhone(phone)]
}
export async function queueWhatsappIntake(instance: string, messages: { phone: string; direction: string; sentAt: Date }[]) {
  const latest = new Map<string, { phone: string; at: string }>()
  for (const message of messages) {
    if (message.direction !== "in" || !/^\d{7,15}$/.test(message.phone)) continue
    const key = intakeId(instance, message.phone), at = message.sentAt.toISOString()
    if (!latest.has(key) || latest.get(key)!.at < at) latest.set(key, { phone: message.phone, at })
  }
  if (!latest.size) return
  const values = [...latest].map(([id, item]) => ({ resource: "whatsappIntake", id, created: true, data: { instance, phone: item.phone, lastInboundAt: item.at, category: "unclassified", state: "pending" } }))
  await db.insert(crmRecords).values(values).onConflictDoUpdate({ target: [crmRecords.resource, crmRecords.id], set: {
    data: sql`${crmRecords.data} || jsonb_build_object('phone',excluded.data->>'phone','lastInboundAt',excluded.data->>'lastInboundAt','state','pending')`, updatedAt: new Date(),
  }, setWhere: sql`${crmRecords.deleted}=false and coalesce(${crmRecords.data}->>'source','')<>'manual' and coalesce(${crmRecords.data}->>'lastInboundAt','') < excluded.data->>'lastInboundAt'` })
}

export async function seedWhatsappIntake() {
  const instance = (await evolutionConfig()).instance
  const rows = await db.execute(sql`select phone, max(sent_at) as "sentAt" from whatsapp_messages where instance=${instance} and direction='in' and phone ~ '^[0-9]{7,15}$' group by phone`)
  const messages = (rows as unknown as { phone: string; sentAt: string | Date }[]).map(row => ({ phone: row.phone, direction: "in", sentAt: new Date(row.sentAt) }))
  for (let offset = 0; offset < messages.length; offset += 200) await queueWhatsappIntake(instance, messages.slice(offset, offset + 200))
}

async function matchContact(phone: string, tx: typeof db = db) {
  const rows = await tx.select({ resource: crmRecords.resource, id: crmRecords.id, data: crmRecords.data }).from(crmRecords).where(sql`${crmRecords.resource} in ('leads','clients') and ${crmRecords.deleted}=false and coalesce(${crmRecords.data}->>'deletedAt','')='' and coalesce(${crmRecords.data}->>'conversionReverted','false')<>'true'`)
  return matchWhatsappContact(phone, rows.filter(r => r.resource === "leads").map(r => ({ ...r.data, id: r.id }) as unknown as Lead), rows.filter(r => r.resource === "clients").map(r => ({ ...r.data, id: r.id }) as unknown as Client))
}
export async function readIntakeContext(instance: string, phone: string) {
  const rows = await db.select().from(whatsappMessages).where(and(eq(whatsappMessages.instance, instance), inArray(whatsappMessages.phone, intakeAliases(phone)))).orderBy(desc(whatsappMessages.sentAt)).limit(40)
  const media = rows.length ? await db.select().from(crmRecords).where(and(eq(crmRecords.resource, "whatsappMediaAnalyses"), eq(crmRecords.deleted, false), inArray(crmRecords.id, rows.map(r => r.id)))) : []
  let budget = 12000
  const messages: IntakeMessage[] = []
  for (const row of rows) {
    const reading = media.find(m => m.id === row.id && m.data.state === "completed")?.data.text
    const content = row.messageType === "text" ? row.text : typeof reading === "string" ? `[Extração por IA, sujeita a erros] ${reading}` : ""
    if (!content.trim() || budget <= 0) continue
    const text = content.slice(0, Math.min(2000, budget)); budget -= text.length
    messages.push({ id: row.id, text, direction: row.direction, sentAt: row.sentAt.toISOString() })
  }
  return { rows, messages: messages.reverse() }
}

/** Uma transação por telefone impede duplicação entre revisão, reentrega e workers. */
export async function applyIntakeClassification(id: string, analysis: IntakeAnalysis, options: { lease?: string; actor?: string; manual?: boolean } = {}) {
  return db.transaction(async tx => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`whatsapp-intake:${id}`}))`)
    const [row] = await tx.select().from(crmRecords).where(and(eq(crmRecords.resource, "whatsappIntake"), eq(crmRecords.id, id), eq(crmRecords.deleted, false))).for("update")
    if (!row) throw Error("Conversa não encontrada para classificação.")
    const current = row.data as unknown as IntakeData
    if (options.lease && (current.lease !== options.lease || current.state !== "processing")) return null
    const match = await matchContact(current.phone, tx)
    const now = new Date().toISOString()
    const result: IntakeData = { ...current, category: analysis.category, state: analysis.category === "unclassified" ? "review" : "classified", source: options.manual ? "manual" : "ai", summary: analysis.summary, nextStep: analysis.nextStep, confidence: analysis.confidence, evidence: analysis.evidence, classifiedAt: now, reason: "", lease: undefined }
    if (match.ambiguous) { result.category = "unclassified"; result.state = "review"; result.reason = "Mais de um cadastro corresponde ao telefone. Revise os vínculos." }
    else if (match.client || match.lead) {
      result.category = options.manual ? analysis.category : match.client ? "customer" : "commercial"; result.state = result.category === "unclassified" ? "review" : "classified"; result.source = options.manual ? "manual" : "matched"
      result.clientId = match.client?.id; result.leadId = match.lead?.id
      result.reason = "Conversa vinculada ao cadastro existente."
    } else if (analysis.category === "commercial" && (options.manual || analysis.buyerIntent && analysis.confidence >= 0.9 && analysis.evidence.length > 0)) {
      const leadId = `wa_${id}`
      // Respeita exclusões anteriores: uma mensagem não restaura um lead removido.
      const [previous] = await tx.select().from(crmRecords).where(and(eq(crmRecords.resource, "leads"), eq(crmRecords.id, leadId)))
      if (previous?.deleted) { result.category = "unclassified"; result.state = "review"; result.reason = "O lead desta conversa foi excluído. Revise antes de cadastrar novamente." }
      else {
        const [message] = await tx.select({ name: whatsappMessages.contactName }).from(whatsappMessages).where(and(eq(whatsappMessages.instance, current.instance), inArray(whatsappMessages.phone, intakeAliases(current.phone)), eq(whatsappMessages.direction, "in"))).orderBy(desc(whatsappMessages.sentAt)).limit(1)
        const lead: Lead = { id: leadId, name: message?.name?.trim().slice(0, 160) || `Contato WhatsApp ${current.phone}`, company: "", whatsapp: current.phone, email: "", source: "whatsapp", projectType: "outros", revenue: "sem_faturamento", temperature: "morno", status: "novo", ownerId: options.actor || "", utm: { source: "whatsapp", medium: "conversa", campaign: "triagem" }, createdAt: now, updatedAt: now }
        const inserted = await tx.insert(crmRecords).values({ resource: "leads", id: leadId, data: { ...lead, intakeSummary: analysis.summary, suggestedNextStep: analysis.nextStep }, created: true, updatedBy: options.actor }).onConflictDoNothing().returning({ id: crmRecords.id })
        if (inserted.length) {
          await tx.insert(crmRecords).values({ resource: "notes", id: `intake_${id}`, data: { id: `intake_${id}`, leadId, authorId: options.actor || "", text: `Triagem do WhatsApp\n${analysis.summary}\n\nPróximo passo sugerido: ${analysis.nextStep || "Revisar a conversa e entrar em contato."}`, createdAt: now }, created: true, updatedBy: options.actor }).onConflictDoNothing()
          // Outbox durável: a criação participa das automações e webhooks sem depender da IA.
          await tx.insert(crmRecords).values({ resource: "whatsappIntakeEvents", id: leadId, data: { lead, state: "pending" }, created: true }).onConflictDoNothing()
        }
        result.leadId = leadId
      }
    }
    await tx.update(crmRecords).set({ data: { ...result }, updatedAt: new Date(), ...(options.actor && { updatedBy: options.actor }) }).where(and(eq(crmRecords.resource, "whatsappIntake"), eq(crmRecords.id, id)))
    return result
  })
}

export async function processWhatsappIntake(limit = 5) {
  const instance = (await evolutionConfig()).instance
  const candidates = await db.select().from(crmRecords).where(sql`${crmRecords.resource}='whatsappIntake' and ${crmRecords.deleted}=false and ${crmRecords.data}->>'instance'=${instance} and (${crmRecords.data}->>'state'='pending' or (${crmRecords.data}->>'state'='processing' and ${crmRecords.updatedAt}<now()-interval '3 minutes')) and ${crmRecords.updatedAt}<now()-interval '10 seconds'`).orderBy(crmRecords.updatedAt).limit(limit)
  for (const candidate of candidates) {
    const lease = randomUUID()
    const claimed = await db.update(crmRecords).set({ data: sql`${crmRecords.data} || ${JSON.stringify({ state: "processing", lease })}::jsonb`, updatedAt: new Date() }).where(sql`${crmRecords.resource}='whatsappIntake' and ${crmRecords.id}=${candidate.id} and (${crmRecords.data}->>'state'='pending' or (${crmRecords.data}->>'state'='processing' and ${crmRecords.updatedAt}<now()-interval '3 minutes')) and ${crmRecords.data}->>'lastInboundAt'=${candidate.data.lastInboundAt} and coalesce(${crmRecords.data}->>'source','')<>'manual'`).returning({ data: crmRecords.data })
    if (!claimed.length) continue
    const current = claimed[0].data as unknown as IntakeData
    try {
      const match = await matchContact(current.phone)
      const empty = { category: "unclassified" as IntakeCategory, confidence: 0, buyerIntent: false, summary: "", nextStep: "", evidence: [] as string[] }
      if (match.lead || match.client || match.ambiguous) { await applyIntakeClassification(candidate.id, empty, { lease }); continue }
      const { messages } = await readIntakeContext(instance, current.phone)
      let reason = ""
      if (new Date(current.lastInboundAt).getTime() < Date.now() - 7 * 86400000) reason = "Conversa antiga. Revise se ainda existe interesse comercial."
      else if (!messages.some(m => m.direction === "in")) reason = "Sem texto recebido disponível. Leia os anexos ou revise a conversa."
      else if (!await aiConfigured()) reason = "IA não configurada. Classifique manualmente ou conecte o provedor."
      if (reason) {
        await db.update(crmRecords).set({ data: sql`${crmRecords.data} || ${JSON.stringify({ state: "review", category: "unclassified", reason })}::jsonb`, updatedAt: new Date() }).where(sql`${crmRecords.resource}='whatsappIntake' and ${crmRecords.id}=${candidate.id} and ${crmRecords.data}->>'lease'=${lease} and ${crmRecords.data}->>'state'='processing'`)
        continue
      }
      // Limite global e por contato para conter consumo durante sincronizações grandes.
      const recent = await db.select().from(crmRecords).where(sql`${crmRecords.resource}='whatsappIntakeRate' and ${crmRecords.id}=${candidate.id} and ${crmRecords.updatedAt}>now()-interval '1 minute'`).limit(1)
      if (recent.length) throw Error("Aguardando intervalo para nova classificação.")
      const bucket = `intake:${Math.floor(Date.now() / 3600000)}`
      const reserved = await db.execute(sql`insert into crm_records(resource,id,data,created) values('whatsappIntakeRate',${bucket},'{"count":1}',true) on conflict(resource,id) do update set data=jsonb_build_object('count',(crm_records.data->>'count')::int+1) where (crm_records.data->>'count')::int<60 returning id`)
      if (!(reserved as unknown[]).length) throw Error("Limite horário de triagem atingido. Classifique manualmente ou tente mais tarde.")
      await db.insert(crmRecords).values({ resource: "whatsappIntakeRate", id: candidate.id, data: {}, created: true }).onConflictDoUpdate({ target: [crmRecords.resource, crmRecords.id], set: { updatedAt: new Date() } })
      const businessRows = await db.select().from(crmRecords).where(sql`${crmRecords.resource} in ('catalog','settings') and ${crmRecords.deleted}=false`)
      const business = { name: (businessRows.find(r => r.resource === "settings" && r.id === "company")?.data.company as { name?: string } | undefined)?.name?.slice(0, 120), services: businessRows.filter(r => r.resource === "catalog" && r.data.active !== false).slice(0, 20).map(r => ({ name: String(r.data.name || "").slice(0, 120), description: String(r.data.description || "").slice(0, 500) })) }
      const analysis = validateIntake(await requestIntakeClassification({ business, messages }), messages)
      await applyIntakeClassification(candidate.id, analysis, { lease })
    } catch (e) {
      await db.update(crmRecords).set({ data: sql`${crmRecords.data} || ${JSON.stringify({ state: "review", category: "unclassified", reason: e instanceof Error ? e.message : "Falha na classificação. Revise a conversa." })}::jsonb`, updatedAt: new Date() }).where(sql`${crmRecords.resource}='whatsappIntake' and ${crmRecords.id}=${candidate.id} and ${crmRecords.data}->>'lease'=${lease} and ${crmRecords.data}->>'state'='processing'`)
    }
  }
  const events = await db.select().from(crmRecords).where(sql`${crmRecords.resource}='whatsappIntakeEvents' and ${crmRecords.data}->>'state'='pending'`).limit(20)
  for (const event of events) await db.transaction(async tx => {
    const [locked] = await tx.select().from(crmRecords).where(and(eq(crmRecords.resource, "whatsappIntakeEvents"), eq(crmRecords.id, event.id))).for("update")
    if (locked?.data.state !== "pending") return
    const [source] = await tx.select().from(crmRecords).where(and(eq(crmRecords.resource, "leads"), eq(crmRecords.id, event.id), eq(crmRecords.deleted, false)))
    if (source) {
      const now = new Date().toISOString(), lead = { ...source.data, id: source.id }
      const automationId = createHash("sha256").update(JSON.stringify(["lead.created", "leads", source.id, ""])).digest("hex")
      await tx.insert(crmRecords).values({ resource: "automationEvents", id: automationId, data: { event: "lead.created", resource: "leads", sourceId: source.id, snapshot: lead, state: "pending", attempts: 0, createdAt: now }, created: true }).onConflictDoNothing()
      const hooks = await tx.select().from(crmRecords).where(sql`${crmRecords.resource}='webhooks' and ${crmRecords.deleted}=false and ${crmRecords.data}->>'active'='true' and ${crmRecords.data}->>'event'='lead.created'`)
      for (const hook of hooks) {
        const jobId = createHash("sha256").update(`intake:${event.id}:${hook.id}`).digest("hex")
        const job = { id: jobId, webhookId: hook.id, event: "lead.created", payload: lead, attempts: 0, cycleAttempts: 0, state: "pending", nextAttemptAt: now, createdAt: now, statusCode: 0, response: "Aguardando envio." }
        await tx.insert(crmRecords).values([{ resource: "webhookJobs", id: jobId, data: job, created: true }, { resource: "integrationLogs", id: jobId, data: { id: jobId, integration: "n8n", direction: "saida", event: "lead.created", webhookId: hook.id, status: "pendente", statusCode: 0, payload: JSON.stringify(lead), response: job.response, attempts: 0, createdAt: now, nextAttemptAt: now, queueState: "pending" }, created: true }]).onConflictDoNothing()
      }
    }
    await tx.update(crmRecords).set({ data: { state: "completed" }, updatedAt: new Date() }).where(and(eq(crmRecords.resource, "whatsappIntakeEvents"), eq(crmRecords.id, event.id)))
  })
}
