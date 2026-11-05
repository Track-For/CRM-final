"use server"

import { z } from "zod"
import { eq, and } from "drizzle-orm"
import { requireUser } from "@/lib/auth/session"
import { db, crmRecords } from "@/lib/db"
import type { Lead } from "@/types"
import type { Prospect, ProspectSearch } from "./types"

async function authorize() {
  const user = await requireUser()
  if (!["admin", "comercial"].includes(user.role)) throw new Error("Sem permissão para realizar buscas.")
  return user
}
async function request<T>(path: string, body?: unknown): Promise<T> {
  const base = process.env.PROSPECTING_URL || "http://127.0.0.1:8091"
  let response: Response
  try {
    response = await fetch(`${base}${path}`, { method: body ? "POST" : "GET", headers: { "Content-Type": "application/json", ...(process.env.PROSPECTING_TOKEN ? { Authorization: `Bearer ${process.env.PROSPECTING_TOKEN}` } : {}) }, body: body ? JSON.stringify(body) : undefined, cache: "no-store", signal: AbortSignal.timeout(15000) })
  } catch { throw new Error("Serviço de buscas indisponível. Inicie o serviço com npm run prospecting:start e o motor com npm run prospecting:engine.") }
  if (!response.ok) throw new Error(`O serviço de buscas retornou um erro (${response.status}).`)
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
export async function importProspects(ids: string[]) {
  const user = await authorize()
  const selected = new Set(z.array(z.string().min(1).max(120)).min(1).max(200).parse(ids))
  const prospects = (await request<Prospect[]>("/api/leads")).filter(p => selected.has(p.id))
  const existing = await db.select().from(crmRecords).where(and(eq(crmRecords.resource, "leads"), eq(crmRecords.deleted, false)))
  const phoneKey = (v: unknown) => String(v || "").replace(/\D/g, "").replace(/^55(?=\d{10,11}$)/, "")
  const phones = new Set(existing.map(r => phoneKey(r.data.whatsapp)).filter(Boolean))
  const emails = new Set(existing.map(r => String(r.data.email || "").toLowerCase()).filter(Boolean))
  const imported: Lead[] = []
  for (const p of prospects) {
    const id = `maps_${p.id}`
    const phone = phoneKey(p.whatsapp || p.telefone)
    const email = (p.email || "").toLowerCase()
    if (existing.some(r => r.id === id) || (phone && phones.has(phone)) || (email && emails.has(email))) continue
    const now = new Date().toISOString()
    const lead: Lead = { id, name: p.nome, company: p.nome, whatsapp: p.whatsapp || p.telefone || "", email: p.email || "", projectType: "outros", revenue: "sem_faturamento", source: "manual", temperature: "frio", status: "novo", ownerId: user.id, utm: { source: "google_maps", medium: "prospeccao", campaign: `${p.categoria || ""} - ${p.cidade || ""}` }, createdAt: now, updatedAt: now }
    const rows = await db.insert(crmRecords).values({ resource: "leads", id, created: true, data: { ...lead, prospecting: p }, updatedBy: user.id }).onConflictDoNothing().returning({ id: crmRecords.id })
    if (rows.length) { imported.push(lead); if (phone) phones.add(phone); if (email) emails.add(email) }
  }
  return { imported, skipped: selected.size - imported.length }
}
