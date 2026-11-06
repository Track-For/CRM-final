"use server"

import { messageTemplateSchema } from "@/lib/messages/validation"
import { dealValuesSchema } from "@/lib/data/deal-values"
import { projectForDeal } from "@/lib/projects/plan"
import type { Project, Quote } from "@/types"
import { webhookUrl } from "@/lib/security/webhook-url"
import { WEBHOOK_EVENTS } from "@/lib/constants"
import { dispatchCrmEvent } from "@/lib/integrations/webhooks"
import { encryptSecret, decryptSecret } from "@/lib/fiscal/crypto"
import { syncAsaasReceivables } from "@/lib/boleto/import"
import { sql } from "drizzle-orm"
import { z } from "zod"
import { crmRecords, db } from "@/lib/db"
import { conversionChanges } from "@/lib/data/conversion-lifecycle"
import { projectReceivables } from "@/lib/data/project-receivables"
import { firstMonthlyReceivable, monthlyForecastChanges, nextMonthlyBilling, subscriptionForDeal } from "@/lib/data/deal-subscription"
import type { Charge, Client, Deal, FinancialEntry, Subscription } from "@/types"
import { assertResourceAccess, canUseResource } from "@/lib/data/resource-policy"
import { getCurrentUser } from "@/lib/auth/session"

/**
 * Persistência das coleções que ainda nascem do mock: a tela grava aqui o que
 * criou, editou ou excluiu, e a carga inicial aplica isso por cima do mock.
 */

export type RecordOverlay = { resource: string; id: string; data: Record<string, unknown>; created: boolean; deleted: boolean }

const keySchema = z.object({ resource: z.string().min(1).max(40), id: z.string().min(1).max(120) })
const dataSchema = z.record(z.string(), z.unknown())

export async function loadRecordOverlay(): Promise<RecordOverlay[]> {
  const user = await getCurrentUser()
  if (!user) throw new Error("Sessão expirada. Entre novamente.")
  if (user.role === "admin" || user.role === "financeiro") {
    try { await syncAsaasReceivables() }
    catch (error) { console.error("[asaas] Não foi possível sincronizar cobranças:", error instanceof Error ? error.message : "falha de conexão") }
  }
  const rows = await db
    .select({ resource: crmRecords.resource, id: crmRecords.id, data: crmRecords.data, created: crmRecords.created, deleted: crmRecords.deleted })
    .from(crmRecords)
  const projects = rows.filter(row => row.resource === "projects" && !row.deleted).map(row => row.data as unknown as Project)
  for (const row of rows.filter(row => row.resource === "deals" && !row.deleted && row.data.stage === "ganho")) {
    const deal = row.data as unknown as Deal
    if (projects.some(project => project.dealId === deal.id)) continue
    const clientRow = rows.find(item => item.resource === "clients" && !item.deleted && !item.data.deletedAt && (item.id === deal.clientId || (deal.leadId && item.data.leadId === deal.leadId)))
    if (!clientRow) continue
    const project = projectForDeal(deal, clientRow.id, rows.filter(item => item.resource === "quotes" && !item.deleted).map(item => item.data as unknown as Quote))
    const previous = rows.find(item => item.resource === "projects" && item.id === project.id)
    if (previous) continue
    const [inserted] = await db.insert(crmRecords).values({ resource: "projects", id: project.id, data: { ...project }, created: true }).onConflictDoNothing().returning({ id: crmRecords.id })
    if (inserted) { rows.push({ resource: "projects", id: project.id, data: { ...project }, created: true, deleted: false }); projects.push(project) }
  }
  const companySettings = rows.find(row => row.resource === "settings" && row.id === "company" && !row.deleted)?.data.company as { pixKey?: string } | undefined
  const pixKey = companySettings?.pixKey
  if (pixKey) {
    for (const row of rows.filter(row => !row.deleted)) {
      let patch: Record<string, unknown> | null = null
      if (row.resource === "deals") {
        const plan = row.data.paymentPlan as Deal["paymentPlan"]
        if (plan?.method === "pix" && plan.pixKey !== pixKey) patch = { paymentPlan: { ...plan, pixKey } }
      }
      if ((row.resource === "subscriptions" || (row.resource === "charges" && row.data.status !== "pago" && row.data.status !== "cancelado" && !row.data.gatewayId)) && row.data.method === "pix" && row.data.pixKey !== pixKey) patch = { pixKey }
      if (!patch) continue
      await db.update(crmRecords).set({ data: sql`${crmRecords.data} || ${JSON.stringify(patch)}::jsonb`, updatedAt: new Date() }).where(sql`${crmRecords.resource} = ${row.resource} and ${crmRecords.id} = ${row.id}`)
      row.data = { ...row.data, ...patch }
    }
  }
  const active = <T,>(resource: string) => rows.filter(row => row.resource === resource && !row.deleted).map(row => row.data as unknown as T)
  for (const change of conversionChanges(active<Deal>("deals"), active<Client>("clients"), active<Subscription>("subscriptions"), active<Charge>("charges"), active<FinancialEntry>("entries"))) {
    await db.update(crmRecords).set({ data: sql`${crmRecords.data} || ${JSON.stringify(change.data)}::jsonb`, updatedAt: new Date() }).where(sql`${crmRecords.resource} = ${change.resource} and ${crmRecords.id} = ${change.id}`)
    const row = rows.find(item => item.resource === change.resource && item.id === change.id)!
    row.data = { ...row.data, ...change.data }
  }
  // Reaproveita também os negócios ganhos antes da automação existir.
  const subscriptions = rows.filter(row => row.resource === "subscriptions" && !row.deleted).map(row => row.data as unknown as Subscription)
  for (const row of rows.filter(row => row.resource === "deals" && !row.deleted)) {
    const subscription = subscriptionForDeal(row.data as unknown as Deal, subscriptions, active<Charge>("charges"))
    if (!subscription) continue
    const previous = rows.find(item => item.resource === "subscriptions" && item.id === subscription.id)
    if (previous?.deleted) continue
    if (previous && JSON.stringify(previous.data) === JSON.stringify(subscription)) continue
    await db.insert(crmRecords).values({ resource: "subscriptions", id: subscription.id, data: { ...subscription }, created: true }).onConflictDoUpdate({ target: [crmRecords.resource, crmRecords.id], set: { data: { ...subscription }, created: true, updatedAt: new Date() } })
    if (previous) previous.data = { ...subscription }
    else rows.push({ resource: "subscriptions", id: subscription.id, data: { ...subscription }, created: true, deleted: false })
    const index = subscriptions.findIndex(item => item.id === subscription.id)
    if (index >= 0) subscriptions[index] = subscription
    else subscriptions.push(subscription)
  }
  const charges = rows.filter(row => row.resource === "charges" && !row.deleted).map(row => row.data as unknown as Charge)
  for (const dealRow of rows.filter(row => row.resource === "deals" && !row.deleted)) {
    const plan = projectReceivables(dealRow.data as unknown as Deal, charges)
    for (const charge of plan.remove) {
      for (const row of rows.filter(item => (item.resource === "charges" && item.id === charge.id) || (item.resource === "entries" && item.data.chargeId === charge.id))) {
        await db.update(crmRecords).set({ deleted: true, updatedAt: new Date() }).where(sql`${crmRecords.resource} = ${row.resource} and ${crmRecords.id} = ${row.id}`)
        row.deleted = true
      }
      const index = charges.findIndex(item => item.id === charge.id)
      if (index >= 0) charges.splice(index, 1)
    }
    for (const record of plan.records) {
      if (rows.some(row => row.resource === "charges" && row.id === record.charge.id && row.deleted)) continue
      for (const [resource, data] of [["charges", record.charge], ["entries", record.entry]] as const) {
        const previous = rows.find(row => row.resource === resource && row.id === data.id)
        if (previous?.deleted || (previous && JSON.stringify(previous.data) === JSON.stringify(data))) continue
        await db.insert(crmRecords).values({ resource, id: data.id, data: { ...data }, created: true }).onConflictDoUpdate({ target: [crmRecords.resource, crmRecords.id], set: { data: { ...data }, created: true, updatedAt: new Date() }, setWhere: sql`${crmRecords.deleted} = false and ${crmRecords.data}->>'status' = 'pendente'` })
        if (previous) previous.data = { ...data }
        else rows.push({ resource, id: data.id, data: { ...data }, created: true, deleted: false })
      }
      const index = charges.findIndex(item => item.id === record.charge.id)
      if (index >= 0) charges[index] = record.charge
      else charges.push(record.charge)
    }
  }

  for (const subscription of subscriptions.filter(item => item.dealId)) {
    const correction = monthlyForecastChanges(subscription, charges)
    if (correction) {
      for (const row of rows.filter(item => (item.resource === "charges" && item.id === correction.charge.id) || (item.resource === "entries" && item.data.chargeId === correction.charge.id && item.data.status !== "pago"))) {
        const patch = { ...correction.patch, ...(row.resource === "entries" && correction.patch.dueDate ? { competenceDate: correction.patch.dueDate } : {}) }
        if (Object.entries(patch).every(([key, value]) => row.data[key] === value)) continue
        await db.update(crmRecords).set({ data: sql`${crmRecords.data} || ${JSON.stringify(patch)}::jsonb`, updatedAt: new Date() }).where(sql`${crmRecords.resource} = ${row.resource} and ${crmRecords.id} = ${row.id}`)
        row.data = { ...row.data, ...patch }
      }
      Object.assign(correction.charge, correction.patch)
    }
    const receivable = firstMonthlyReceivable(subscription, charges)
    if (!receivable || rows.some(row => row.resource === "charges" && row.id === receivable.charge.id)) continue
    for (const [resource, record] of [["charges", receivable.charge], ["entries", receivable.entry]] as const) {
      if (rows.some(row => row.resource === resource && row.id === record.id)) continue
      await db.insert(crmRecords).values({ resource, id: record.id, data: { ...record }, created: true }).onConflictDoNothing()
      rows.push({ resource, id: record.id, data: { ...record }, created: true, deleted: false })
    }
    charges.push(receivable.charge)
  }
  for (const row of rows.filter(row => row.resource === "subscriptions" && !row.deleted)) {
    const subscription = row.data as unknown as Subscription
    const nextBillingDate = nextMonthlyBilling(subscription, charges)
    if (nextBillingDate === subscription.nextBillingDate) continue
    await db.insert(crmRecords).values({ resource: "subscriptions", id: row.id, data: { nextBillingDate } }).onConflictDoUpdate({ target: [crmRecords.resource, crmRecords.id], set: { data: sql`${crmRecords.data} || excluded.data`, updatedAt: new Date() } })
    row.data = { ...row.data, nextBillingDate }
  }
  return rows.filter(row => canUseResource(user.role, row.resource, "read")).map(row => {
    const data = { ...row.data }
    delete data.tokenHash
    if (typeof data.configEncrypted === "string") { data.config = JSON.parse(decryptSecret(data.configEncrypted)); delete data.configEncrypted }
    return { ...row, data }
  })
}

/** Cria o registro inteiro (`created`) ou acumula um patch sobre o que já foi salvo. */
export async function saveRecord(resource: string, id: string, data: Record<string, unknown>, created = false): Promise<void> {
  const user = await getCurrentUser()
  if (!user) throw new Error("Sessão expirada. Entre novamente.")
  assertResourceAccess(user.role, resource, "write")
  const key = keySchema.parse({ resource, id })
  if (resource === "projects") throw new Error("Use o acompanhamento do projeto para editar suas etapas.")
  const value: Record<string, unknown> = resource === "quickMessages" ? messageTemplateSchema.parse({ ...data, id }) : dataSchema.parse(data)
  if (resource === "deals") {
    if (value.value !== undefined) dealValuesSchema.shape.value.parse(value.value)
    if (value.monthlyFee !== undefined) dealValuesSchema.shape.monthlyFee.parse(value.monthlyFee)
  }
  if (resource === "tasks") {
    const [previous] = await db.select({ data: crmRecords.data }).from(crmRecords).where(sql`${crmRecords.resource}='tasks' and ${crmRecords.id}=${id} and ${crmRecords.deleted}=false`).limit(1)
    const task = { ...previous?.data, ...value }
    if (task.projectId || task.projectStageId) {
      if (!task.projectId || !task.projectStageId) throw new Error("Informe o projeto e a etapa da tarefa.")
      const [record] = await db.select({ data: crmRecords.data }).from(crmRecords).where(sql`${crmRecords.resource}='projects' and ${crmRecords.id}=${String(task.projectId)} and ${crmRecords.deleted}=false`).limit(1)
      const project = record?.data as unknown as Project | undefined
      const stage = project?.stages?.find(stage => stage.id === task.projectStageId)
      if (!project || !stage || task.clientId !== project.clientId) throw new Error("A tarefa deve pertencer ao mesmo cliente e a uma etapa válida do projeto.")
      if (task.status !== "done" && stage.status === "concluida") throw new Error("Reabra a etapa do projeto antes de reabrir sua tarefa.")
      if ((value.projectId !== undefined || value.projectStageId !== undefined) && !canUseResource(user.role, "projects", "write")) throw new Error("Sem permissão para vincular tarefas ao projeto.")
    }
  }
  if (resource === "apiKeys") throw new Error("Crie chaves pela ação específica de chaves de API.")
  if (resource === "integrations" && value.config) {
    value.configEncrypted = encryptSecret(JSON.stringify(value.config))
    delete value.config
  }
  if (resource === "webhooks") {
    if (value.url !== undefined) webhookUrl(z.string().max(2000).parse(value.url))
    if (value.event !== undefined && !WEBHOOK_EVENTS.some(event => event.value === value.event)) throw new Error("Evento inválido.")
    if (value.secret !== undefined) z.string().min(16).max(200).parse(value.secret)
    if (value.active !== undefined) z.boolean().parse(value.active)
  }
  if (JSON.stringify(value).length > 200_000) throw new Error("Registro excede o tamanho permitido.")
  if (value.id !== undefined && value.id !== id) throw new Error("Identificador inválido.")
  if (resource === "activities" || resource === "notes") value.authorId = user.id
  if (resource === "settings" && !["company", "pricingRules", "adSpend"].includes(id)) throw new Error("Configuração inválida.")
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
  if (resource === "deals") await loadRecordOverlay()
  const event = resource === "leads" ? (created ? "lead.created" : "lead.updated") : resource === "deals" ? (created ? "deal.created" : value.stage === "ganho" ? "deal.won" : value.stage === "perdido" ? "deal.lost" : value.stage ? "deal.stage_changed" : null) : resource === "quotes" ? (value.status === "enviado" ? "quote.sent" : value.status === "aceito" ? "quote.accepted" : null) : resource === "charges" ? (created ? "payment.created" : value.status === "pago" ? "payment.confirmed" : value.status === "vencido" ? "payment.overdue" : null) : null
  if (event) await dispatchCrmEvent(event, { ...value, id }).catch(error => console.error("[webhook] Falha ao registrar entrega", error instanceof Error ? error.message : "erro"))
}

export async function deleteRecord(resource: string, id: string): Promise<void> {
  const user = await getCurrentUser()
  if (!user) throw new Error("Sessão expirada. Entre novamente.")
  assertResourceAccess(user.role, resource, "write")
  const key = keySchema.parse({ resource, id })
  await db
    .insert(crmRecords)
    .values({ ...key, deleted: true, updatedBy: user.id })
    .onConflictDoUpdate({ target: [crmRecords.resource, crmRecords.id], set: { deleted: true, updatedBy: user.id, updatedAt: new Date() } })
}


/** Exclusão lógica local: mantém a identidade para não recriar a cobrança na sincronização. */
export async function archiveChargeAction(id: string) {
  const user = await getCurrentUser()
  if (!user || (user.role !== "admin" && user.role !== "financeiro")) return { ok: false as const, error: "Sem permissão para excluir cobranças." }
  const key = keySchema.safeParse({ resource: "charges", id })
  if (!key.success) return { ok: false as const, error: "Cobrança inválida." }
  try {
    const [record] = await db.select({ id: crmRecords.id }).from(crmRecords).where(sql`${crmRecords.resource} = 'charges' and ${crmRecords.id} = ${id} and ${crmRecords.deleted} = false`).limit(1)
    if (!record) return { ok: false as const, error: "Cobrança não encontrada. Atualize a página e tente novamente." }
    const deletedAt = new Date().toISOString()
    const patch = JSON.stringify({ deletedAt })
    // Uma única instrução garante que cobrança e lançamento sejam arquivados juntos.
    await db.execute(sql`with archived_charge as (
      update crm_records set data = data || ${patch}::jsonb, updated_by = ${user.id}, updated_at = now()
      where resource = 'charges' and id = ${id} and deleted = false returning id
    ) update crm_records set data = data || ${patch}::jsonb, updated_by = ${user.id}, updated_at = now()
      where resource = 'entries' and data->>'chargeId' = ${id} and exists(select 1 from archived_charge)`)
    return { ok: true as const, deletedAt }
  } catch { return { ok: false as const, error: "Não foi possível excluir a cobrança. Tente novamente." } }
}
