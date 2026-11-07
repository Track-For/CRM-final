"use server"

import { randomBytes, randomUUID } from "node:crypto"
import { and, eq, sql } from "drizzle-orm"
import { z } from "zod"
import { db, users, sessions, authChallenges, crmRecords } from "@/lib/db"
import { getCurrentUser, sha256Hex } from "@/lib/auth/session"
import { hashPassword } from "@/lib/auth/password"
import type { User } from "@/types"

function publicUser(row: typeof users.$inferSelect): User {
  return { id: row.id, name: row.name, email: row.email, role: row.role, whatsapp: row.whatsapp, active: row.active, initials: row.name.split(" ").map(p => p[0]).slice(0, 2).join(""), createdAt: row.createdAt.toISOString() }
}
export async function getCrmIdentity() {
  const current = await getCurrentUser()
  if (!current) throw new Error("Sessão expirada. Entre novamente.")
  const rows = await db.select().from(users)
  return { current, users: rows.map(publicUser) }
}
const inviteSchema = z.object({ name: z.string().trim().min(2).max(120), email: z.string().trim().toLowerCase().email(), whatsapp: z.string().max(30), role: z.enum(["admin", "comercial", "operacao", "financeiro"]) })
export async function inviteUserAction(input: z.infer<typeof inviteSchema>) {
  const actor = await getCurrentUser()
  if (actor?.role !== "admin") throw new Error("Sem permissão.")
  const value = inviteSchema.parse(input)
  const token = randomBytes(32).toString("base64url")
  const id = randomUUID()
  const invitation = { userId: id, expiresAt: new Date(Date.now() + 48 * 3600000).toISOString() }
  const result = await db.execute(sql`with invited as (
    insert into users(id,name,email,whatsapp,role,password_hash,active)
    values(${id},${value.name},${value.email},${value.whatsapp},${value.role},'convite-pendente',false)
    on conflict(email) do nothing returning id
  ) insert into crm_records(resource,id,data,created,updated_by)
    select 'userInvitations',${sha256Hex(token)},${JSON.stringify(invitation)}::jsonb,true,${actor.id}
    from invited returning id`)
  const rows = Array.isArray(result) ? result : (result as { rows?: unknown[] }).rows || []
  if (!rows.length) throw new Error("Já existe um usuário com esse e-mail.")
  const user: User = { ...value, id, active: false, initials: value.name.split(" ").map(part => part[0]).slice(0, 2).join(""), createdAt: new Date().toISOString() }
  return { user, path: `/convite/${token}` }
}
export async function updateUserAction(id: string, input: { role?: User["role"]; active?: boolean }) {
  const actor = await getCurrentUser()
  if (actor?.role !== "admin" || actor.id === id) throw new Error("Não é permitido alterar seu próprio acesso.")
  const patch = z.object({ role: z.enum(["admin", "comercial", "operacao", "financeiro"]).optional(), active: z.boolean().optional() }).strict().parse(input)
  const [row] = await db.update(users).set({ ...patch, updatedAt: new Date() }).where(and(eq(users.id, id), sql`${users.passwordHash} <> 'convite-pendente'`)).returning()
  if (!row) throw new Error("Usuário não encontrado ou convite ainda não aceito.")
  await db.delete(sessions).where(eq(sessions.userId, id))
  await db.delete(authChallenges).where(eq(authChallenges.userId, id))
  return publicUser(row)
}
export async function deleteUserAction(id: string) {
  const actor = await getCurrentUser()
  if (actor?.role !== "admin") throw new Error("Somente administradores podem excluir usuários.")
  z.string().min(1).max(120).parse(id)
  if (actor.id === id) throw new Error("Não é permitido excluir seu próprio acesso.")
  await db.transaction(async tx => {
    const [target] = await tx.select({ id: users.id }).from(users).where(eq(users.id, id)).for("update")
    if (!target) throw new Error("Usuário não encontrado. Atualize a página.")
    await tx.update(crmRecords).set({ deleted: true, updatedAt: new Date(), updatedBy: actor.id })
      .where(sql`${crmRecords.resource} = 'userInvitations' and ${crmRecords.data}->>'userId' = ${id} and ${crmRecords.deleted} = false`)
    await tx.delete(sessions).where(eq(sessions.userId, id))
    await tx.delete(authChallenges).where(eq(authChallenges.userId, id))
    // As FKs removem conexões pessoais e preservam documentos com autor nulo.
    // Registros comerciais em crm_records não são excluídos.
    await tx.delete(users).where(eq(users.id, id))
  })
  return { id }
}
export async function acceptInvitationAction(token: string, password: string) {
  z.string().regex(/^[A-Za-z0-9_-]{43}$/).parse(token)
  z.string().min(12, "Use ao menos 12 caracteres.").max(128).parse(password)
  const passwordHash = await hashPassword(password)
  // Consumo e ativação atômicos; convites expirados ou usados não podem ser reutilizados.
  const result = await db.execute(sql`with invitation as (
    update crm_records set deleted = true, updated_at = now()
    where resource = 'userInvitations' and id = ${sha256Hex(token)} and deleted = false
      and (data->>'expiresAt')::timestamptz > now() returning data->>'userId' as user_id
  ) update users set password_hash = ${passwordHash}, active = true, updated_at = now()
    where id in (select user_id from invitation) and password_hash = 'convite-pendente' returning id`)
  if (!(Array.isArray(result) ? result : (result as { rows?: unknown[] }).rows || []).length) throw new Error("Convite inválido, expirado ou já utilizado.")
  return { ok: true }
}
