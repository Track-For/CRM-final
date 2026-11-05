import { eq } from "drizzle-orm"
import { db, instagramSettings } from "@/lib/db"
import { decryptSecret } from "@/lib/fiscal/crypto"

export async function readInstagramSettings() {
  const [row] = await db.select().from(instagramSettings).where(eq(instagramSettings.id, "default")).limit(1)
  return row || null
}
export async function instagramCredentials() {
  const settings = await readInstagramSettings()
  if (!settings?.appId || !settings.appSecretEncrypted) throw new Error("Configure o aplicativo Meta antes de conectar o Instagram.")
  return { ...settings, appSecret: decryptSecret(settings.appSecretEncrypted) }
}
