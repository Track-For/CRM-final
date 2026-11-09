"use server"

import { randomUUID } from "node:crypto"
import { sql } from "drizzle-orm"
import { z } from "zod"
import { db, crmRecords, users } from "@/lib/db"
import { requireUser } from "@/lib/auth/session"
import { assertResourceAccess, canUseResource } from "@/lib/data/resource-policy"
import { pipelines as defaults } from "@/lib/mock/static"
import { automationSchema, goalSchema, identifier, reportSchema, type CommercialResource, type StoredRow } from "./model"
import { loadReceiptData } from "@/lib/finance/receipt-data"
import { localDay } from "./metrics"
import { projectPaymentsByDeal } from "@/lib/finance/receipts"
import type { Deal, Lead, Pipeline } from "@/types"

const resources = z.enum(["salesGoals", "savedReports", "automationRules"])
export async function getCommercialData() {
  const user = await requireUser()
  assertResourceAccess(user.role, "salesGoals", "read")
  const allowed = ["leads", "deals", "tasks", "pipelines", "salesGoals", "savedReports", "automationRules", "automationRuns", "automationEvents"].filter(r => canUseResource(user.role, r, "read"))
  const stored = await db.select({ resource: crmRecords.resource, id: crmRecords.id, data: crmRecords.data, deleted: crmRecords.deleted }).from(crmRecords).where(sql`${crmRecords.resource} in ${allowed}`)
  const rows = stored.filter(r => !r.deleted)
  const paid = await loadReceiptData()
  const grouped = new Map<string, { month: string; ownerId: string; pipelineId: string; total: number; monthly: number; count: number }>()
  for (const receipt of paid.receipts) {
    const month = localDay(receipt.paidAt).slice(0, 7)
    const key = JSON.stringify([month, receipt.ownerId, receipt.pipelineId])
    const group = grouped.get(key) || { month, ownerId: receipt.ownerId, pipelineId: receipt.pipelineId, total: 0, monthly: 0, count: 0 }
    group.total = (Math.round(group.total * 100) + Math.round(receipt.amount * 100)) / 100
    if (receipt.monthly) group.monthly = (Math.round(group.monthly * 100) + Math.round(receipt.amount * 100)) / 100
    group.count++
    grouped.set(key, group)
  }
  const people = await db.select({ id: users.id, name: users.name, role: users.role, active: users.active }).from(users)
  const pipelines = defaults.filter(p => !stored.some(r => r.resource === "pipelines" && r.id === p.id)).concat(rows.filter(r => r.resource === "pipelines").map(r => ({ ...r.data, id: r.id }) as unknown as Pipeline))
  return { rows: rows.map(r => ({ ...r, data: { ...r.data, id: r.id } })) as StoredRow[], users: people, pipelines, receipts: paid.receipts, receiptGroups: [...grouped.values()], projectPaidByDeal: projectPaymentsByDeal(paid.receipts), contractReceivables: paid.contractReceivables, undatedPayments: paid.undated, canManageAutomations: user.role === "admin", canEditGoals: canUseResource(user.role, "salesGoals", "write") }
}

export async function saveCommercialRecord(resource: CommercialResource, id: string | null, input: unknown) {
  const user = await requireUser()
  resources.parse(resource)
  assertResourceAccess(user.role, resource, "write")
  const value = resource === "salesGoals" ? goalSchema.parse(input) : resource === "savedReports" ? reportSchema.parse(input) : automationSchema.parse(input)
  if (resource === "savedReports") assertResourceAccess(user.role, (value as z.infer<typeof reportSchema>).resource, "read")
  const owner = "userId" in value ? value.userId : value.ownerId
  if (owner) {
    const [person] = await db.select({ role: users.role }).from(users).where(sql`${users.id}=${owner} and ${users.active}=true`).limit(1)
    if (!person || (resource === "automationRules" && (value as z.infer<typeof automationSchema>).action === "assign_owner" && !["admin", "comercial"].includes(person.role))) throw Error("Responsável inválido ou sem acesso comercial.")
  }
  if ("pipelineId" in value && value.pipelineId) {
    const data = await getCommercialData()
    if (!data.pipelines.some(p => p.id === value.pipelineId)) throw Error("Funil não encontrado.")
  }
  const key = id ? identifier.parse(id) : randomUUID()
  if (id) {
    const changed = await db.update(crmRecords).set({ data: { ...value, id: key }, updatedBy: user.id, updatedAt: new Date() }).where(sql`${crmRecords.resource}=${resource} and ${crmRecords.id}=${key} and ${crmRecords.deleted}=false`).returning({ id: crmRecords.id })
    if (!changed.length) throw Error("Registro não encontrado.")
  } else await db.insert(crmRecords).values({ resource, id: key, data: { ...value, id: key }, created: true, updatedBy: user.id })
  return { id: key }
}

export async function removeCommercialRecord(resource: CommercialResource, id: string) {
  const user = await requireUser()
  resources.parse(resource); identifier.parse(id)
  assertResourceAccess(user.role, resource, "write")
  await db.update(crmRecords).set({ deleted: true, updatedBy: user.id, updatedAt: new Date() }).where(sql`${crmRecords.resource}=${resource} and ${crmRecords.id}=${id}`)
}

export async function retryAutomation(id: string) {
  const user = await requireUser()
  if (user.role !== "admin") throw Error("Sem permissão.")
  identifier.parse(id)
  await db.update(crmRecords).set({ data: sql`${crmRecords.data} || '{"state":"pending","attempts":0}'::jsonb`, updatedAt: new Date() }).where(sql`${crmRecords.resource}='automationEvents' and ${crmRecords.id}=${id} and ${crmRecords.data}->>'state'='failed'`)
}

export type CommercialData = Awaited<ReturnType<typeof getCommercialData>>
export type { Deal, Lead }
