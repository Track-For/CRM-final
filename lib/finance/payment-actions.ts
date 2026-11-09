"use server"
import { randomUUID } from "node:crypto"
import { sql } from "drizzle-orm"
import { z } from "zod"
import { db, crmRecords } from "@/lib/db"
import { getCurrentUser } from "@/lib/auth/session"
import { schedulePaidChargeInvoice } from "@/lib/fiscal/automatic-schedule"
import { dispatchCrmEvent } from "@/lib/integrations/webhooks"
import { localDay } from "@/lib/commercial/metrics"
import type { Charge, FinancialEntry } from "@/types"

export async function saveChargePaymentDate(id: string, date: string, expectedPaidAt: string | null) {
  const user = await getCurrentUser()
  if (!user || !["admin", "financeiro"].includes(user.role)) throw Error("Sem permissão para registrar pagamentos.")
  z.string().min(1).max(120).parse(id); z.iso.date().parse(date)
  z.string().nullable().parse(expectedPaidAt)
  const today = localDay(new Date().toISOString())
  if (date > today || date < "1900-01-01") throw Error("Informe uma data de pagamento válida, até hoje.")
  const result = await db.transaction(async tx => {
    const [row] = await tx.select().from(crmRecords).where(sql`${crmRecords.resource}='charges' and ${crmRecords.id}=${id} and ${crmRecords.deleted}=false`).for("update")
    const charge = row?.data as unknown as Charge | undefined
    if (!charge || charge.deletedAt || charge.conversionReverted || charge.awaitingProjectPayment) throw Error("Cobrança não encontrada ou indisponível.")
    if (charge.gatewayId || charge.importedFromAsaas) throw Error("Este pagamento é sincronizado pelo Asaas. Corrija os dados no provedor e atualize o status.")
    if (charge.status === "cancelado") throw Error("Cobranças canceladas não podem receber pagamentos.")
    if ((charge.paidAt || null) !== expectedPaidAt) throw Error("O pagamento foi alterado por outra pessoa. Atualize a página antes de continuar.")
    const paidAt = charge.status === "pago" && localDay(charge.paidAt) === date ? charge.paidAt! : `${date}T15:00:00.000Z`
    const data = { ...charge, id, status: "pago" as const, paidAt }
    await tx.update(crmRecords).set({ data: { ...data }, updatedBy: user.id, updatedAt: new Date() }).where(sql`${crmRecords.resource}='charges' and ${crmRecords.id}=${id}`)
    const entries = await tx.update(crmRecords).set({ data: sql`${crmRecords.data} || ${JSON.stringify({ status: "pago", paidAt })}::jsonb`, updatedBy: user.id, updatedAt: new Date() }).where(sql`${crmRecords.resource}='entries' and ${crmRecords.data}->>'chargeId'=${id} and ${crmRecords.deleted}=false`).returning({ data: crmRecords.data })
    await tx.insert(crmRecords).values({ resource: "paymentDateChanges", id: randomUUID(), created: true, updatedBy: user.id, data: { chargeId: id, previousStatus: charge.status, previousPaidAt: charge.paidAt || null, paidAt, changedAt: new Date().toISOString() } })
    return { charge: data, entries: entries.map(row => row.data as unknown as FinancialEntry), newlyPaid: charge.status !== "pago" }
  })
  if (result.newlyPaid) {
    await schedulePaidChargeInvoice(id).catch(() => console.error("[pagamento] Não foi possível agendar a nota fiscal automática."))
    await dispatchCrmEvent("payment.confirmed", result.charge).catch(() => console.error("[pagamento] Não foi possível registrar o webhook de confirmação."))
  }
  return { charge: result.charge, entries: result.entries }
}
