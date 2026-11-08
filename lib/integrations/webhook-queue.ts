import { randomUUID } from "node:crypto"
import { sql } from "drizzle-orm"
import { db, crmRecords } from "@/lib/db"
import { deliverWebhook } from "./webhooks"
import type { Webhook, WebhookEvent } from "@/types"

export const MAX_WEBHOOK_ATTEMPTS = 6
let lastCleanup = 0
export function retryDelay(attempt: number) { return Math.min(3600000, 30000 * 2 ** Math.max(0, attempt - 1)) }
export function retryable(status: number) { return status === 0 || [408, 425, 429].includes(status) || status >= 500 }
type Job = { id: string; webhookId: string; event: string; payload: unknown; attempts: number; cycleAttempts: number;
  state: "pending" | "processing" | "completed" | "failed"; nextAttemptAt: string | null; leaseUntil?: string | null;
  leaseToken?: string | null; createdAt: string; statusCode: number; response: string }

function log(job: Job) {
  return { id: job.id, integration: "n8n", direction: "saida", event: job.event, webhookId: job.webhookId,
    status: job.state === "completed" ? "sucesso" : job.state === "failed" ? "erro" : "pendente",
    statusCode: job.statusCode, payload: JSON.stringify(job.payload), response: job.response,
    attempts: job.attempts, createdAt: job.createdAt, nextAttemptAt: job.nextAttemptAt, queueState: job.state }
}

async function save(job: Job, lease: string) {
  await db.execute(sql`with saved as (
    update crm_records set data=${JSON.stringify(job)}::jsonb,updated_at=now()
    where resource='webhookJobs' and id=${job.id} and data->>'leaseToken'=${lease} returning id
  ) update crm_records set data=${JSON.stringify(log(job))}::jsonb,updated_at=now()
    where resource='integrationLogs' and id=${job.id} and exists(select 1 from saved)`)
}

export async function processWebhookJob(id: string) {
  const lease = randomUUID()
  const claimed = await db.execute(sql`update crm_records set data=data || jsonb_build_object(
    'state','processing','leaseToken',${lease}::text,'leaseUntil',now()+interval '2 minutes',
    'attempts',coalesce((data->>'attempts')::int,0)+1,'cycleAttempts',coalesce((data->>'cycleAttempts')::int,0)+1),updated_at=now()
    where resource='webhookJobs' and id=${id} and deleted=false and (
      (data->>'state'='pending' and (data->>'nextAttemptAt')::timestamptz<=now()) or
      (data->>'state'='processing' and (data->>'leaseUntil')::timestamptz<now())) returning data`)
  const job = (claimed as unknown as { data: Job }[])[0]?.data
  if (!job) return { status: 0, ms: 0, queued: true }
  const [row] = await db.select().from(crmRecords).where(sql`${crmRecords.resource}='webhooks' and ${crmRecords.id}=${job.webhookId} and ${crmRecords.deleted}=false`).limit(1)
  let result = { status: 0, ms: 0 }
  let response = ""
  if (!row?.data.active) response = "Webhook removido ou pausado. Reative e reenvie manualmente."
  else if (job.cycleAttempts > MAX_WEBHOOK_ATTEMPTS) response = "Limite de tentativas atingido após interrupções. Revise o destino e reenvie manualmente."
  else {
    try { result = await deliverWebhook(row.data as unknown as Webhook, job.event, job.payload, job.id) }
    catch { response = "Falha de conexão ou destino indisponível." }
  }
  const success = result.status >= 200 && result.status < 300
  const again = !success && Boolean(row?.data.active) && retryable(result.status) && job.cycleAttempts < MAX_WEBHOOK_ATTEMPTS
  const next: Job = { ...job, state: success ? "completed" : again ? "pending" : "failed", statusCode: result.status,
    response: response || `HTTP ${result.status}`, nextAttemptAt: again ? new Date(Date.now() + retryDelay(job.cycleAttempts)).toISOString() : null,
    leaseToken: null, leaseUntil: null }
  await save(next, lease)
  await db.update(crmRecords).set({ data: sql`${crmRecords.data} || ${JSON.stringify({ lastStatus: result.status, lastSentAt: new Date().toISOString() })}::jsonb` })
    .where(sql`${crmRecords.resource}='webhooks' and ${crmRecords.id}=${job.webhookId}`)
  return { ...result, queued: again }
}

export async function processPendingWebhooks() {
  if (Date.now() - lastCleanup > 3600000) {
    await db.execute(sql`delete from crm_records where
      (resource='passwordRecovery' and (data->>'expiresAt')::timestamptz<now()) or
      (resource in ('passwordRecoveryRate','whatsappMediaRate') and updated_at<now()-interval '2 days')`)
    lastCleanup = Date.now()
  }
  await db.insert(crmRecords).values({ resource: "workerHeartbeats", id: "webhooks", data: { checkedAt: new Date().toISOString() }, created: true })
    .onConflictDoUpdate({ target: [crmRecords.resource, crmRecords.id], set: { data: { checkedAt: new Date().toISOString() }, updatedAt: new Date() } })
  const rows = await db.select({ id: crmRecords.id }).from(crmRecords).where(sql`${crmRecords.resource}='webhookJobs' and ${crmRecords.deleted}=false and (
    (${crmRecords.data}->>'state'='pending' and (${crmRecords.data}->>'nextAttemptAt')::timestamptz<=now()) or
    (${crmRecords.data}->>'state'='processing' and (${crmRecords.data}->>'leaseUntil')::timestamptz<now()))`).limit(50)
  for (const row of rows) await processWebhookJob(row.id)
  return rows.length
}

export async function retryQueuedWebhook(id: string) {
  // Migra uma entrega antiga para a fila preservando o ID usado na deduplicação do receptor.
  await db.execute(sql`insert into crm_records(resource,id,data,created)
    select 'webhookJobs',id,jsonb_build_object('id',id,'webhookId',data->>'webhookId','event',data->>'event',
      'payload',(data->>'payload')::jsonb,'attempts',coalesce((data->>'attempts')::int,0),'cycleAttempts',0,
      'state','failed','nextAttemptAt',null,'createdAt',data->>'createdAt','statusCode',0,'response','Reenvio solicitado.'),true
    from crm_records where resource='integrationLogs' and id=${id} and deleted=false
      and data->>'integration'='n8n' and data->>'direction'='saida' and data->>'status'='erro'
    on conflict(resource,id) do nothing`)
  const rows = await db.execute(sql`update crm_records set data=data || jsonb_build_object('state','pending','cycleAttempts',0,'nextAttemptAt',now()),updated_at=now()
    where resource='webhookJobs' and id=${id} and data->>'state' in ('failed','pending') returning id`)
  if (!(rows as unknown[]).length) throw Error("Entrega concluída, em processamento ou antiga sem fila. Não foi reenviada.")
  return processWebhookJob(id)
}

export async function sendAndLog(webhook: Webhook, event: string, payload: unknown, previousId?: string) {
  if (previousId) return retryQueuedWebhook(previousId)
  const job: Job = { id: randomUUID(), webhookId: webhook.id, event, payload, attempts: 0, cycleAttempts: 0,
    state: "pending", nextAttemptAt: new Date().toISOString(), createdAt: new Date().toISOString(), statusCode: 0, response: "Aguardando envio." }
  // O trabalho existe antes da primeira chamada HTTP; interrupções deixam uma entrega recuperável.
  await db.execute(sql`with queued as (
    insert into crm_records(resource,id,data,created) values('webhookJobs',${job.id},${JSON.stringify(job)}::jsonb,true) returning id
  ) insert into crm_records(resource,id,data,created) select 'integrationLogs',id,${JSON.stringify(log(job))}::jsonb,true from queued`)
  return processWebhookJob(job.id)
}

export async function dispatchCrmEvent(event: WebhookEvent, payload: unknown) {
  const rows = await db.select({ data: crmRecords.data }).from(crmRecords).where(sql`${crmRecords.resource}='webhooks' and ${crmRecords.deleted}=false and ${crmRecords.data}->>'active'='true' and ${crmRecords.data}->>'event'=${event}`)
  await Promise.all(rows.map(row => sendAndLog(row.data as unknown as Webhook, event, payload)))
}
