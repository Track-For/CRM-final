"use server"

import { z } from "zod"
import { eq, and } from "drizzle-orm"
import { requireUser } from "@/lib/auth/session"
import { db, crmRecords } from "@/lib/db"
import type { Lead } from "@/types"
import type { Prospect, ProspectSearch, ProspectDetail, ProspectStage, ReceitaStatus, ReceitaResults } from "./types"

async function authorize() {
  const user = await requireUser()
  if (!["admin", "comercial"].includes(user.role)) throw new Error("Sem permissão para realizar buscas.")
  return user
}
async function request<T>(path: string, body?: unknown, method = body ? "POST" : "GET"): Promise<T> {
  const base = process.env.PROSPECTING_URL || "http://127.0.0.1:8091"
  let response: Response
  try {
    response = await fetch(`${base}${path}`, { method, headers: { "Content-Type": "application/json", ...(process.env.PROSPECTING_TOKEN ? { Authorization: `Bearer ${process.env.PROSPECTING_TOKEN}` } : {}) }, body: body ? JSON.stringify(body) : undefined, cache: "no-store", signal: AbortSignal.timeout(15000) })
  } catch { throw new Error("Serviço de buscas indisponível. Inicie o serviço com npm run prospecting:start e o motor com npm run prospecting:engine.") }
  if (!response.ok) {
    if ([400, 404, 409].includes(response.status)) {
      const payload = await response.json().catch(() => null)
      if (typeof payload?.erro === "string") throw new Error(payload.erro.replace(/^Dados inválidos: /, "").slice(0, 300))
    }
    throw new Error(`O serviço de buscas retornou um erro (${response.status}).`)
  }
  return response.json()
}
export async function loadProspecting() {
  await authorize()
  const [status, searches, prospects] = await Promise.all([
    request<{ motor: boolean; fila: number }>("/api/status"), request<ProspectSearch[]>("/api/buscas"), request<Prospect[]>("/api/leads"),
  ])
  return { status, searches, prospects }
}
const searchSchema = z.object({ nichos: z.string().trim().min(2).max(500), cidade: z.string().trim().min(2).max(100), uf: z.string().regex(/^(AC|AL|AP|AM|BA|CE|DF|ES|GO|MA|MT|MS|MG|PA|PB|PR|PE|PI|RJ|RN|RS|RO|RR|SC|SP|SE|TO)$/), bairro: z.string().trim().max(100), tamanho: z.enum(["rapida", "padrao", "completa", "cidade"]), redes: z.boolean(), somente_sem_site: z.boolean() })
export async function createProspectSearch(input: z.infer<typeof searchSchema>) {
  await authorize()
  return request<ProspectSearch>("/api/buscas", searchSchema.parse(input))
}
export async function cancelProspectSearch(id: string) {
  await authorize()
  return request(`/api/buscas/${z.string().regex(/^[a-f0-9]{32}$/).parse(id)}/cancelar`, {})
}
export async function deleteProspectSearch(id: string) {
  await authorize()
  return request<{ ok: boolean; excluidos: number }>(`/api/buscas/${z.string().regex(/^[a-f0-9]{32}$/).parse(id)}`, undefined, "DELETE")
}
export async function importProspects(ids: string[]) {
  const user = await authorize()
  const selected = new Set(z.array(z.string().min(1).max(120)).min(1).max(200).parse(ids))
  const prospects = (await request<Prospect[]>("/api/leads")).filter(p => selected.has(p.id))
  return persistProspects(prospects, selected.size, user)
}
async function persistProspects(prospects: Prospect[], selectedCount: number, user: Awaited<ReturnType<typeof authorize>>) {
  const existing = await db.select().from(crmRecords).where(and(eq(crmRecords.resource, "leads"), eq(crmRecords.deleted, false)))
  const phoneKey = (v: unknown) => String(v || "").replace(/\D/g, "").replace(/^55(?=\d{10,11}$)/, "")
  const phones = new Set(existing.map(r => phoneKey(r.data.whatsapp)).filter(Boolean))
  const emails = new Set(existing.map(r => String(r.data.email || "").toLowerCase()).filter(Boolean))
  const imported: Lead[] = []
  for (const p of prospects) {
    const id = p.origem === "receita_federal" ? `cnpj_${p.cnpj}` : `maps_${p.id}`
    const phone = phoneKey(p.whatsapp || p.telefone)
    const email = (p.email || "").toLowerCase()
    if (existing.some(r => r.id === id) || (phone && phones.has(phone)) || (email && emails.has(email))) continue
    const now = new Date().toISOString()
    const lead: Lead = { id, name: p.nome, company: p.nome, whatsapp: p.whatsapp || p.telefone || "", email: p.email || "", projectType: "outros", revenue: "sem_faturamento", source: "manual", temperature: "frio", status: "novo", ownerId: user.id, utm: { source: p.origem || "google_maps", medium: "prospeccao", campaign: `${p.categoria || ""} - ${p.cidade || ""}` }, createdAt: now, updatedAt: now }
    const rows = await db.insert(crmRecords).values({ resource: "leads", id, created: true, data: { ...lead, prospecting: p }, updatedBy: user.id }).onConflictDoNothing().returning({ id: crmRecords.id })
    if (rows.length) {
      const { dispatchCrmEvent } = await import("@/lib/integrations/webhooks")
      await dispatchCrmEvent("lead.created", lead).catch(() => {})
      imported.push(lead); if (phone) phones.add(phone); if (email) emails.add(email)
    }
  }
  return { imported, skipped: selectedCount - imported.length }
}

export async function getReceitaStatus() {
  await authorize()
  return request<ReceitaStatus>("/api/receita/status")
}
export async function searchReceitaCnaes(query: string) {
  await authorize()
  return request<{ codigo: string; descricao: string }[]>(`/api/receita/cnaes?q=${encodeURIComponent(z.string().trim().max(120).parse(query))}`)
}
const receitaSearchSchema = z.object({ uf: searchSchema.shape.uf, cidade: z.string().trim().max(100), cnae: z.string().trim().regex(/^(?:\d{7}|\d{4}-\d\/\d{2})?$/).transform(v => v.replace(/\D/g, "")), secundarios: z.boolean(), page: z.number().int().min(1).max(100000) })
export async function searchReceita(input: z.input<typeof receitaSearchSchema>) {
  await authorize()
  return request<ReceitaResults>("/api/receita/buscar", receitaSearchSchema.parse(input))
}
export async function importReceitaProspects(ids: string[]) {
  const user = await authorize()
  const selected = [...new Set(z.array(z.string().trim().toUpperCase().regex(/^[A-Z0-9]{12}\d{2}$/)).min(1).max(200).parse(ids))]
  const prospects = await request<Prospect[]>("/api/receita/selecionar", { ids: selected })
  return persistProspects(prospects, selected.length, user)
}

const prospectId = z.string().regex(/^[\w-]{1,120}$/)
export async function deleteProspects(ids: string[]) {
  await authorize()
  const selected = [...new Set(z.array(prospectId).min(1).max(200).parse(ids))]
  return request<{ excluidos: number }>("/api/leads/excluir", { ids: selected })
}

export async function getProspectDetail(id: string) {
  await authorize()
  const key = prospectId.parse(id)
  const [prospect, config] = await Promise.all([
    request<ProspectDetail>(`/api/leads/${key}`),
    request<{ etapas: ProspectStage[] }>("/api/config"),
  ])
  return { prospect, stages: config.etapas }
}

export async function recordProspectContact(id: string, channel: "whatsapp" | "email", text: string) {
  await authorize()
  return request<ProspectDetail>(`/api/leads/${prospectId.parse(id)}/evento`, { tipo: z.enum(["whatsapp", "email"]).parse(channel), txt: z.string().trim().min(1).max(2000).parse(text) })
}

const prospectPatch = z.object({
  status: z.string().min(1).max(80).optional(),
  obs: z.string().max(2000).optional(),
  retorno: z.number().positive().max(32503680000).nullable().optional(),
}).strict().refine(value => Object.keys(value).length > 0, "Nenhuma alteração informada.")
export async function updateProspect(id: string, input: z.infer<typeof prospectPatch>) {
  await authorize()
  return request<ProspectDetail>(`/api/leads/${prospectId.parse(id)}`, prospectPatch.parse(input), "PATCH")
}
