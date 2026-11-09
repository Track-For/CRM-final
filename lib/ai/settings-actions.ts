"use server"

import { currentWorkspace } from "@/lib/saas/context"
import { sql } from "drizzle-orm"
import { z } from "zod"
import { requireUser } from "@/lib/auth/session"
import { crmRecords, db } from "@/lib/db"
import { encryptSecret } from "@/lib/fiscal/crypto"
import { readAiSettings } from "./settings"
import { aiConfigured, requestConversationAnalysis } from "./provider"
import { validateEvidence } from "./whatsapp-schema"

async function admin() {
  const user = await requireUser()
  if (user.role !== "admin") throw new Error("Somente administradores configuram a IA.")
  return user
}
export async function getAiSettingsAction() {
  await admin()
  const saved = await readAiSettings()
  const tenant = await currentWorkspace()
  return { model: saved?.model || (tenant ? "" : process.env.OPENAI_MODEL) || "", enabled: saved?.enabled ?? true, hasKey: Boolean(saved?.apiKeyEncrypted || (!tenant && process.env.OPENAI_API_KEY)), keySource: saved?.apiKeyEncrypted ? "crm" : !tenant && process.env.OPENAI_API_KEY ? "server" : "none", configured: await aiConfigured() }
}
export async function saveAiSettingsAction(input: { model: string; apiKey: string; enabled: boolean }) {
  const user = await admin()
  const value = z.object({ model: z.string().trim().min(1, "Informe o modelo.").max(160).regex(/^[a-zA-Z0-9._:/-]+$/, "Nome de modelo inválido."), apiKey: z.string().trim().max(1000).refine(key => !key || /^sk-[a-zA-Z0-9_-]{16,}$/.test(key), "Informe uma chave de API válida."), enabled: z.boolean() }).strict().parse(input)
  const previous = await readAiSettings()
  const encrypted = value.apiKey ? encryptSecret(value.apiKey) : previous?.apiKeyEncrypted
  if (value.enabled && !encrypted && (await currentWorkspace() || !process.env.OPENAI_API_KEY)) throw new Error("Informe a chave da OpenAI para ativar a análise.")
  const data = { model: value.model, enabled: value.enabled, ...(encrypted && { apiKeyEncrypted: encrypted }) }
  await db.insert(crmRecords).values({ resource: "aiProviderSettings", id: "openai", data, created: true, updatedBy: user.id }).onConflictDoUpdate({ target: [crmRecords.resource, crmRecords.id], set: { data, deleted: false, updatedAt: new Date(), updatedBy: user.id } })
  return getAiSettingsAction()
}
export async function disconnectAiAction() {
  const user = await admin()
  const data = { model: "", enabled: false }
  await db.insert(crmRecords).values({ resource: "aiProviderSettings", id: "openai", data, created: true, updatedBy: user.id }).onConflictDoUpdate({ target: [crmRecords.resource, crmRecords.id], set: { data, deleted: false, updatedAt: new Date(), updatedBy: user.id } })
  return getAiSettingsAction()
}
export async function testAiSettingsAction() {
  const user = await admin()
  if (!await aiConfigured()) throw new Error("Salve a chave e o modelo antes de testar.")
  const reserved = await db.execute(sql`INSERT INTO crm_records(resource,id,data,created,deleted,updated_by,updated_at)
    VALUES('whatsappAiRate',${`settings:${user.id}`},'{}'::jsonb,true,false,${user.id},now())
    ON CONFLICT(resource,id) DO UPDATE SET updated_at=now() WHERE crm_records.updated_at < now()-interval '1 minute' RETURNING id`)
  if (!(reserved as unknown[]).length) throw new Error("Aguarde um minuto antes de testar novamente.")
  const messages = [{ id: "test-message", direction: "in" as const, text: "Olá, gostaria de conversar sobre um site. Ainda não defini prazo nem orçamento.", sentAt: new Date().toISOString() }]
  validateEvidence(await requestConversationAnalysis({ test: true, messages, allowedStages: [], pendingTasks: [] }), messages, [])
  return { ok: true }
}
