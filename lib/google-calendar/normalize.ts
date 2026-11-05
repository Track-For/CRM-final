import { createHash } from "node:crypto"
import type { CalendarEvent, EventType } from "../../types/index"
import type { GoogleCalendar, GoogleEvent } from "./types"

export const CALENDAR_SCOPES = ["openid", "email", "https://www.googleapis.com/auth/calendar.calendarlist.readonly", "https://www.googleapis.com/auth/calendar.events"]
export function validateGoogleRedirect(input: string): string {
  const url = new URL(input)
  const local = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)
  if ((url.protocol !== "https:" && !(local && url.protocol === "http:")) || url.username || url.password || url.search || url.hash || url.pathname !== "/api/google-calendar/callback") throw new Error("Use uma URL HTTPS terminada em /api/google-calendar/callback. HTTP só é permitido em localhost.")
  return url.toString()
}
export function writableCalendar(calendar: GoogleCalendar | undefined): boolean {
  return Boolean(calendar && ["owner", "writer", "writerWithoutPrivateAccess"].includes(calendar.accessRole))
}
function safeHttp(input?: string): string | undefined {
  try { if (!input) return; const url = new URL(input); return ["http:", "https:"].includes(url.protocol) ? url.href : undefined } catch { return undefined }
}
export function googleLocalId(userId: string, calendarId: string, eventId: string): string {
  return `gcal_${createHash("sha256").update(JSON.stringify([userId, calendarId, eventId])).digest("hex")}`
}
export function googleCreationId(userId: string, requestId: string): string {
  return createHash("sha256").update(JSON.stringify(["crm-google-event", userId, requestId])).digest("hex")
}
export function normalizeGoogleEvent(raw: GoogleEvent, calendar: GoogleCalendar, userId: string): CalendarEvent | null {
  if (!raw || typeof raw.id !== "string" || !raw.id || raw.status === "cancelled") return null
  const allDay = Boolean(raw.start?.date && !raw.start.dateTime)
  const start = allDay ? `${raw.start!.date}T00:00:00` : raw.start?.dateTime
  const end = allDay ? raw.end?.date ? `${raw.end.date}T00:00:00` : undefined : raw.end?.dateTime
  if (!start || !end || !Number.isFinite(Date.parse(start)) || !Number.isFinite(Date.parse(end)) || Date.parse(end) <= Date.parse(start)) return null
  const metadata = raw.extendedProperties?.private || {}
  const types: EventType[] = ["call", "reuniao", "followup", "entrega", "cobranca"]
  const type = types.includes(metadata.crmType as EventType) ? metadata.crmType as EventType : "reuniao"
  const readOnly = allDay || !writableCalendar(calendar) || (calendar.accessRole === "writerWithoutPrivateAccess" && raw.visibility === "private") || Boolean(raw.eventType && raw.eventType !== "default")
  const reminder = raw.reminders?.overrides?.find(item => item.method === "popup")?.minutes
  return {
    id: googleLocalId(userId, calendar.id, raw.id), title: raw.summary || "Compromisso sem título", type, start, end, ownerId: userId, allDay,
    description: raw.description,
    meetingUrl: safeHttp(raw.hangoutLink || raw.conferenceData?.entryPoints?.find(p => p.entryPointType === "video")?.uri || raw.location),
    reminderMinutes: typeof reminder === "number" ? reminder : undefined,
    leadId: metadata.crmLeadId || undefined, dealId: metadata.crmDealId || undefined, clientId: metadata.crmClientId || undefined,
    google: { eventId: raw.id, calendarId: calendar.id, etag: raw.etag, htmlLink: safeHttp(raw.htmlLink), readOnly, recurring: Boolean(raw.recurringEventId), usesDefaultReminders: Boolean(raw.reminders?.useDefault) },
  }
}
export function eventPayload(input: { title: string; type: EventType; start: string; end: string; description?: string; meetingUrl?: string; reminderMinutes?: number; leadId?: string; dealId?: string; clientId?: string }) {
  return {
    summary: input.title, description: input.description || "",
    start: { dateTime: new Date(input.start).toISOString() }, end: { dateTime: new Date(input.end).toISOString() },
    ...(input.meetingUrl ? { location: input.meetingUrl } : {}),
    reminders: { useDefault: false, overrides: input.reminderMinutes ? [{ method: "popup", minutes: input.reminderMinutes }] : [] },
    extendedProperties: { private: { crmType: input.type, crmLeadId: input.leadId || "", crmDealId: input.dealId || "", crmClientId: input.clientId || "" } },
  }
}
