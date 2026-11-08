"use server"

import { randomBytes, createHash } from "node:crypto"
import { headers } from "next/headers"
import { sql, eq } from "drizzle-orm"
import { z } from "zod"
import { db, users, crmRecords } from "@/lib/db"
import { hashPassword } from "./password"
import { sendPasswordRecoveryEmail } from "./email"
import type { ActionState } from "./actions"

const digest = (value: string) => createHash("sha256").update(value).digest("hex")
const notice = "Se houver uma conta ativa com esse e-mail, você receberá um link de recuperação válido por 30 minutos."

export async function requestPasswordRecovery(_previous: ActionState, form: FormData): Promise<ActionState> {
  const email = z.string().trim().toLowerCase().max(254).email().safeParse(form.get("email"))
  if (!email.success) return { error: "Informe um e-mail válido." }
  let origin: URL
  try {
    origin = new URL(process.env.CRM_PUBLIC_URL || process.env.NEXT_PUBLIC_APP_URL || (process.env.NODE_ENV === "development" ? "http://localhost:3000" : ""))
    if (origin.protocol !== "https:" && !(process.env.NODE_ENV === "development" && origin.protocol === "http:")) throw Error()
  } catch { return { error: "A recuperação de acesso ainda não está configurada. Fale com o administrador." } }
  if (!process.env.SMTP_HOST || !process.env.EMAIL_FROM) return { error: "O envio de e-mail ainda não está configurado. Fale com o administrador." }
  try {
    const h = await headers()
    const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "unknown"
    for (const [key, max] of [[`ip:${ip}:${Math.floor(Date.now() / 900000)}`, 5], [`email:${email.data}:${Math.floor(Date.now() / 60000)}`, 1]] as const) {
      const allowed = await db.execute(sql`insert into crm_records(resource,id,data,created) values('passwordRecoveryRate',${digest(key)},'{"count":1}',true)
        on conflict(resource,id) do update set data=jsonb_build_object('count',(crm_records.data->>'count')::int+1),updated_at=now()
        where (crm_records.data->>'count')::int < ${max} returning id`)
      if (!(allowed as unknown[]).length) return { ok: true, message: notice }
    }
    const [user] = await db.select().from(users).where(eq(users.email, email.data)).limit(1)
    if (!user?.active || !user.passwordHash.startsWith("scrypt$")) return { ok: true, message: notice }
    const token = randomBytes(32).toString("base64url")
    const tokenHash = digest(token)
    const data = { tokenHash, userId: user.id, passwordVersion: user.passwordHash, expiresAt: new Date(Date.now() + 1800000).toISOString() }
    await db.insert(crmRecords).values({ resource: "passwordRecovery", id: user.id, data, created: true }).onConflictDoUpdate({ target: [crmRecords.resource, crmRecords.id], set: { data, updatedAt: new Date() } })
    const link = new URL("/recuperar-acesso", origin.origin)
    link.searchParams.set("token", token)
    const sent = await sendPasswordRecoveryEmail(user.email, link.href)
    if (!sent.ok) {
      await db.execute(sql`delete from crm_records where resource='passwordRecovery' and id=${user.id} and data->>'tokenHash'=${tokenHash}`)
      console.error("[auth] Não foi possível enviar recuperação de acesso.")
    }
    return { ok: true, message: notice }
  } catch { return { error: "Não foi possível solicitar a recuperação agora. Tente novamente em instantes." } }
}

export async function resetPassword(_previous: ActionState, form: FormData): Promise<ActionState> {
  const parsed = z.object({ token: z.string().regex(/^[\w-]{43}$/), password: z.string().min(8, "Use pelo menos 8 caracteres.").max(200), confirmPassword: z.string() })
    .refine(value => value.password === value.confirmPassword, "As senhas não conferem.").safeParse(Object.fromEntries(form))
  if (!parsed.success) return { error: parsed.error.issues[0]?.message || "Dados inválidos." }
  try {
    const h = await headers()
    const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "unknown"
    const rate = await db.execute(sql`insert into crm_records(resource,id,data,created) values('passwordRecoveryRate',${digest(`reset:${ip}:${Math.floor(Date.now() / 900000)}`)},'{"count":1}',true)
      on conflict(resource,id) do update set data=jsonb_build_object('count',(crm_records.data->>'count')::int+1),updated_at=now()
      where (crm_records.data->>'count')::int<20 returning id`)
    if (!(rate as unknown[]).length) return { error: "Muitas tentativas. Aguarde 15 minutos e tente novamente." }
    const passwordHash = await hashPassword(parsed.data.password)
    const result = await db.execute(sql`with consumed as (
      delete from crm_records where resource='passwordRecovery' and data->>'tokenHash'=${digest(parsed.data.token)}
        and (data->>'expiresAt')::timestamptz > now() returning data
    ), changed as (
      update users set password_hash=${passwordHash},failed_login_count=0,locked_until=null,updated_at=now()
      from consumed where users.id=consumed.data->>'userId' and users.active=true
        and users.password_hash=consumed.data->>'passwordVersion' returning users.id
    ), revoked as (delete from sessions where user_id in (select id from changed)),
    challenges as (delete from auth_challenges where user_id in (select id from changed))
    select id from changed`)
    if (!(result as unknown[]).length) return { error: "Link inválido, expirado ou já utilizado. Solicite uma nova recuperação." }
    return { ok: true, message: "Senha alterada. Entre novamente com a nova senha e seu segundo fator." }
  } catch { return { error: "Não foi possível alterar sua senha agora. Tente novamente." } }
}
