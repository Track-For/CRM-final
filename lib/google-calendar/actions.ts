"use server"

import { and, eq, sql } from "drizzle-orm"
import { z } from "zod"
import { requireUser } from "@/lib/auth/session"
import { db, googleCalendarConnections, googleCalendarSettings, users } from "@/lib/db"
import { encryptSecret } from "@/lib/fiscal/crypto"
import { GoogleCalendarError } from "./client"
import { eventPayload, googleCreationId, normalizeGoogleEvent, validateGoogleRedirect, writableCalendar } from "./normalize"
import { googleAccessToken, listGoogleCalendars, readGoogleConnection, readGoogleSettings, userCalendarRequest } from "./settings"
import type { GoogleEvent } from "./types"
import { createHash } from "node:crypto"

async function admin() {
  const user = await requireUser()
  if (user.role !== "admin") throw new Error("Apenas administradores podem configurar o aplicativo Google.")
  return user
}
export async function getGoogleCalendarAdminSettings() {
  await admin()
  const settings = await readGoogleSettings()
  return settings ? { clientId: settings.clientId, hasSecret: Boolean(settings.clientSecretEncrypted), redirectUri: settings.redirectUri } : null
}
export async function saveGoogleCalendarSettings(input: { clientId: string; clientSecret: string; redirectUri: string }) {
  const user = await admin()
  const data = z.object({ clientId: z.string().trim().regex(/^[a-zA-Z0-9-]+\.apps\.googleusercontent\.com$/, "Informe o Client ID do aplicativo Google."), clientSecret: z.string().trim().max(500), redirectUri: z.string().url() }).parse(input)
  const existing = await readGoogleSettings()
  if (!data.clientSecret && (!existing || existing.clientId !== data.clientId)) throw new Error("Informe o Client Secret do aplicativo Google.")
  if (data.clientSecret && data.clientSecret.length < 10) throw new Error("Confira o Client Secret fornecido pelo Google.")
  const clientSecretEncrypted = data.clientSecret ? encryptSecret(data.clientSecret) : existing!.clientSecretEncrypted
  const redirectUri = validateGoogleRedirect(data.redirectUri)
  await db.insert(googleCalendarSettings).values({ id: "default", clientId: data.clientId, clientSecretEncrypted, redirectUri, updatedBy: user.id }).onConflictDoUpdate({ target: googleCalendarSettings.id, set: { clientId: data.clientId, clientSecretEncrypted, redirectUri, updatedBy: user.id, updatedAt: new Date() } })
}
export async function getGoogleCalendarState() {
  const user = await requireUser()
  const [settings, connection, owner] = await Promise.all([readGoogleSettings(), readGoogleConnection(user.id), db.select({ createdAt: users.createdAt }).from(users).where(eq(users.id, user.id)).limit(1)])
  const connected = Boolean(connection && connection.status === "connected" && connection.clientId === settings?.clientId)
  const selected = connection?.calendars.find(item => item.id === connection.selectedCalendarId) || null
  return {
    configured: Boolean(settings), connected, needsReconnect: Boolean(connection && !connected),
    email: connection?.email || null, calendars: connection?.calendars || [], selectedCalendarId: connection?.selectedCalendarId || null,
    selected, canWrite: connected && writableCalendar(selected || undefined),
    events: connection?.events || [], rangeStart: connection?.rangeStart || null, rangeEnd: connection?.rangeEnd || null,
    lastSyncedAt: connection?.lastSyncedAt?.toISOString() || null, error: connection?.lastError || null,
    owner: { id: user.id, name: user.name, email: user.email, role: user.role, whatsapp: "", active: true, initials: user.name.split(" ").filter(Boolean).slice(0, 2).map(n => n[0]).join("").toUpperCase(), createdAt: owner[0]?.createdAt.toISOString() || new Date().toISOString() },
  }
}
export async function refreshGoogleCalendars() {
  const user = await requireUser()
  const token = await googleAccessToken(user.id)
  const calendars = await listGoogleCalendars(token)
  const connection = await readGoogleConnection(user.id)
  const selected = calendars.some(c => c.id === connection?.selectedCalendarId) ? connection!.selectedCalendarId : null
  await db.update(googleCalendarConnections).set({ calendars, selectedCalendarId: selected, ...(selected ? {} : { events: [], rangeStart: null, rangeEnd: null }), updatedAt: new Date() }).where(eq(googleCalendarConnections.userId, user.id))
  return getGoogleCalendarState()
}
export async function selectGoogleCalendar(input: string) {
  const user = await requireUser()
  const id = z.string().min(1).max(1024).parse(input)
  const token = await googleAccessToken(user.id)
  const calendars = await listGoogleCalendars(token)
  if (!calendars.some(item => item.id === id)) throw new Error("Essa agenda não está disponível na sua conta Google.")
  await db.update(googleCalendarConnections).set({ selectedCalendarId: id, calendars, events: [], rangeStart: null, rangeEnd: null, lastSyncedAt: null, lastError: null, updatedAt: new Date() }).where(eq(googleCalendarConnections.userId, user.id))
  return getGoogleCalendarState()
}
const rangeSchema = z.object({ from: z.string().datetime({ offset: true }), to: z.string().datetime({ offset: true }) }).refine(value => Date.parse(value.to) > Date.parse(value.from) && Date.parse(value.to) - Date.parse(value.from) <= 100 * 86400000, "Consulte um período de até 100 dias.")
export async function syncGoogleCalendarRange(input: { from: string; to: string }) {
  const user = await requireUser()
  const range = rangeSchema.parse(input)
  const token = await googleAccessToken(user.id)
  const connection = await readGoogleConnection(user.id)
  const calendar = connection?.calendars.find(item => item.id === connection.selectedCalendarId)
  if (!calendar) throw new Error("Escolha a agenda que deseja sincronizar.")
  const events: NonNullable<ReturnType<typeof normalizeGoogleEvent>>[] = []
  const seen = new Set<string>()
  let pageToken: string | undefined
  for (let page = 0; page < 50; page++) {
    const result = await userCalendarRequest<{ items?: GoogleEvent[]; nextPageToken?: string }>(user.id, `/calendars/${encodeURIComponent(calendar.id)}/events`, token, { params: { timeMin: range.from, timeMax: range.to, singleEvents: "true", orderBy: "startTime", maxResults: "250", ...(pageToken ? { pageToken } : {}) } })
    if (result.items && !Array.isArray(result.items)) throw new Error("O Google retornou eventos inválidos. A cópia anterior foi preservada.")
    for (const raw of result.items || []) { const item = normalizeGoogleEvent(raw, calendar, user.id); if (item && !events.some(e => e.id === item.id)) events.push(item) }
    pageToken = result.nextPageToken
    if (!pageToken) break
    if (seen.has(pageToken)) throw new Error("O Google repetiu a paginação. A cópia anterior foi preservada.")
    seen.add(pageToken)
  }
  if (pageToken) throw new Error("O período contém eventos demais. Consulte um intervalo menor.")
  const rows = await db.update(googleCalendarConnections).set({ events, rangeStart: range.from, rangeEnd: range.to, lastSyncedAt: new Date(), lastError: null, updatedAt: new Date() }).where(and(eq(googleCalendarConnections.userId, user.id), eq(googleCalendarConnections.selectedCalendarId, calendar.id), eq(googleCalendarConnections.updatedAt, connection!.updatedAt))).returning({ userId: googleCalendarConnections.userId })
  if (!rows.length) {
    const latest = await readGoogleConnection(user.id)
    if (latest?.selectedCalendarId === calendar.id && latest.rangeStart === range.from && latest.rangeEnd === range.to) return getGoogleCalendarState()
    throw new Error("A agenda mudou durante a consulta. Sincronize novamente para atualizar o período.")
  }
  return getGoogleCalendarState()
}
const eventSchema = z.object({ title: z.string().trim().min(1).max(1000), type: z.enum(["call", "reuniao", "followup", "entrega", "cobranca"]), start: z.string().datetime({ offset: true }), end: z.string().datetime({ offset: true }), description: z.string().max(8000).optional(), meetingUrl: z.union([z.literal(""), z.string().url().refine(value => ["http:", "https:"].includes(new URL(value).protocol))]).optional(), reminderMinutes: z.number().int().min(0).max(40320).optional(), leadId: z.string().max(120).optional(), dealId: z.string().max(120).optional(), clientId: z.string().max(120).optional() }).refine(value => Date.parse(value.end) > Date.parse(value.start), "O fim deve ser posterior ao início do evento.")
export type GoogleEventInput = z.infer<typeof eventSchema>
async function writeContext() {
  const user = await requireUser()
  const token = await googleAccessToken(user.id)
  const connection = await readGoogleConnection(user.id)
  const calendar = connection?.calendars.find(item => item.id === connection.selectedCalendarId)
  if (!connection || !calendar || !writableCalendar(calendar)) throw new Error("Sua agenda está disponível apenas para consulta. Escolha uma agenda com permissão de edição.")
  return { user, token, connection, calendar }
}
async function cacheEvent(userId: string, calendarId: string, item: NonNullable<ReturnType<typeof normalizeGoogleEvent>>) {
  const connection = await readGoogleConnection(userId)
  if (connection?.selectedCalendarId !== calendarId) throw new Error("O evento foi salvo no Google, mas a agenda selecionada mudou. Sincronize para atualizar a tela.")
  const rows = await db.update(googleCalendarConnections).set({ events: sql`(select coalesce(jsonb_agg(entry), '[]'::jsonb) from jsonb_array_elements(${googleCalendarConnections.events}) as entry where entry->>'id' <> ${item.id}) || ${JSON.stringify([item])}::jsonb`, updatedAt: new Date() }).where(and(eq(googleCalendarConnections.userId, userId), eq(googleCalendarConnections.selectedCalendarId, calendarId))).returning({ userId: googleCalendarConnections.userId })
  if (!rows.length) throw new Error("Evento salvo no Google. A agenda selecionada mudou; sincronize para atualizar a tela.")
}
export async function createGoogleCalendarEvent(requestId: string, input: GoogleEventInput) {
  const key = z.string().min(5).max(120).parse(requestId)
  const data = eventSchema.parse(input)
  const { user, token, calendar } = await writeContext()
  const id = googleCreationId(user.id, key)
  const payload = eventPayload(data)
  const payloadHash = createHash("sha256").update(JSON.stringify(payload)).digest("hex")
  const body = { ...payload, id, extendedProperties: { private: { ...payload.extendedProperties.private, crmRequestId: key, crmPayloadHash: payloadHash } } }
  let raw: GoogleEvent
  try { raw = await userCalendarRequest<GoogleEvent>(user.id, `/calendars/${encodeURIComponent(calendar.id)}/events`, token, { method: "POST", body }) }
  catch (error) {
    if (!(error instanceof GoogleCalendarError) || error.status !== 409) throw error
    raw = await userCalendarRequest<GoogleEvent>(user.id, `/calendars/${encodeURIComponent(calendar.id)}/events/${id}`, token)
    if (raw.extendedProperties?.private?.crmPayloadHash !== payloadHash) throw new Error("Este evento já foi criado com outros dados. Sincronize a agenda antes de tentar novamente.")
  }
  const event = normalizeGoogleEvent(raw, calendar, user.id)
  if (!event) throw new Error("O Google aceitou a operação, mas a resposta não pôde ser exibida. Sincronize a agenda antes de tentar novamente.")
  await cacheEvent(user.id, calendar.id, event)
  return getGoogleCalendarState()
}
export async function updateGoogleCalendarEvent(id: string, etag: string | undefined, input: GoogleEventInput) {
  const data = eventSchema.parse(input)
  const { user, token, connection, calendar } = await writeContext()
  const current = connection.events.find(event => event.id === id)
  if (!current?.google || current.google.calendarId !== calendar.id || current.google.readOnly) throw new Error("Este evento deve ser editado diretamente no Google Agenda.")
  if (!etag || etag !== current.google.etag) throw new Error("O evento foi atualizado. Sincronize a agenda antes de salvar.")
  const path = `/calendars/${encodeURIComponent(calendar.id)}/events/${encodeURIComponent(current.google.eventId)}`
  const original = await userCalendarRequest<GoogleEvent>(user.id, path, token)
  if (original.etag !== etag) throw new GoogleCalendarError(412)
  const payload = eventPayload(data)
  // Lembretes e dados da conferência existentes continuam sob controle do Google.
  const body = { summary: payload.summary, description: payload.description, start: payload.start, end: payload.end, extendedProperties: { private: { ...original.extendedProperties?.private, ...payload.extendedProperties.private } } }
  const raw = await userCalendarRequest<GoogleEvent>(user.id, path, token, { method: "PATCH", etag, body })
  const event = normalizeGoogleEvent(raw, calendar, user.id)
  if (!event) throw new Error("Atualização aceita pelo Google. Sincronize para atualizar a tela.")
  await cacheEvent(user.id, calendar.id, event)
  return getGoogleCalendarState()
}
export async function deleteGoogleCalendarEvent(id: string, etag: string | undefined) {
  const { user, token, connection, calendar } = await writeContext()
  const current = connection.events.find(event => event.id === id)
  if (!current?.google || current.google.calendarId !== calendar.id || current.google.readOnly) throw new Error("Este evento deve ser removido diretamente no Google Agenda.")
  if (!etag || etag !== current.google.etag) throw new Error("O evento mudou. Sincronize antes de excluir.")
  await userCalendarRequest(user.id, `/calendars/${encodeURIComponent(calendar.id)}/events/${encodeURIComponent(current.google.eventId)}`, token, { method: "DELETE", etag })
  const latest = await readGoogleConnection(user.id)
  if (latest?.selectedCalendarId === calendar.id) await db.update(googleCalendarConnections).set({ events: sql`(select coalesce(jsonb_agg(entry), '[]'::jsonb) from jsonb_array_elements(${googleCalendarConnections.events}) as entry where entry->>'id' <> ${id})`, updatedAt: new Date() }).where(and(eq(googleCalendarConnections.userId, user.id), eq(googleCalendarConnections.selectedCalendarId, calendar.id)))
  return getGoogleCalendarState()
}
export async function disconnectGoogleCalendar() {
  const user = await requireUser()
  await db.delete(googleCalendarConnections).where(eq(googleCalendarConnections.userId, user.id))
  return getGoogleCalendarState()
}
