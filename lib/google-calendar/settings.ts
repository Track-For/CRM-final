import { and, eq } from "drizzle-orm"
import { db, googleCalendarConnections, googleCalendarSettings } from "@/lib/db"
import { decryptSecret, encryptSecret } from "@/lib/fiscal/crypto"
import { GoogleCalendarError, googleCalendarRequest, googleTokenRequest } from "./client"
import type { GoogleCalendar } from "./types"

export async function readGoogleSettings() {
  const [row] = await db.select().from(googleCalendarSettings).where(eq(googleCalendarSettings.id, "default")).limit(1)
  return row || null
}
export async function googleCredentials() {
  const settings = await readGoogleSettings()
  if (!settings) throw new Error("A conexão do Google Agenda precisa ser preparada pela equipe responsável pelo CRM.")
  return { ...settings, clientSecret: decryptSecret(settings.clientSecretEncrypted) }
}
export async function readGoogleConnection(userId: string) {
  const [row] = await db.select().from(googleCalendarConnections).where(eq(googleCalendarConnections.userId, userId)).limit(1)
  return row || null
}
const refreshing = new Map<string, Promise<string>>()
export async function googleAccessToken(userId: string): Promise<string> {
  if (refreshing.has(userId)) return refreshing.get(userId)!
  // Reserve antes da primeira leitura: outra chamada pode ter lido um token
  // expirado enquanto a renovação anterior terminava e removia a promessa.
  const job = (async () => {
    const connection = await readGoogleConnection(userId)
    const settings = await googleCredentials()
    if (!connection || connection.clientId !== settings.clientId || connection.status !== "connected") throw new Error("Conecte sua conta Google para continuar.")
    if (connection.tokenExpiresAt.getTime() > Date.now() + 60000) return decryptSecret(connection.accessTokenEncrypted)
    try {
      const result = await googleTokenRequest<{ access_token: string; expires_in: number; refresh_token?: string }>({ client_id: settings.clientId, client_secret: settings.clientSecret, grant_type: "refresh_token", refresh_token: decryptSecret(connection.refreshTokenEncrypted) })
      if (!result.access_token || !Number.isFinite(result.expires_in) || result.expires_in <= 0) throw new Error("O Google não retornou uma autorização válida. Conecte sua conta novamente.")
      const rows = await db.update(googleCalendarConnections).set({ accessTokenEncrypted: encryptSecret(result.access_token), ...(result.refresh_token ? { refreshTokenEncrypted: encryptSecret(result.refresh_token) } : {}), tokenExpiresAt: new Date(Date.now() + result.expires_in * 1000), lastError: null, updatedAt: new Date() }).where(and(eq(googleCalendarConnections.userId, userId), eq(googleCalendarConnections.googleSubject, connection.googleSubject), eq(googleCalendarConnections.clientId, connection.clientId))).returning({ userId: googleCalendarConnections.userId })
      if (!rows.length) throw new Error("A conexão foi alterada. Conecte sua conta novamente.")
      return result.access_token
    } catch (error) {
      if (error instanceof GoogleCalendarError && (error.reason === "invalid_grant" || error.status === 401)) await db.update(googleCalendarConnections).set({ status: "reconnect_required", lastError: error.message }).where(and(eq(googleCalendarConnections.userId, userId), eq(googleCalendarConnections.googleSubject, connection.googleSubject)))
      throw error
    }
  })()
  refreshing.set(userId, job)
  try { return await job } finally { refreshing.delete(userId) }
}
export async function listGoogleCalendars(token: string): Promise<GoogleCalendar[]> {
  const calendars: GoogleCalendar[] = []
  let pageToken: string | undefined
  const seen = new Set<string>()
  for (let page = 0; page < 20; page++) {
    const result = await googleCalendarRequest<{ items?: GoogleCalendar[]; nextPageToken?: string }>("/users/me/calendarList", token, { params: { minAccessRole: "reader", maxResults: "250", ...(pageToken ? { pageToken } : {}) } })
    if (result.items && !Array.isArray(result.items)) throw new Error("O Google retornou uma lista de agendas inválida.")
    for (const item of result.items || []) if (typeof item.id === "string" && typeof item.summary === "string" && typeof item.accessRole === "string") calendars.push({ id: item.id, summary: item.summary, timeZone: item.timeZone, accessRole: item.accessRole, primary: Boolean(item.primary) })
    pageToken = result.nextPageToken
    if (!pageToken) return calendars
    if (seen.has(pageToken)) break
    seen.add(pageToken)
  }
  throw new Error("A lista de agendas é muito grande. A consulta não foi concluída.")
}

/** Marca somente a autorização que realmente falhou, sem afetar uma reconexão concorrente. */
export async function userCalendarRequest<T>(userId: string, path: string, token: string, options?: Parameters<typeof googleCalendarRequest>[2]): Promise<T> {
  try { return await googleCalendarRequest<T>(path, token, options) }
  catch (error) {
    if (error instanceof GoogleCalendarError && error.status === 401) {
      const current = await readGoogleConnection(userId)
      if (current && decryptSecret(current.accessTokenEncrypted) === token) await db.update(googleCalendarConnections).set({ status: "reconnect_required", lastError: error.message }).where(and(eq(googleCalendarConnections.userId, userId), eq(googleCalendarConnections.accessTokenEncrypted, current.accessTokenEncrypted)))
    }
    throw error
  }
}
