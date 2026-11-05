import { createHash, randomBytes } from "node:crypto"
import { cookies } from "next/headers"
import { NextResponse } from "next/server"
import { lt } from "drizzle-orm"
import { requireUser } from "@/lib/auth/session"
import { db, googleCalendarOauthStates } from "@/lib/db"
import { CALENDAR_SCOPES } from "@/lib/google-calendar/normalize"
import { googleCredentials } from "@/lib/google-calendar/settings"

export const runtime = "nodejs"
export async function GET(request: Request) {
  const user = await requireUser()
  let settings: Awaited<ReturnType<typeof googleCredentials>>
  try { settings = await googleCredentials() }
  catch { return NextResponse.redirect(new URL("/agenda?google=configuration", request.url)) }
  const state = randomBytes(32).toString("base64url")
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000)
  await db.delete(googleCalendarOauthStates).where(lt(googleCalendarOauthStates.expiresAt, new Date()))
  await db.insert(googleCalendarOauthStates).values({ id: createHash("sha256").update(state).digest("hex"), userId: user.id, expiresAt })
  ;(await cookies()).set("crm_google_calendar_oauth", state, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/api/google-calendar", expires: expiresAt })
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth")
  url.search = new URLSearchParams({ client_id: settings.clientId, redirect_uri: settings.redirectUri, response_type: "code", scope: CALENDAR_SCOPES.join(" "), state, access_type: "offline", prompt: "consent select_account", include_granted_scopes: "true" }).toString()
  return NextResponse.redirect(url)
}
