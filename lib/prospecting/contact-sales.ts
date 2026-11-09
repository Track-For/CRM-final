import { randomUUID } from "node:crypto"
import { inArray, sql } from "drizzle-orm"
import { db, crmRecords } from "@/lib/db"
import { prospectContactSalesPlan } from "./contact-sales-model"
import type { Prospect } from "./types"
import type { Activity } from "@/types"

/** Chamado apenas depois de o provedor confirmar o envio. Lead e negócio são atômicos. */
export async function registerProspectContactInSales(prospect: Prospect, actorId: string, message: { channel: "whatsapp" | "email"; subject: string; text: string }) {
  const result = await db.transaction(async tx => {
    // Serializa contatos de fontes diferentes com mesmo telefone/e-mail.
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext('prospect-contact-sales'))`)
    const rows = await tx.select().from(crmRecords).where(inArray(crmRecords.resource, ["leads", "deals", "pipelines"])).for("update")
    const now = new Date().toISOString()
    const plan = prospectContactSalesPlan(prospect, actorId, rows, now)
    if (plan.leadCreated) await tx.insert(crmRecords).values({ resource: "leads", id: plan.lead.id, created: true, data: { ...plan.lead, prospecting: prospect }, updatedBy: actorId })
    else if (plan.leadChanged) await tx.update(crmRecords).set({ data: sql`${crmRecords.data} || ${JSON.stringify({ status: plan.lead.status, updatedAt: now })}::jsonb`, updatedBy: actorId, updatedAt: new Date() }).where(sql`${crmRecords.resource}='leads' and ${crmRecords.id}=${plan.lead.id}`)
    if (plan.dealCreated) await tx.insert(crmRecords).values({ resource: "deals", id: plan.deal.id, created: true, data: { ...plan.deal }, updatedBy: actorId })
    else if (plan.dealMoved) await tx.update(crmRecords).set({ data: { ...plan.deal }, updatedBy: actorId, updatedAt: new Date() }).where(sql`${crmRecords.resource}='deals' and ${crmRecords.id}=${plan.deal.id}`)
    const activity: Activity = { id: `act_${randomUUID()}`, type: message.channel, title: message.channel === "email" ? `E-mail enviado: ${message.subject}` : "Mensagem enviada por WhatsApp", description: message.text, leadId: plan.lead.id, dealId: plan.deal.id, authorId: actorId, createdAt: now }
    await tx.insert(crmRecords).values({ resource: "activities", id: activity.id, created: true, data: { ...activity }, updatedBy: actorId })
    return { ...plan, activity }
  })
  const { dispatchCrmEvent } = await import("@/lib/integrations/webhooks")
  if (result.leadCreated) await dispatchCrmEvent("lead.created", result.lead).catch(() => {})
  if (result.dealCreated) await dispatchCrmEvent("deal.created", result.deal).catch(() => {})
  else if (result.dealMoved) await dispatchCrmEvent("deal.stage_changed", result.deal).catch(() => {})
  return result
}
