import { createHash, timingSafeEqual } from "node:crypto"
import { cookies } from "next/headers"
import { NextResponse } from "next/server"
import { and, eq, gt } from "drizzle-orm"
import { db, instagramAccounts, instagramOauthStates, instagramSettings } from "@/lib/db"
import { encryptSecret } from "@/lib/fiscal/crypto"
import { syncInstagramAccount } from "@/lib/instagram/actions"
import { requireInstagramUser } from "@/lib/instagram/access"
import { graphRequest, InstagramApiError } from "@/lib/instagram/client"
import { normalizeProfile } from "@/lib/instagram/normalize"
import { instagramCredentials } from "@/lib/instagram/settings"
import type { GraphPage, InstagramPageAccount } from "@/lib/instagram/types"

export const runtime = "nodejs"
export async function GET(request: Request) {
  const user = await requireInstagramUser(true)
  const url = new URL(request.url)
  const redirect = (notice: string) => NextResponse.redirect(new URL(`/instagram?notice=${notice}`, request.url))
  const state = url.searchParams.get("state") || ""
  const store = await cookies()
  const expected = store.get("crm_instagram_oauth")?.value || ""
  store.delete({ name: "crm_instagram_oauth", path: "/api/instagram" })
  if (!expected || state.length > 100 || Buffer.byteLength(expected) !== Buffer.byteLength(state) || !timingSafeEqual(Buffer.from(state), Buffer.from(expected))) return redirect("invalid_state")
  // DELETE RETURNING garante que cada autorização seja usada uma única vez.
  const claimed = await db.delete(instagramOauthStates).where(and(eq(instagramOauthStates.id, createHash("sha256").update(state).digest("hex")), eq(instagramOauthStates.userId, user.id), gt(instagramOauthStates.expiresAt, new Date()))).returning({ id: instagramOauthStates.id })
  if (!claimed.length) return redirect("invalid_state")
  if (url.searchParams.has("error")) return redirect("cancelled")
  const code = url.searchParams.get("code")
  if (!code || code.length > 4000) return redirect("invalid_state")
  try {
    const settings = await instagramCredentials()
    const short = await graphRequest<{ access_token: string }>("oauth/access_token", { version: settings.graphVersion, params: { client_id: settings.appId, client_secret: settings.appSecret, redirect_uri: settings.redirectUri, code } })
    if (!short.access_token) return redirect("authorization_failed")
    const long = await graphRequest<{ access_token: string; expires_in?: number }>("oauth/access_token", { version: settings.graphVersion, params: { grant_type: "fb_exchange_token", client_id: settings.appId, client_secret: settings.appSecret, fb_exchange_token: short.access_token } })
    if (!long.access_token) return redirect("authorization_failed")
    const pages: InstagramPageAccount[] = []
    let after: string | undefined
    for (let i = 0; i < 10; i++) {
      const result = await graphRequest<GraphPage<InstagramPageAccount>>("me/accounts", { version: settings.graphVersion, token: long.access_token, appSecret: settings.appSecret, params: { fields: "id,name,access_token,instagram_business_account{id,username,name}", limit: "100", ...(after ? { after } : {}) } })
      if (!Array.isArray(result.data)) return redirect("authorization_failed")
      pages.push(...result.data)
      after = result.paging?.next ? result.paging.cursors?.after : undefined
      if (!after) break
    }
    const eligible = pages.filter(page => page.access_token && page.instagram_business_account?.id && page.instagram_business_account.username)
    if (!eligible.length) return redirect("no_professional_account")
    const expiresAt = long.expires_in ? new Date(Date.now() + long.expires_in * 1000) : null
    for (const page of eligible) {
      const profile = normalizeProfile(page.instagram_business_account)
      const values = { id: profile.id, pageId: page.id, pageName: page.name, tokenEncrypted: encryptSecret(page.access_token!), tokenExpiresAt: expiresAt, profile, connectedBy: user.id, updatedAt: new Date() }
      await db.insert(instagramAccounts).values(values).onConflictDoUpdate({ target: instagramAccounts.id, set: values })
    }
    // Com mais de um perfil autorizado, o usuário escolhe qual mostrar no CRM.
    if (eligible.length === 1) {
      await db.update(instagramSettings).set({ activeAccountId: eligible[0].instagram_business_account!.id, updatedAt: new Date() }).where(eq(instagramSettings.id, "default"))
      try { await syncInstagramAccount() }
      catch { return redirect("connected_sync_pending") }
      return redirect("connected")
    }
    return redirect("choose_account")
  } catch (error) {
    // Evita transportar mensagens do provedor, códigos ou tokens na URL/console.
    return redirect(error instanceof InstagramApiError && [10, 200].includes(error.code) ? "permissions" : "authorization_failed")
  }
}
