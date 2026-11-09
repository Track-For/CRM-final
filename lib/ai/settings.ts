// Somente servidor. Esta coleção não é exposta pelas APIs genéricas do CRM.
import { currentWorkspace } from "@/lib/saas/context"
import { and, eq } from "drizzle-orm"
import { db, crmRecords } from "@/lib/db"
import { decryptSecret } from "@/lib/fiscal/crypto"

export type AiSettings = { model: string; apiKeyEncrypted?: string; enabled: boolean }
export async function readAiSettings() {
  const [row] = await db.select().from(crmRecords).where(and(eq(crmRecords.resource, "aiProviderSettings"), eq(crmRecords.id, "openai"), eq(crmRecords.deleted, false))).limit(1)
  return row?.data as AiSettings | undefined
}
export async function aiCredentials() {
  const saved = await readAiSettings()
  if (saved && !saved.enabled) return null
  const tenant = await currentWorkspace()
  const model = saved?.model || (tenant ? undefined : process.env.OPENAI_MODEL?.trim())
  const key = saved?.apiKeyEncrypted ? decryptSecret(saved.apiKeyEncrypted) : (tenant ? undefined : process.env.OPENAI_API_KEY?.trim())
  return model && key ? { model, key } : null
}
