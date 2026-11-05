import { createHash, timingSafeEqual } from "node:crypto"
import { cookies } from "next/headers"
import { NextResponse } from "next/server"
import { and, eq, gt } from "drizzle-orm"
import { requireUser } from "@/lib/auth/session"
import { db, googleCalendarConnections, googleCalendarOauthStates } from "@/lib/db"
import { encryptSecret } from "@/lib/fiscal/crypto"
import { googleIdentity, googleTokenRequest } from "@/lib/google-calendar/client"
import { CALENDAR_SCOPES, writableCalendar } from "@/lib/google-calendar/normalize"
import { googleCredentials, listGoogleCalendars, readGoogleConnection } from "@/lib/google-calendar/settings"

export const runtime = "nodejs"
export async function GET(request: Request) {
  const user = await requireUser()
  const url = new URL(request.url)
  const redirect = (notice: string) => NextResponse.redirect(new URL(`/agenda?google=${notice}`, request.url))
  const state = url.searchParams.get("state") || ""
  const store = await cookies()
  const expected = store.get("crm_google_calendar_oauth")?.value || ""
  store.delete({ name: "crm_google_calendar_oauth", path: "/api/google-calendar" })
  if (!expected || state.length > 100 || Buffer.byteLength(state) !== Buffer.byteLength(expected) || !timingSafeEqual(Buffer.from(state), Buffer.from(expected))) return redirect("invalid_state")
  const rows = await db.delete(googleCalendarOauthStates).where(and(eq(googleCalendarOauthStates.id, createHash("sha256").update(state).digest("hex")), eq(googleCalendarOauthStates.userId, user.id), gt(googleCalendarOauthStates.expiresAt, new Date()))).returning({ id: googleCalendarOauthStates.id })
  if (!rows.length) return redirect("invalid_state")
  if (url.searchParams.has("error")) return redirect("cancelled")
  const code = url.searchParams.get("code")
  if (!code || code.length > 4000) return redirect("invalid_state")
  try {
    const settings = await googleCredentials()
    const result = await googleTokenRequest<{ access_token: string; refresh_token?: string; expires_in: number; scope?: string }>({ client_id: settings.clientId, client_secret: settings.clientSecret, redirect_uri: settings.redirectUri, grant_type: "authorization_code", code })
    if (!result.access_token || !Number.isFinite(result.expires_in) || result.expires_in <= 0) return redirect("authorization_failed")
    const scopes = new Set((result.scope || "").split(" "))
    if (!CALENDAR_SCOPES.filter(scope => scope.startsWith("https:")).every(scope => scopes.has(scope))) return redirect("permissions")
    const identity = await googleIdentity(result.access_token)
    if (!identity.sub || !identity.email) return redirect("authorization_failed")
    const existing = await readGoogleConnection(user.id)
    const sameAccount = existing?.googleSubject === identity.sub && existing.clientId === settings.clientId
    const refreshTokenEncrypted = result.refresh_token ? encryptSecret(result.refresh_token) : sameAccount ? existing.refreshTokenEncrypted : null
    if (!refreshTokenEncrypted) return redirect("offline_required")
    const calendars = await listGoogleCalendars(result.access_token)
    const previous = sameAccount ? calendars.find(c => c.id === existing.selectedCalendarId) : undefined
    const selected = previous || calendars.find(c => c.primary && writableCalendar(c)) || calendars.find(writableCalendar) || calendars[0]
    const values = { userId: user.id, googleSubject: identity.sub, email: identity.email, clientId: settings.clientId, accessTokenEncrypted: encryptSecret(result.access_token), refreshTokenEncrypted, tokenExpiresAt: new Date(Date.now() + result.expires_in * 1000), calendars, selectedCalendarId: selected?.id || null, events: [], rangeStart: null, rangeEnd: null, lastSyncedAt: null, lastError: null, status: "connected", updatedAt: new Date() }
    await db.insert(googleCalendarConnections).values(values).onConflictDoUpdate({ target: googleCalendarConnections.userId, set: values })
    return redirect(calendars.length ? "connected" : "no_calendars")
  } catch { return redirect("authorization_failed") }
}
