"use server"

import { eq } from "drizzle-orm"
import { z } from "zod"
import { db, instagramAccounts, instagramSettings } from "@/lib/db"
import { decryptSecret, encryptSecret } from "@/lib/fiscal/crypto"
import { requireInstagramUser } from "./access"
import { graphRequest, MEDIA_FIELDS, PROFILE_FIELDS, STORY_FIELDS } from "./client"
import { currentStories, mergeMedia, normalizeMedia, normalizeProfile, validateRedirectUri } from "./normalize"
import { instagramCredentials, readInstagramSettings } from "./settings"
import type { GraphPage, InstagramMedia } from "./types"

export async function getInstagramOverview() {
  const user = await requireInstagramUser()
  const settings = await readInstagramSettings()
  // Nunca selecionar tokens ou segredos para dados enviados ao navegador.
  const accounts = await db.select({ id: instagramAccounts.id, pageName: instagramAccounts.pageName, profile: instagramAccounts.profile, tokenExpiresAt: instagramAccounts.tokenExpiresAt, media: instagramAccounts.media, stories: instagramAccounts.stories, mediaCursor: instagramAccounts.mediaCursor, warnings: instagramAccounts.warnings, lastSyncedAt: instagramAccounts.lastSyncedAt, storiesSyncedAt: instagramAccounts.storiesSyncedAt }).from(instagramAccounts)
  const visible = settings?.activeAccountId ? accounts.find(account => account.id === settings.activeAccountId) : undefined
  return {
    canManage: user.role === "admin",
    configured: Boolean(settings?.appId && settings.appSecretEncrypted),

    accounts: accounts.map(account => ({ id: account.id, username: account.profile.username, name: account.profile.name, pageName: account.pageName })),
    active: visible ? { ...visible, stories: currentStories(visible.stories), tokenExpiresAt: visible.tokenExpiresAt?.toISOString() || null, lastSyncedAt: visible.lastSyncedAt?.toISOString() || null, storiesSyncedAt: visible.storiesSyncedAt?.toISOString() || null } : null,
  }
}
export async function getInstagramAdminSettings() {
  await requireInstagramUser(true)
  const settings = await readInstagramSettings()
  return settings ? { appId: settings.appId, redirectUri: settings.redirectUri, graphVersion: settings.graphVersion, hasSecret: Boolean(settings.appSecretEncrypted) } : null
}
const configSchema = z.object({ appId: z.string().trim().regex(/^\d{5,40}$/, "Informe o App ID fornecido pela Meta."), appSecret: z.string().trim().max(256), redirectUri: z.string().trim().url(), graphVersion: z.string().regex(/^v\d{2}\.\d+$/) })
export async function saveInstagramSettings(input: z.infer<typeof configSchema>) {
  const user = await requireInstagramUser(true)
  const data = configSchema.parse(input)
  const redirectUri = validateRedirectUri(data.redirectUri)
  const existing = await readInstagramSettings()
  if (!data.appSecret && (!existing?.appSecretEncrypted || existing.appId !== data.appId)) throw new Error("Informe o App Secret deste aplicativo Meta.")
  if (data.appSecret && data.appSecret.length < 16) throw new Error("Confira o App Secret informado pela Meta.")
  const appSecretEncrypted = data.appSecret ? encryptSecret(data.appSecret) : existing!.appSecretEncrypted
  await db.insert(instagramSettings).values({ id: "default", appId: data.appId, appSecretEncrypted, redirectUri, graphVersion: data.graphVersion, updatedBy: user.id }).onConflictDoUpdate({ target: instagramSettings.id, set: { appId: data.appId, appSecretEncrypted, redirectUri, graphVersion: data.graphVersion, updatedBy: user.id, updatedAt: new Date() } })
}
export async function selectInstagramAccount(id: string) {
  await requireInstagramUser(true)
  const [account] = await db.select({ id: instagramAccounts.id, tokenEncrypted: instagramAccounts.tokenEncrypted }).from(instagramAccounts).where(eq(instagramAccounts.id, z.string().regex(/^\d+$/).parse(id))).limit(1)
  if (!account?.tokenEncrypted) throw new Error("Reconecte essa conta à Meta antes de selecioná-la.")
  await db.update(instagramSettings).set({ activeAccountId: account.id, updatedAt: new Date() }).where(eq(instagramSettings.id, "default"))
}
async function activeConnection() {
  const settings = await instagramCredentials()
  if (!settings.activeAccountId) throw new Error("Selecione o perfil do Instagram que deseja sincronizar.")
  const [account] = await db.select().from(instagramAccounts).where(eq(instagramAccounts.id, settings.activeAccountId)).limit(1)
  if (!account?.tokenEncrypted) throw new Error("Conecte o Instagram antes de sincronizar.")
  return { settings, account, token: decryptSecret(account.tokenEncrypted) }
}
export async function syncInstagramAccount() {
  await requireInstagramUser(true)
  const { settings, account, token } = await activeConnection()
  const options = { token, appSecret: settings.appSecret, version: settings.graphVersion }
  const profile = normalizeProfile(await graphRequest(account.id, { ...options, params: { fields: PROFILE_FIELDS } }))
  const warnings: string[] = []
  const results = await Promise.allSettled([
    graphRequest<GraphPage<InstagramMedia>>(`${account.id}/media`, { ...options, params: { fields: MEDIA_FIELDS, limit: "25" } }),
    graphRequest<GraphPage<InstagramMedia>>(`${account.id}/stories`, { ...options, params: { fields: STORY_FIELDS, limit: "100" } }),
  ])
  const patch: Partial<typeof instagramAccounts.$inferInsert> = { profile, lastSyncedAt: new Date(), updatedAt: new Date() }
  if (results[0].status === "fulfilled") {
    patch.media = normalizeMedia(results[0].value.data)
    patch.mediaCursor = results[0].value.paging?.next ? results[0].value.paging?.cursors?.after || null : null
  } else warnings.push(`Publicações: ${results[0].reason instanceof Error ? results[0].reason.message : "consulta indisponível"}`)
  if (results[1].status === "fulfilled") {
    patch.stories = normalizeMedia(results[1].value.data).map(item => ({ ...item, media_product_type: "STORY" }))
    patch.storiesSyncedAt = new Date()
  } else warnings.push(`Stories: ${results[1].reason instanceof Error ? results[1].reason.message : "consulta indisponível"}. A última sincronização disponível foi preservada.`)
  patch.warnings = warnings
  await db.update(instagramAccounts).set(patch).where(eq(instagramAccounts.id, account.id))
  return { warnings }
}
export async function loadMoreInstagramMedia() {
  await requireInstagramUser(true)
  const { settings, account, token } = await activeConnection()
  if (!account.mediaCursor) return
  const result = await graphRequest<GraphPage<InstagramMedia>>(`${account.id}/media`, { token, appSecret: settings.appSecret, version: settings.graphVersion, params: { fields: MEDIA_FIELDS, limit: "25", after: account.mediaCursor } })
  await db.update(instagramAccounts).set({ media: mergeMedia(account.media, normalizeMedia(result.data)), mediaCursor: result.paging?.next ? result.paging?.cursors?.after || null : null, updatedAt: new Date() }).where(eq(instagramAccounts.id, account.id))
}
export async function disconnectInstagram() {
  await requireInstagramUser(true)
  const settings = await readInstagramSettings()
  if (!settings?.activeAccountId) return
  const id = settings.activeAccountId
  await db.update(instagramSettings).set({ activeAccountId: null, updatedAt: new Date() }).where(eq(instagramSettings.id, "default"))
  await db.delete(instagramAccounts).where(eq(instagramAccounts.id, id))
}
