// Somente servidor. Regras compartilhadas entre as actions e o webhook.
import { schedulePaidChargeInvoice } from "@/lib/fiscal/automatic-schedule"
import { and, eq, isNull, or, sql } from "drizzle-orm"
import { billingSettings, boletos, crmRecords, db, gatewayEvents } from "@/lib/db"
import type { BillingSettings, BoletoRow, BoletoStatus } from "@/lib/db"
import { decryptSecret } from "@/lib/fiscal/crypto"
import { mapAsaasStatus, type AsaasIdentificationField, type AsaasPayment } from "@/lib/boleto/asaas"
import { importedReceivable } from "@/lib/boleto/import-normalize"
import type { Charge, Client, Subscription } from "@/types"
import { mergeRecord } from "@/lib/boleto/records"

export const BILLING_SETTINGS_ID = "default"

export async function loadBillingSettings(): Promise<BillingSettings> {
  const [row] = await db.select().from(billingSettings).where(eq(billingSettings.id, BILLING_SETTINGS_ID)).limit(1)
  if (row) return row
  await db.insert(billingSettings).values({ id: BILLING_SETTINGS_ID }).onConflictDoNothing()
  const [created] = await db.select().from(billingSettings).where(eq(billingSettings.id, BILLING_SETTINGS_ID)).limit(1)
  return created
}

/** Token do webhook em claro; null se não houver ou se não puder ser lido. */
export async function readWebhookToken(): Promise<string | null> {
  const [row] = await db
    .select({ token: billingSettings.webhookTokenEncrypted })
    .from(billingSettings)
    .where(eq(billingSettings.id, BILLING_SETTINGS_ID))
    .limit(1)
  if (!row?.token) return null
  try {
    return decryptSecret(row.token)
  } catch (err) {
    console.error("[boleto] falha ao descriptografar o token do webhook:", err instanceof Error ? err.message : err)
    return null
  }
}

/** Data de hoje no Brasil: depois das 21h o relógio UTC do servidor já está no dia seguinte. */
export function todayInBrazil(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(now)
}

/** Meio-dia UTC: uma data pura seria lida como UTC e apareceria um dia antes na tela. */
export function dateToIso(date: string): string {
  return /^\d{4}-\d{2}-\d{2}$/.test(date) ? `${date}T12:00:00.000Z` : new Date(date).toISOString()
}

function paymentPaidAt(payment: AsaasPayment): Date | null {
  const raw = payment.paymentDate ?? payment.clientPaymentDate ?? payment.confirmedDate
  if (!raw) return null
  const date = new Date(dateToIso(raw))
  return Number.isNaN(date.getTime()) ? null : date
}

/**
 * Status que um evento de webhook pode aplicar; null quando ele é velho demais.
 * Só REFUNDED ou DELETED tiram uma cobrança de `pago`, e só RESTORED tira de `cancelado`.
 */
export function nextStatusFromEvent(current: BoletoStatus, event: string, payment: AsaasPayment, today: string): BoletoStatus | null {
  const mapped = mapAsaasStatus(payment.status, payment.deleted)
  if (event === "PAYMENT_DELETED" || event === "PAYMENT_REFUNDED" || mapped === "cancelado") return "cancelado"
  if (event === "PAYMENT_RESTORED") return mapped
  if (current === "cancelado") return null
  if (current === "pago" && mapped !== "pago") return null
  // Vencido só volta a pendente quando o vencimento foi mesmo adiado.
  if (current === "vencido" && mapped === "pendente" && (!payment.dueDate || payment.dueDate < today)) return null
  return mapped
}

function entryStatus(status: BoletoStatus): "pago" | "pendente" | "vencido" | null {
  return status === "cancelado" ? null : status
}

/** Campos da cobrança que vêm da linha de `boletos`. */
export function chargeFieldsFromRow(row: BoletoRow) {
  return {
    gateway: "asaas" as const,
    gatewayId: row.gatewayId ?? undefined,
    gatewayStatus: row.gatewayStatus ?? undefined,
    gatewayEnvironment: row.environment,
    status: row.status,
    amount: Number(row.amount),
    dueDate: dateToIso(row.dueDate),
    paidAt: row.paidAt?.toISOString(),
    invoiceUrl: row.invoiceUrl ?? undefined,
    bankSlipUrl: row.bankSlipUrl ?? undefined,
    nossoNumero: row.nossoNumero ?? undefined,
    digitableLine: row.digitableLine ?? "",
    barcode: row.barcode ?? "",
  }
}

/** Campos do lançamento que acompanham o boleto. */
export function entryFieldsFromRow(row: BoletoRow) {
  return {
    status: entryStatus(row.status) ?? "pendente",
    paidAt: row.paidAt?.toISOString(),
    amount: Number(row.amount),
    dueDate: dateToIso(row.dueDate),
  }
}

/** Grava em crm_records o estado atual da linha. `previous` diz se o boleto saiu de cancelado. */
export async function mergeRowIntoRecords(row: BoletoRow, previous: BoletoStatus, userId?: string): Promise<void> {
  await mergeRecord("charges", row.chargeId, chargeFieldsFromRow(row), { userId })
  if (!row.entryId) return
  const deleted = row.status === "cancelado" ? true : previous === "cancelado" ? false : undefined
  await mergeRecord("entries", row.entryId, entryFieldsFromRow(row), { deleted, userId })
}

/** Campos de `boletos` derivados de um retrato da cobrança no Asaas. */
export function rowPatchFromPayment(row: BoletoRow, payment: AsaasPayment, status: BoletoStatus, identification?: AsaasIdentificationField | null) {
  const amount = typeof payment.value === "number" ? payment.value.toFixed(2) : row.amount
  const dueDate = payment.dueDate ?? row.dueDate
  // Valor ou vencimento novos invalidam a linha digitável: melhor vazia que errada.
  const changed = Number(amount) !== Number(row.amount) || dueDate !== row.dueDate
  return {
    gatewayId: payment.id,
    gatewayCustomerId: payment.customer ?? row.gatewayCustomerId,
    gatewayStatus: payment.deleted ? "DELETED" : (payment.status ?? row.gatewayStatus),
    status,
    amount,
    dueDate,
    invoiceUrl: payment.invoiceUrl ?? row.invoiceUrl,
    bankSlipUrl: payment.bankSlipUrl ?? row.bankSlipUrl,
    nossoNumero: identification?.nossoNumero ?? payment.nossoNumero ?? row.nossoNumero,
    digitableLine: identification?.identificationField ?? (changed ? null : row.digitableLine),
    barcode: identification?.barCode ?? (changed ? null : row.barcode),
    paidAt: status === "pago" ? (paymentPaidAt(payment) ?? row.paidAt ?? null) : null,
    errorMessage: null,
    updatedAt: new Date(),
  }
}

/** Aplica o estado atual do Asaas (consulta direta, então vale sobre o que houver). */
export async function applyPaymentSnapshot(row: BoletoRow, payment: AsaasPayment, identification?: AsaasIdentificationField | null, userId?: string): Promise<BoletoRow> {
  const status = mapAsaasStatus(payment.status, payment.deleted)
  const [saved] = await db
    .update(boletos)
    .set(rowPatchFromPayment(row, payment, status, identification))
    .where(eq(boletos.chargeId, row.chargeId))
    .returning()
  const fresh = saved ?? row
  await mergeRowIntoRecords(fresh, row.status, userId)
  return fresh
}

async function findRowForPayment(payment: AsaasPayment): Promise<BoletoRow | null> {
  const [byGateway] = await db.select().from(boletos).where(eq(boletos.gatewayId, payment.id)).limit(1)
  if (byGateway) return byGateway
  if (!payment.externalReference || (payment.installmentNumber && payment.installmentNumber > 1)) return null
  // Emissão incerta (timeout): o evento confirma que o boleto existe e evita duplicar na nova tentativa.
  const [pending] = await db
    .select()
    .from(boletos)
    .where(and(eq(boletos.chargeId, payment.externalReference), isNull(boletos.gatewayId)))
    .limit(1)
  return pending ?? null
}

const MAX_ATTEMPTS = 4

/** Aplica um evento de webhook. O update condicional impede que eventos simultâneos passem por cima da regra de ordem. */
export async function applyWebhookPayment(event: string, payment: AsaasPayment, today = todayInBrazil()): Promise<void> {
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const row = await findRowForPayment(payment)
    if (!row) {
      const settings = await loadBillingSettings()
      const [record] = await db.select().from(crmRecords).where(and(eq(crmRecords.resource, "charges"), eq(crmRecords.deleted, false), sql`${crmRecords.data}->>'gatewayId' = ${payment.id}`, sql`${crmRecords.data}->>'gatewayEnvironment' = ${settings.environment}`)).limit(1)
      if (!record) {
        // Um evento de nova cobrança pode chegar antes da primeira sincronização.
        const { syncAsaasReceivables } = await import("./import")
        await syncAsaasReceivables(true)
        const [imported] = await db.select().from(crmRecords).where(and(eq(crmRecords.resource, "charges"), eq(crmRecords.deleted, false), sql`${crmRecords.data}->>'gatewayId' = ${payment.id}`, sql`${crmRecords.data}->>'gatewayEnvironment' = ${settings.environment}`)).limit(1)
        if (imported?.data.status === "pago" && mapAsaasStatus(payment.status, payment.deleted) === "pago") await schedulePaidChargeInvoice(imported.id)
        return
      }
      const existing = record.data as unknown as Charge
      if (!existing.importedFromAsaas) return
      const status = nextStatusFromEvent(existing.status, event, payment, today)
      if (status === null) return
      const [clientRow] = await db.select().from(crmRecords).where(and(eq(crmRecords.resource, "clients"), eq(crmRecords.id, existing.clientId))).limit(1)
      if (!clientRow) return
      const [subscriptionRow] = existing.subscriptionId ? await db.select().from(crmRecords).where(and(eq(crmRecords.resource, "subscriptions"), eq(crmRecords.id, existing.subscriptionId))).limit(1) : []
      const [entryRow] = await db.select().from(crmRecords).where(and(eq(crmRecords.resource, "entries"), sql`${crmRecords.data}->>'chargeId' = ${existing.id}`)).limit(1)
      const snapshot = importedReceivable(payment, clientRow.data as unknown as Client, settings.environment, status, existing, subscriptionRow?.data as unknown as Subscription | undefined, entryRow?.id)
      if (!snapshot) return
      const chargeData = Object.fromEntries(Object.entries(snapshot.charge).map(([key, value]) => [key, value === undefined ? null : value]))
      const [saved] = await db.update(crmRecords).set({ data: sql`${crmRecords.data} || ${JSON.stringify(chargeData)}::jsonb`, updatedAt: new Date() }).where(and(eq(crmRecords.resource, "charges"), eq(crmRecords.id, existing.id), eq(crmRecords.deleted, false), sql`${crmRecords.data}->>'status' = ${existing.status}`)).returning()
      if (!saved) continue
      if (status === "pago") await schedulePaidChargeInvoice(existing.id)
      await mergeRecord("entries", snapshot.entry.id, { ...snapshot.entry }, { created: true, deleted: snapshot.entryDeleted || !!entryRow?.deleted && existing.status !== "cancelado" })
      return
    }
    const status = nextStatusFromEvent(row.status, event, payment, today)
    if (status === null) return
    const [saved] = await db
      .update(boletos)
      .set(rowPatchFromPayment(row, payment, status))
      .where(
        and(
          eq(boletos.chargeId, row.chargeId),
          eq(boletos.status, row.status),
          or(isNull(boletos.gatewayId), eq(boletos.gatewayId, payment.id)),
        ),
      )
      .returning()
    if (saved) {
      await mergeRowIntoRecords(saved, row.status)
      return
    }
  }
  throw new Error("status do boleto mudou durante o processamento do evento")
}

export async function isEventProcessed(id: string): Promise<boolean> {
  const [row] = await db.select({ id: gatewayEvents.id }).from(gatewayEvents).where(eq(gatewayEvents.id, id)).limit(1)
  return Boolean(row)
}

export async function markEventProcessed(id: string, event: string, gatewayId: string | null): Promise<void> {
  await db.insert(gatewayEvents).values({ id, event, gatewayId }).onConflictDoNothing()
}
