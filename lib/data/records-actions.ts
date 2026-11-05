"use server"

import { sql } from "drizzle-orm"
import { z } from "zod"
import { crmRecords, db } from "@/lib/db"
import { getCurrentUser } from "@/lib/auth/session"

/**
 * Persistência das coleções que ainda nascem do mock: a tela grava aqui o que
 * criou, editou ou excluiu, e a carga inicial aplica isso por cima do mock.
 */

export type RecordOverlay = { resource: string; id: string; data: Record<string, unknown>; created: boolean; deleted: boolean }

const keySchema = z.object({ resource: z.string().min(1).max(40), id: z.string().min(1).max(120) })
const dataSchema = z.record(z.string(), z.unknown())

export async function loadRecordOverlay(): Promise<RecordOverlay[]> {
  if (!(await getCurrentUser())) return []
  const rows = await db
    .select({ resource: crmRecords.resource, id: crmRecords.id, data: crmRecords.data, created: crmRecords.created, deleted: crmRecords.deleted })
    .from(crmRecords)
  return rows
}

/** Cria o registro inteiro (`created`) ou acumula um patch sobre o que já foi salvo. */
export async function saveRecord(resource: string, id: string, data: Record<string, unknown>, created = false): Promise<void> {
  const user = await getCurrentUser()
  if (!user) return
  const key = keySchema.parse({ resource, id })
  const value = dataSchema.parse(data)
  await db
    .insert(crmRecords)
    .values({ ...key, data: value, created, updatedBy: user.id })
    .onConflictDoUpdate({
      target: [crmRecords.resource, crmRecords.id],
      set: {
        data: sql`${crmRecords.data} || excluded.data`,
        created: sql`${crmRecords.created} or excluded.created`,
        deleted: false,
        updatedBy: user.id,
        updatedAt: new Date(),
      },
    })
}

export async function deleteRecord(resource: string, id: string): Promise<void> {
  const user = await getCurrentUser()
  if (!user) return
  const key = keySchema.parse({ resource, id })
  await db
    .insert(crmRecords)
    .values({ ...key, deleted: true, updatedBy: user.id })
    .onConflictDoUpdate({ target: [crmRecords.resource, crmRecords.id], set: { deleted: true, updatedBy: user.id, updatedAt: new Date() } })
}
