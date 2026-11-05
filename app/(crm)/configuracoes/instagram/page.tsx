import { headers } from "next/headers"
import { redirect } from "next/navigation"
import { requireUser } from "@/lib/auth/session"
import { getInstagramAdminSettings } from "@/lib/instagram/actions"
import { InstagramAdminSettings } from "@/components/instagram/admin-settings"

export default async function InstagramConfigurationPage() {
  const user = await requireUser()
  if (user.role !== "admin") redirect("/instagram")
  const [initial, requestHeaders] = await Promise.all([getInstagramAdminSettings(), headers()])
  const host = requestHeaders.get("host") || "localhost:3000"
  const protocol = process.env.NODE_ENV === "development" ? "http" : "https"
  const defaultRedirect = process.env.INSTAGRAM_REDIRECT_URI || `${protocol}://${host}/api/instagram/callback`
  return <InstagramAdminSettings initial={initial} defaultRedirect={defaultRedirect} />
}
