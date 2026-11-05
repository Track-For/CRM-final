import { createHash, randomBytes } from "node:crypto"
import { cookies } from "next/headers"
import { NextResponse } from "next/server"
import { lt } from "drizzle-orm"
import { db, instagramOauthStates } from "@/lib/db"
import { requireInstagramUser } from "@/lib/instagram/access"
import { instagramCredentials } from "@/lib/instagram/settings"

export const runtime = "nodejs"
export async function GET(request: Request) {
  const user = await requireInstagramUser(true)
  let settings: Awaited<ReturnType<typeof instagramCredentials>>
  try { settings = await instagramCredentials() }
  catch { return NextResponse.redirect(new URL("/instagram?notice=configuration", request.url)) }
  const state = randomBytes(32).toString("base64url")
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000)
  await db.delete(instagramOauthStates).where(lt(instagramOauthStates.expiresAt, new Date()))
  await db.insert(instagramOauthStates).values({ id: createHash("sha256").update(state).digest("hex"), userId: user.id, expiresAt })
  ;(await cookies()).set("crm_instagram_oauth", state, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/api/instagram", expires: expiresAt })
  const url = new URL(`https://www.facebook.com/${settings.graphVersion}/dialog/oauth`)
  url.search = new URLSearchParams({ client_id: settings.appId, redirect_uri: settings.redirectUri, state, response_type: "code", scope: "pages_show_list,pages_read_engagement,instagram_basic", auth_type: "rerequest" }).toString()
  return NextResponse.redirect(url)
}
