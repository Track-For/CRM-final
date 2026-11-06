"use server"
import { randomBytes, randomUUID } from "node:crypto"
import { sql } from "drizzle-orm"
import { db, crmRecords } from "@/lib/db"
import { getCurrentUser, sha256Hex } from "@/lib/auth/session"
import { HERMES_SCOPE, hermesPermissionsSchema, type HermesPermissions } from "./policy"
async function admin() { const user = await getCurrentUser(); if (user?.role !== "admin") throw new Error("Apenas administradores gerenciam o acesso do Hermes."); return user }
export async function getHermesAccessAction() {
  await admin()
  const rows = await db.select({ id: crmRecords.id, data: crmRecords.data }).from(crmRecords).where(sql`${crmRecords.resource}='apiKeys' and ${crmRecords.deleted}=false and ${crmRecords.data}->'scopes' ? ${HERMES_SCOPE}`)
  return rows.map(row => ({ id: row.id, name: String(row.data.name), prefix: String(row.data.prefix), createdAt: String(row.data.createdAt), lastUsedAt: row.data.lastUsedAt ? String(row.data.lastUsedAt) : null, permissions: hermesPermissionsSchema.parse(row.data.contextPermissions) }))
}
export async function createHermesAccessAction(input: HermesPermissions) {
  const user = await admin()
  const permissions = hermesPermissionsSchema.parse(input)
  const token = `sk_live_${randomBytes(32).toString("base64url")}`
  const id = randomUUID()
  const data = { id, name: "Hermes · atendimento WhatsApp", prefix: token.slice(0, 12), scopes: [HERMES_SCOPE], tokenHash: sha256Hex(token), whatsappInstance: process.env.EVOLUTION_INSTANCE || "crm-principal", contextPermissions: permissions, createdAt: new Date().toISOString() }
  await db.insert(crmRecords).values({ resource: "apiKeys", id, data, created: true, updatedBy: user.id })
  return { id, token }
}
export async function revokeHermesAccessAction(id: string) {
  const user = await admin()
  await db.update(crmRecords).set({ deleted: true, updatedBy: user.id, updatedAt: new Date() }).where(sql`${crmRecords.resource}='apiKeys' and ${crmRecords.id}=${id} and ${crmRecords.data}->'scopes' ? ${HERMES_SCOPE}`)
}
