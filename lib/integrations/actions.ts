"use server"
import { randomBytes, randomUUID } from "node:crypto"
import { sql } from "drizzle-orm"
import { z } from "zod"
import { getCurrentUser, sha256Hex } from "@/lib/auth/session"
import { db, crmRecords } from "@/lib/db"
import { retryQueuedWebhook } from "@/lib/integrations/webhook-queue"
import { sendAndLog } from "@/lib/integrations/webhooks"
import type { ApiKey, Webhook } from "@/types"
import { API_SCOPES } from "./api-contract"
async function admin() { if ((await getCurrentUser())?.role !== "admin") throw new Error("Sem permissão.") }
export async function testWebhookAction(id: string) {
  await admin()
  const [row] = await db.select().from(crmRecords).where(sql`${crmRecords.resource}='webhooks' and ${crmRecords.id}=${id} and ${crmRecords.deleted}=false`).limit(1)
  if (!row) throw new Error("Webhook não encontrado.")
  const webhook = row.data as unknown as Webhook
  return sendAndLog(webhook, webhook.event, { test: true, sentAt: new Date().toISOString() })
}
export async function retryWebhookAction(id: string) {
  await admin()
  const [log] = await db.select().from(crmRecords).where(sql`${crmRecords.resource}='integrationLogs' and ${crmRecords.id}=${id} and ${crmRecords.deleted}=false`).limit(1)
  if (!log || log.data.integration !== "n8n" || log.data.direction !== "saida") throw new Error("Este evento não permite reenvio.")
  const [row] = await db.select().from(crmRecords).where(sql`${crmRecords.resource}='webhooks' and ${crmRecords.id}=${String(log.data.webhookId)} and ${crmRecords.deleted}=false`).limit(1)
  if (!row || !row.data.active) throw new Error("Webhook removido ou pausado.")
  return retryQueuedWebhook(id)
}
export async function createApiKeyAction(name: string, scopes: string[]) {
  await admin()
  const value = z.object({ name: z.string().trim().min(1).max(120), scopes: z.array(z.enum(API_SCOPES)).min(1) }).parse({ name, scopes })
  const token = `sk_live_${randomBytes(32).toString("base64url")}`
  const key: ApiKey = { id: randomUUID(), name: value.name, scopes: value.scopes, prefix: token.slice(0, 12), createdAt: new Date().toISOString() }
  await db.insert(crmRecords).values({ resource: "apiKeys", id: key.id, created: true, data: { ...key, tokenHash: sha256Hex(token) } })
  return { key, token }
}
