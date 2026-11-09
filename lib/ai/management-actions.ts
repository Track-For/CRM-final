"use server"

import { and, eq, inArray, sql } from "drizzle-orm"
import { requireUser } from "@/lib/auth/session"
import { db, crmRecords } from "@/lib/db"
import { canUseResource } from "@/lib/data/resource-policy"
import { aiConfigured, requestManagementAnalysis } from "./provider"
import { buildManagementContext, managementPromptSchema, managementResources, validateManagementAnalysis, type ManagementReport } from "./management-model"

async function context(role: Awaited<ReturnType<typeof requireUser>>["role"]) {
  const allowed = managementResources.filter(resource => canUseResource(role, resource, "read"))
  const rows = await db.select({ resource: crmRecords.resource, id: crmRecords.id, data: crmRecords.data })
    .from(crmRecords).where(and(inArray(crmRecords.resource, allowed), eq(crmRecords.deleted, false)))
  return buildManagementContext(rows, role)
}

export async function getManagementAiState() {
  const user = await requireUser()
  const current = await context(user.role)
  const [saved] = await db.select({ data: crmRecords.data }).from(crmRecords)
    .where(and(eq(crmRecords.resource, "managementAiReports"), eq(crmRecords.id, user.id), eq(crmRecords.deleted, false))).limit(1)
  // Uma mudança de papel não libera um relatório gerado com permissões anteriores.
  let report: ManagementReport | null = null
  if (saved?.data.role === user.role) {
    const old = saved.data.report as ManagementReport | undefined
    const currentSources = new Map(current.records.map(r => [r.key, r]))
    if (old?.context?.records && old.analysis) {
      // Não reapresenta registros removidos ou alterados desde a análise.
      const unchanged = old.context.records.every(r => JSON.stringify(currentSources.get(r.key)) === JSON.stringify(r))
      if (unchanged) {
        try { report = { context: old.context, analysis: validateManagementAnalysis(old.analysis, old.context), prompt: managementPromptSchema.parse(old.prompt ?? "") } }
        catch { report = null }
      }
    }
  }
  return { configured: await aiConfigured(), context: current, report }
}

export async function analyzeManagement(input = "") {
  const user = await requireUser()
  const prompt = managementPromptSchema.parse(input)
  if (!await aiConfigured()) throw Error("Configure a IA em Integrações → WhatsApp e IA antes de gerar a análise.")
  const snapshot = await context(user.role)
  if (!snapshot.records.length) throw Error("Não há registros pendentes nas áreas que você pode consultar.")
  const reserved = await db.execute(sql`insert into crm_records(resource,id,data,created,updated_by,updated_at)
    values('managementAiRate',${user.id},'{}'::jsonb,true,${user.id},now())
    on conflict(resource,id) do update set updated_at=now()
    where crm_records.updated_at < now()-interval '1 minute' returning id`)
  if (!(reserved as unknown[]).length) throw Error("Aguarde um minuto antes de gerar outra análise.")
  const analysis = validateManagementAnalysis(await requestManagementAnalysis(snapshot, prompt), snapshot)
  const report: ManagementReport = { context: snapshot, analysis, prompt }
  await db.insert(crmRecords).values({ resource: "managementAiReports", id: user.id, created: true, data: { role: user.role, report }, updatedBy: user.id })
    .onConflictDoUpdate({ target: [crmRecords.resource, crmRecords.id], set: { data: { role: user.role, report }, deleted: false, updatedAt: new Date(), updatedBy: user.id } })
  return report
}
