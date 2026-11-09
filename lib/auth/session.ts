import { createHash, randomBytes } from "node:crypto"
import { currentWorkspace } from "@/lib/saas/context"
import { cache } from "react"
import { cookies, headers } from "next/headers"
import { redirect } from "next/navigation"
import { and, eq, ne } from "drizzle-orm"
import { DEVELOPMENT_USER_ID, isLoginPaused } from "./development"
import { db, sessions, users, authChallenges } from "@/lib/db"

export const SESSION_COOKIE = "crm_session"
export const CHALLENGE_COOKIE = "crm_2fa"
/** Sessão vale 24 horas a partir do login; depois disso pede senha e 2FA de novo. */
export const SESSION_TTL_MS = 24 * 60 * 60 * 1000
export const CHALLENGE_TTL_MS = 10 * 60 * 1000

export type Role = "admin" | "comercial" | "operacao" | "financeiro"
export type CurrentUser = { id: string; name: string; email: string; role: Role; totpEnabled: boolean }

export function newToken(): string {
  return randomBytes(32).toString("base64url")
}

export function sha256Hex(value: string): string {
  return createHash("sha256").update(value).digest("hex")
}

function cookieBase() {
  return { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax" as const, path: "/" }
}

async function requestMeta() {
  const h = await headers()
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || null
  const userAgent = h.get("user-agent")?.slice(0, 500) || null
  return { ip, userAgent }
}

/** Cria a sessão no banco (só o sha256 do token) e grava o cookie httpOnly. */
export async function createSession(userId: string): Promise<void> {
  const token = newToken()
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS)
  const { ip, userAgent } = await requestMeta()
  await db.insert(sessions).values({ id: sha256Hex(token), userId, expiresAt, userAgent, ip })
  const store = await cookies()
  store.set(SESSION_COOKIE, token, { ...cookieBase(), expires: expiresAt })
}

/** Id (hash) da sessão do cookie atual, sem consultar o banco. */
export async function getCurrentSessionId(): Promise<string | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value
  return token ? sha256Hex(token) : null
}

/** Usuário logado (cacheado por requisição). Apaga a sessão se estiver expirada. */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  if (isLoginPaused() && !await currentWorkspace()) {
    const user: CurrentUser = { id: DEVELOPMENT_USER_ID, name: "Administrador local", email: "desenvolvimento@localhost.invalid", role: "admin", totpEnabled: false }
    // Persiste a identidade para manter válidas as referências de autoria do CRM.
    await db.insert(users).values({ id: user.id, name: user.name, email: user.email, role: user.role, passwordHash: "login-local-desativado" }).onConflictDoNothing()
    return user
  }
  const sessionId = await getCurrentSessionId()
  if (!sessionId) return null

  const rows = await db
    .select({
      expiresAt: sessions.expiresAt,
      active: users.active,
      id: users.id,
      name: users.name,
      email: users.email,
      role: users.role,
      totpEnabled: users.totpEnabled,
    })
    .from(sessions)
    .innerJoin(users, eq(sessions.userId, users.id))
    .where(eq(sessions.id, sessionId))
    .limit(1)

  const row = rows[0]
  if (!row || !row.active) return null
  if (new Date(row.expiresAt).getTime() <= Date.now()) {
    await db.delete(sessions).where(eq(sessions.id, sessionId))
    return null
  }
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    role: row.role as Role,
    totpEnabled: Boolean(row.totpEnabled),
  }
})

/** Exige sessão válida; caso contrário redireciona para /login. */
export async function requireUser(): Promise<CurrentUser> {
  const user = await getCurrentUser()
  if (!user) redirect("/login")
  return user
}

/** Apaga a sessão atual do banco e o cookie. */
export async function destroySession(): Promise<void> {
  const sessionId = await getCurrentSessionId()
  if (sessionId) await db.delete(sessions).where(eq(sessions.id, sessionId))
  ;(await cookies()).delete(SESSION_COOKIE)
}

/** Derruba todas as sessões do usuário, exceto a atual. */
export async function destroyOtherSessions(userId: string): Promise<void> {
  const current = await getCurrentSessionId()
  await db
    .delete(sessions)
    .where(current ? and(eq(sessions.userId, userId), ne(sessions.id, current)) : eq(sessions.userId, userId))
}

// ---------------------------------------------------------------------------
// Desafio de 2FA (passo intermediário do login)
// ---------------------------------------------------------------------------

/** Cria o desafio no banco e grava o cookie `crm_2fa` (10 minutos). Retorna o id do desafio. */
export async function createChallenge(userId: string): Promise<string> {
  const token = newToken()
  const id = sha256Hex(token)
  const expiresAt = new Date(Date.now() + CHALLENGE_TTL_MS)
  await db.delete(authChallenges).where(eq(authChallenges.userId, userId))
  await db.insert(authChallenges).values({ id, userId, attempts: 0, expiresAt })
  ;(await cookies()).set(CHALLENGE_COOKIE, token, { ...cookieBase(), expires: expiresAt })
  return id
}

/** Desafio pendente do cookie atual (com o usuário), ou null se ausente/expirado. */
export async function readChallenge() {
  const token = (await cookies()).get(CHALLENGE_COOKIE)?.value
  if (!token) return null
  const id = sha256Hex(token)
  const rows = await db
    .select({ challenge: authChallenges, user: users })
    .from(authChallenges)
    .innerJoin(users, eq(authChallenges.userId, users.id))
    .where(eq(authChallenges.id, id))
    .limit(1)
  const row = rows[0]
  if (!row || !row.user.active) return null
  if (new Date(row.challenge.expiresAt).getTime() <= Date.now()) {
    await db.delete(authChallenges).where(eq(authChallenges.id, id))
    return null
  }
  return row
}

/** Apaga o desafio do banco e o cookie (só funciona em Server Actions/Route Handlers). */
export async function clearChallenge(id?: string): Promise<void> {
  const store = await cookies()
  const challengeId = id ?? (store.get(CHALLENGE_COOKIE)?.value ? sha256Hex(store.get(CHALLENGE_COOKIE)!.value) : null)
  if (challengeId) await db.delete(authChallenges).where(eq(authChallenges.id, challengeId))
  store.delete(CHALLENGE_COOKIE)
}
