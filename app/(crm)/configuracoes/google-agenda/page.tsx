import { headers } from "next/headers"
import { redirect } from "next/navigation"
import { requireUser } from "@/lib/auth/session"
import { getGoogleCalendarAdminSettings } from "@/lib/google-calendar/actions"
import { GoogleCalendarAdminSettings } from "@/components/google-calendar/admin-settings"

export default async function GoogleCalendarConfigurationPage() {
  const user = await requireUser()
  if (user.role !== "admin") redirect("/agenda")
  const [initial, requestHeaders] = await Promise.all([getGoogleCalendarAdminSettings(), headers()])
  const host = requestHeaders.get("host") || "localhost:3000"
  const protocol = process.env.NODE_ENV === "development" ? "http" : "https"
  const defaultRedirect = process.env.GOOGLE_CALENDAR_REDIRECT_URI || `${protocol}://${host}/api/google-calendar/callback`
  return <GoogleCalendarAdminSettings initial={initial} defaultRedirect={defaultRedirect} />
}
