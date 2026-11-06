import { lookup } from "node:dns/promises"
import { request } from "node:https"
import { createHmac, randomUUID } from "node:crypto"
import { sql } from "drizzle-orm"
import { db, crmRecords } from "@/lib/db"
import { webhookUrl, isPublicAddress } from "@/lib/security/webhook-url"
import type { Webhook, WebhookEvent } from "@/types"

export async function deliverWebhook(webhook: Webhook, event: string, data: unknown, delivery: string = randomUUID()) {
  const url = webhookUrl(webhook.url)
  const addresses = await lookup(url.hostname, { all: true })
  if (!addresses.length || addresses.some(item => !isPublicAddress(item.address))) throw new Error("O destino do webhook não é público.")
  const target = addresses[0]
  const body = JSON.stringify({ event, delivery, data })
  const start = Date.now()
  const status = await new Promise<number>((resolve, reject) => {
    const req = request(url, { method: "POST", family: target.family, lookup: (_hostname, _options, callback) => callback(null, target.address, target.family), headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(body), "X-Solid-Event": event, "X-Solid-Delivery": delivery, "X-Solid-Signature": createHmac("sha256", webhook.secret).update(body).digest("hex") } }, response => { resolve(response.statusCode || 502); response.destroy() })
    req.setTimeout(8000, () => req.destroy(new Error("O destino não respondeu em 8 segundos.")))
    req.on("error", reject); req.end(body)
  })
  return { status, ms: Date.now() - start }
}
export async function sendAndLog(webhook: Webhook, event: string, payload: unknown, previousId?: string, attempts = 0) {
  const id = previousId || randomUUID()
  let result = { status: 0, ms: 0 }
  let response = ""
  try { result = await deliverWebhook(webhook, event, payload, id) } catch (error) { response = error instanceof Error ? error.message : "Falha de conexão" }
  const data = { id, integration: "n8n", event, direction: "saida", status: result.status >= 200 && result.status < 300 ? "sucesso" : "erro", statusCode: result.status, payload: JSON.stringify(payload), response: response || `HTTP ${result.status}`, attempts: attempts + 1, createdAt: new Date().toISOString(), webhookId: webhook.id }
  await db.insert(crmRecords).values({ resource: "integrationLogs", id, created: true, data }).onConflictDoUpdate({ target: [crmRecords.resource, crmRecords.id], set: { data, updatedAt: new Date() } })
  await db.update(crmRecords).set({ data: sql`${crmRecords.data} || ${JSON.stringify({ lastStatus: result.status, lastSentAt: data.createdAt })}::jsonb` }).where(sql`${crmRecords.resource}='webhooks' and ${crmRecords.id}=${webhook.id}`)
  return result
}
export async function dispatchCrmEvent(event: WebhookEvent, payload: unknown) {
  const rows = await db.select({ data: crmRecords.data }).from(crmRecords).where(sql`${crmRecords.resource}='webhooks' and ${crmRecords.deleted}=false and ${crmRecords.data}->>'active'='true' and ${crmRecords.data}->>'event'=${event}`)
  await Promise.all(rows.map(row => sendAndLog(row.data as unknown as Webhook, event, payload)))
}
