"use server"
import { headers } from "next/headers"
import { sql } from "drizzle-orm"
import { z } from "zod"
import { db, crmRecords } from "@/lib/db"
import { sha256Hex } from "@/lib/auth/session"
import { buildFormSchema } from "@/lib/forms/validation"
import { PROJECT_TYPE_LABEL, REVENUE_LABEL } from "@/lib/constants"
import type { Lead, PublicForm, ProjectType, RevenueRange } from "@/types"
import { dispatchCrmEvent } from "@/lib/integrations/webhooks"

export async function getPublicFormAction(slug: string): Promise<PublicForm | null> {
  z.string().min(1).max(120).parse(slug)
  const [row] = await db.select({ data: crmRecords.data }).from(crmRecords).where(sql`${crmRecords.resource} = 'forms' and ${crmRecords.deleted} = false and ${crmRecords.data}->>'slug' = ${slug} and ${crmRecords.data}->>'active' = 'true'`).limit(1)
  return row ? row.data as unknown as PublicForm : null
}
export async function submitPublicFormAction(slug: string, input: Record<string, string>, requestId: string, utm: Record<string, string> = {}) {
  z.string().uuid().parse(requestId)
  if (JSON.stringify(input).length > 30000) throw new Error("Formulário excede o limite permitido.")
  const form = await getPublicFormAction(slug)
  if (!form) throw new Error("Formulário indisponível.")
  const values = buildFormSchema(form.fields).parse(input)
  const metadata = z.record(z.string().max(40), z.string().max(300)).parse(utm)
  const reverse = <T extends string>(labels: Record<T, string>, value: string) => (Object.keys(labels) as T[]).find(key => labels[key] === value)
  const id = `form_${requestId}`
  const now = new Date().toISOString()
  const lead: Lead = { id, name: values.name || "Lead sem nome", email: values.email || "", whatsapp: values.whatsapp || "", company: values.company || "", projectType: reverse<ProjectType>(PROJECT_TYPE_LABEL, values.projectType) || "outros", revenue: reverse<RevenueRange>(REVENUE_LABEL, values.revenue) || "sem_faturamento", source: form.defaultSource, temperature: "morno", status: "novo", ownerId: "", formId: form.id, createdAt: now, updatedAt: now, utm: metadata }
  const h = await headers()
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "unknown"
  const bucket = sha256Hex(`${ip}:${Math.floor(Date.now() / 600000)}`)
  // Limite persistido entre processos, idempotência e contador na mesma instrução.
  const result = await db.execute(sql`with rate as (
    insert into crm_records(resource, id, data, created) values ('publicFormRate', ${bucket}, '{"count":1}', true)
    on conflict(resource,id) do update set data = jsonb_build_object('count', (crm_records.data->>'count')::int + 1)
      where (crm_records.data->>'count')::int < 10 returning id
  ), submitted as (
    insert into crm_records(resource,id,data,created)
    select 'leads', ${id}, ${JSON.stringify(lead)}::jsonb, true from rate
    where exists(select 1 from crm_records where resource='forms' and id=${form.id} and deleted=false and data->>'active'='true')
    on conflict(resource,id) do nothing returning id
  ), activity as (
    insert into crm_records(resource,id,data,created)
    select 'activities', ${`activity_${requestId}`}, ${JSON.stringify({ id: `activity_${requestId}`, type: "formulario", title: `Lead entrou pelo formulário ${form.name}`, description: values.message || "", leadId: id, authorId: "", createdAt: now })}::jsonb, true from submitted
  ) update crm_records set data = jsonb_set(data, '{submissions}', to_jsonb(coalesce((data->>'submissions')::int,0)+1)), updated_at=now()
    where resource='forms' and id=${form.id} and exists(select 1 from submitted) returning id`)
  if (!((Array.isArray(result) ? result : (result as { rows?: unknown[] }).rows || [])).length) {
    const [existing] = await db.select({ id: crmRecords.id }).from(crmRecords).where(sql`${crmRecords.resource}='leads' and ${crmRecords.id}=${id} and ${crmRecords.data}->>'formId'=${form.id}`).limit(1)
    if (!existing) throw new Error("Não foi possível enviar. Aguarde alguns minutos e tente novamente.")
  }
  await dispatchCrmEvent("lead.created", lead).catch(() => {})
  return { ok: true }
}
