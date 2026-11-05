"use server"

import { DEVELOPMENT_USER_ID } from "./development"
import { createHash, randomInt, timingSafeEqual } from "node:crypto"
import { redirect } from "next/navigation"
import { eq, sql, ne } from "drizzle-orm"
import { z } from "zod"
import { db, users, authChallenges } from "@/lib/db"
import { hashPassword, verifyDummyPassword, verifyPassword } from "@/lib/auth/password"
import { generateTotpSecret, totpQrDataUrl, verifyTotp } from "@/lib/auth/totp"
import { sendLoginCodeEmail } from "@/lib/auth/email"
import {
  clearChallenge,
  createChallenge,
  createSession,
  destroyOtherSessions,
  destroySession,
  getCurrentUser,
  readChallenge,
} from "@/lib/auth/session"

export type ActionState = { ok?: boolean; error?: string; message?: string }

const MAX_FAILED_LOGINS = 5
const LOCK_MS = 15 * 60 * 1000
const MAX_CODE_ATTEMPTS = 5
const EMAIL_CODE_TTL_MS = 10 * 60 * 1000
const EMAIL_RESEND_MS = 60 * 1000
const INVALID_CREDENTIALS = "E-mail ou senha inválidos"

// ---------------------------------------------------------------------------
// Schemas
// ---------------------------------------------------------------------------

const emailField = z
  .string({ error: "E-mail é obrigatório" })
  .trim()
  .toLowerCase()
  .min(1, "E-mail é obrigatório")
  .pipe(z.email("E-mail inválido"))

const newPasswordField = z
  .string({ error: "Senha é obrigatória" })
  .min(8, "A senha deve ter pelo menos 8 caracteres")
  .max(200, "A senha deve ter no máximo 200 caracteres")

const codeField = z
  .string({ error: "Código é obrigatório" })
  .transform((v) => v.replace(/\s/g, ""))
  .pipe(z.string().regex(/^\d{6}$/, "Informe o código de 6 dígitos"))

const loginSchema = z.object({
  email: emailField,
  password: z.string({ error: "Senha é obrigatória" }).min(1, "Senha é obrigatória"),
})

const verifySchema = z.object({
  method: z.enum(["totp", "email"], { error: "Escolha o método de verificação" }),
  code: codeField,
})

const firstUserSchema = z
  .object({
    name: z.string({ error: "Nome é obrigatório" }).trim().min(2, "Informe seu nome"),
    email: emailField,
    password: newPasswordField,
    confirmPassword: z.string({ error: "Confirme a senha" }),
  })
  .refine((d) => d.password === d.confirmPassword, { message: "As senhas não conferem", path: ["confirmPassword"] })

const changePasswordSchema = z
  .object({
    currentPassword: z.string({ error: "Informe a senha atual" }).min(1, "Informe a senha atual"),
    newPassword: newPasswordField,
    confirmPassword: z.string({ error: "Confirme a nova senha" }),
  })
  .refine((d) => d.newPassword === d.confirmPassword, { message: "As senhas não conferem", path: ["confirmPassword"] })

const disableTotpSchema = z.object({
  password: z.string({ error: "Informe sua senha" }).min(1, "Informe sua senha"),
  code: codeField,
})

function formObject(formData: FormData, keys: string[]) {
  const out: Record<string, unknown> = {}
  for (const k of keys) {
    const v = formData.get(k)
    if (typeof v === "string") out[k] = v
  }
  return out
}

function firstError(error: z.ZodError): string {
  return error.issues[0]?.message ?? "Dados inválidos"
}

// ---------------------------------------------------------------------------
// Utilitários
// ---------------------------------------------------------------------------

function maskEmail(email: string): string {
  const [local, domain] = email.split("@")
  if (!domain) return email
  return `${local.slice(0, 1)}***@${domain}`
}

function hashEmailCode(challengeId: string, code: string): string {
  return createHash("sha256").update(`${challengeId}:${code}`).digest("hex")
}

function safeEqualHex(a: string | null | undefined, b: string): boolean {
  if (!a) return false
  const ba = Buffer.from(a, "hex")
  const bb = Buffer.from(b, "hex")
  return ba.length === bb.length && ba.length > 0 && timingSafeEqual(ba, bb)
}

function generateEmailCode(): string {
  return randomInt(0, 1_000_000).toString().padStart(6, "0")
}

/** Gera, guarda (em hash) e envia um novo código por e-mail para o desafio. */
async function issueEmailCode(
  challengeId: string,
  user: { email: string; name: string },
): Promise<{ ok: true } | { ok: false; error: string }> {
  const code = generateEmailCode()
  const now = new Date()
  await db
    .update(authChallenges)
    .set({
      emailCodeHash: hashEmailCode(challengeId, code),
      emailCodeExpiresAt: new Date(now.getTime() + EMAIL_CODE_TTL_MS),
      emailSentAt: now,
    })
    .where(eq(authChallenges.id, challengeId))
  const sent = await sendLoginCodeEmail(user.email, code, user.name)
  if (!sent.ok) {
    await db
      .update(authChallenges)
      .set({ emailCodeHash: null, emailCodeExpiresAt: null, emailSentAt: null })
      .where(eq(authChallenges.id, challengeId))
  }
  return sent
}

// ---------------------------------------------------------------------------
// Login + 2FA
// ---------------------------------------------------------------------------

export async function loginAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = loginSchema.safeParse(formObject(formData, ["email", "password"]))
  if (!parsed.success) return { error: firstError(parsed.error) }
  const { email, password } = parsed.data

  const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1)
  if (!user) {
    await verifyDummyPassword(password)
    return { error: INVALID_CREDENTIALS }
  }

  if (user.lockedUntil && new Date(user.lockedUntil).getTime() > Date.now()) {
    return { error: "Muitas tentativas incorretas. Tente novamente em alguns minutos." }
  }

  const valid = await verifyPassword(password, user.passwordHash)
  if (!valid) {
    const failed = (user.failedLoginCount ?? 0) + 1
    const lock = failed >= MAX_FAILED_LOGINS
    await db
      .update(users)
      .set({
        failedLoginCount: lock ? 0 : failed,
        lockedUntil: lock ? new Date(Date.now() + LOCK_MS) : null,
        updatedAt: new Date(),
      })
      .where(eq(users.id, user.id))
    if (lock) return { error: "Muitas tentativas incorretas. Acesso bloqueado por 15 minutos." }
    return { error: INVALID_CREDENTIALS }
  }

  if (user.failedLoginCount || user.lockedUntil) {
    await db.update(users).set({ failedLoginCount: 0, lockedUntil: null, updatedAt: new Date() }).where(eq(users.id, user.id))
  }

  const challengeId = await createChallenge(user.id)
  if (!(user.totpEnabled && user.totpSecret)) {
    const sent = await issueEmailCode(challengeId, user)
    if (!sent.ok) return { error: sent.error }
  }

  redirect("/login/verificar")
}

export async function getPendingChallenge(): Promise<{ maskedEmail: string; hasTotp: boolean; emailSent: boolean } | null> {
  const row = await readChallenge()
  if (!row) return null
  const { challenge, user } = row
  const emailSent = Boolean(
    challenge.emailCodeHash &&
      challenge.emailCodeExpiresAt &&
      new Date(challenge.emailCodeExpiresAt).getTime() > Date.now(),
  )
  return {
    maskedEmail: maskEmail(user.email),
    hasTotp: Boolean(user.totpEnabled && user.totpSecret),
    emailSent,
  }
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function sendEmailCodeAction(_prev: ActionState, _formData: FormData): Promise<ActionState> {
  const row = await readChallenge()
  if (!row) return { error: "Sua verificação expirou. Faça login novamente." }
  const { challenge, user } = row

  if (challenge.emailSentAt) {
    const elapsed = Date.now() - new Date(challenge.emailSentAt).getTime()
    if (elapsed < EMAIL_RESEND_MS) {
      const wait = Math.ceil((EMAIL_RESEND_MS - elapsed) / 1000)
      return { error: `Aguarde ${wait} segundos para pedir um novo código.` }
    }
  }

  const sent = await issueEmailCode(challenge.id, user)
  if (!sent.ok) return { error: sent.error }
  return { ok: true, message: `Código enviado para ${maskEmail(user.email)}` }
}

export async function verifyTwoFactorAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const row = await readChallenge()
  if (!row) return { error: "Sua verificação expirou. Faça login novamente." }
  const { challenge, user } = row

  const parsed = verifySchema.safeParse(formObject(formData, ["method", "code"]))
  if (!parsed.success) return { error: firstError(parsed.error) }
  const { method, code } = parsed.data

  if ((challenge.attempts ?? 0) >= MAX_CODE_ATTEMPTS) {
    await clearChallenge(challenge.id)
    return { error: "Muitas tentativas. Faça login novamente." }
  }

  let valid = false
  if (method === "totp") {
    if (!(user.totpEnabled && user.totpSecret)) return { error: "O aplicativo autenticador não está ativado para esta conta." }
    valid = verifyTotp(user.totpSecret, code)
  } else {
    if (!challenge.emailCodeHash || !challenge.emailCodeExpiresAt) return { error: "Peça o envio do código por e-mail." }
    if (new Date(challenge.emailCodeExpiresAt).getTime() <= Date.now()) {
      return { error: "O código expirou. Peça um novo código." }
    }
    valid = safeEqualHex(challenge.emailCodeHash, hashEmailCode(challenge.id, code))
  }

  if (!valid) {
    const [updated] = await db
      .update(authChallenges)
      .set({ attempts: sql`${authChallenges.attempts} + 1` })
      .where(eq(authChallenges.id, challenge.id))
      .returning({ attempts: authChallenges.attempts })
    const attempts = updated?.attempts ?? MAX_CODE_ATTEMPTS
    if (attempts >= MAX_CODE_ATTEMPTS) {
      await clearChallenge(challenge.id)
      return { error: "Muitas tentativas. Faça login novamente." }
    }
    const left = MAX_CODE_ATTEMPTS - attempts
    return { error: `Código inválido. Você ainda tem ${left} ${left === 1 ? "tentativa" : "tentativas"}.` }
  }

  await clearChallenge(challenge.id)
  await createSession(user.id)
  redirect("/dashboard")
}

// ---------------------------------------------------------------------------
// Primeiro acesso
// ---------------------------------------------------------------------------

export async function hasAnyUser(): Promise<boolean> {
  const rows = await db.select({ id: users.id }).from(users).where(ne(users.id, DEVELOPMENT_USER_ID)).limit(1)
  return rows.length > 0
}

export async function createFirstUserAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  if (await hasAnyUser()) return { error: "O primeiro acesso já foi configurado. Entre com seu e-mail e senha." }

  const parsed = firstUserSchema.safeParse(formObject(formData, ["name", "email", "password", "confirmPassword"]))
  if (!parsed.success) return { error: firstError(parsed.error) }
  const { name, email, password } = parsed.data

  try {
    await db.insert(users).values({
      name,
      email,
      passwordHash: await hashPassword(password),
      role: "admin",
      totpEnabled: false,
      failedLoginCount: 0,
    })
  } catch (err) {
    console.error("[auth] Falha ao criar primeiro usuário", err)
    return { error: "Não foi possível criar o usuário. Tente novamente." }
  }

  redirect("/login?conta=criada")
}

// ---------------------------------------------------------------------------
// Sessão
// ---------------------------------------------------------------------------

export async function logoutAction(): Promise<void> {
  await destroySession()
  redirect("/login")
}

// ---------------------------------------------------------------------------
// Configuração de TOTP e senha (exigem sessão)
// ---------------------------------------------------------------------------

export async function startTotpSetupAction(): Promise<{ secret: string; qrDataUrl: string; error?: string }> {
  const current = await getCurrentUser()
  if (!current) return { secret: "", qrDataUrl: "", error: "Sua sessão expirou. Entre novamente." }
  if (current.totpEnabled) {
    return { secret: "", qrDataUrl: "", error: "O aplicativo autenticador já está ativo. Desative-o antes de configurar de novo." }
  }
  const secret = generateTotpSecret()
  await db.update(users).set({ totpSecret: secret, totpEnabled: false, updatedAt: new Date() }).where(eq(users.id, current.id))
  const qrDataUrl = await totpQrDataUrl(current.email, secret)
  return { secret, qrDataUrl }
}

export async function confirmTotpSetupAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const current = await getCurrentUser()
  if (!current) return { error: "Sua sessão expirou. Entre novamente." }
  const parsed = codeField.safeParse(formData.get("code") ?? "")
  if (!parsed.success) return { error: firstError(parsed.error) }

  const [user] = await db.select().from(users).where(eq(users.id, current.id)).limit(1)
  if (!user?.totpSecret) return { error: "Gere o QR code antes de confirmar." }
  if (user.totpEnabled) return { ok: true, message: "O aplicativo autenticador já está ativo." }
  if (!verifyTotp(user.totpSecret, parsed.data)) return { error: "Código inválido. Confira o horário do celular e tente de novo." }

  await db.update(users).set({ totpEnabled: true, updatedAt: new Date() }).where(eq(users.id, user.id))
  return { ok: true, message: "Aplicativo autenticador ativado." }
}

export async function disableTotpAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const current = await getCurrentUser()
  if (!current) return { error: "Sua sessão expirou. Entre novamente." }
  const parsed = disableTotpSchema.safeParse(formObject(formData, ["password", "code"]))
  if (!parsed.success) return { error: firstError(parsed.error) }

  const [user] = await db.select().from(users).where(eq(users.id, current.id)).limit(1)
  if (!user) return { error: "Usuário não encontrado." }
  if (!user.totpEnabled) return { ok: true, message: "O aplicativo autenticador já está desativado." }
  const passwordOk = await verifyPassword(parsed.data.password, user.passwordHash)
  const codeOk = verifyTotp(user.totpSecret, parsed.data.code)
  if (!passwordOk || !codeOk) return { error: "Senha ou código inválidos." }

  await db.update(users).set({ totpEnabled: false, totpSecret: null, updatedAt: new Date() }).where(eq(users.id, user.id))
  return { ok: true, message: "Aplicativo autenticador desativado. Os próximos logins usarão o código por e-mail." }
}

export async function changePasswordAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const current = await getCurrentUser()
  if (!current) return { error: "Sua sessão expirou. Entre novamente." }
  const parsed = changePasswordSchema.safeParse(formObject(formData, ["currentPassword", "newPassword", "confirmPassword"]))
  if (!parsed.success) return { error: firstError(parsed.error) }

  const [user] = await db.select().from(users).where(eq(users.id, current.id)).limit(1)
  if (!user) return { error: "Usuário não encontrado." }
  if (!(await verifyPassword(parsed.data.currentPassword, user.passwordHash))) return { error: "Senha atual incorreta." }

  await db
    .update(users)
    .set({ passwordHash: await hashPassword(parsed.data.newPassword), updatedAt: new Date() })
    .where(eq(users.id, user.id))
  await destroyOtherSessions(user.id)
  return { ok: true, message: "Senha alterada. As outras sessões foram encerradas." }
}
