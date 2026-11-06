import { NextResponse, type NextRequest } from "next/server"
import { randomUUID } from "node:crypto"
import { sql } from "drizzle-orm"
import { z } from "zod"
import { db, crmRecords } from "@/lib/db"
import { sha256Hex } from "@/lib/auth/session"
import { dispatchCrmEvent } from "@/lib/integrations/webhooks"

const supported = ["leads", "deals", "tasks", "charges"]
async function authorize(request: NextRequest, resource: string, operation: "read" | "write") {
  if (!supported.includes(resource)) return false
  const token = request.headers.get("authorization")?.replace(/^Bearer /i, "") || ""
  if (!/^sk_live_[A-Za-z0-9_-]{43}$/.test(token)) return false
  const [row] = await db.select().from(crmRecords).where(sql`${crmRecords.resource}='apiKeys' and ${crmRecords.deleted}=false and ${crmRecords.data}->>'tokenHash'=${sha256Hex(token)}`).limit(1)
  if (!row || !Array.isArray(row.data.scopes) || !row.data.scopes.includes(`${resource}:${operation}`)) return false
  await db.update(crmRecords).set({ data: sql`${crmRecords.data} || ${JSON.stringify({ lastUsedAt: new Date().toISOString() })}::jsonb` }).where(sql`${crmRecords.resource}='apiKeys' and ${crmRecords.id}=${row.id}`)
  return true
}
type Context = { params: Promise<{ resource: string }> }
export async function GET(request: NextRequest, context: Context) {
  const { resource } = await context.params
  if (!await authorize(request, resource, "read")) return NextResponse.json({ error: "Chave inválida ou sem permissão." }, { status: 403 })
  const limit = Math.min(100, Math.max(1, Number(request.nextUrl.searchParams.get("limit")) || 50))
  const offset = Math.max(0, Number(request.nextUrl.searchParams.get("offset")) || 0)
  const rows = await db.select({ data: crmRecords.data }).from(crmRecords).where(sql`${crmRecords.resource}=${resource} and ${crmRecords.deleted}=false`).orderBy(crmRecords.id).limit(limit).offset(offset)
  return NextResponse.json({ data: rows.map(row => row.data), limit, offset }, { headers: { "Cache-Control": "no-store" } })
}
const leadSchema = z.object({ name: z.string().trim().min(1).max(200), email: z.string().email().or(z.literal("")).default(""), whatsapp: z.string().max(30).default(""), company: z.string().max(200).default("") }).strict()
const taskSchema = z.object({ title: z.string().trim().min(1).max(300), description: z.string().max(4000).optional(), dueDate: z.string().datetime().optional(), clientId: z.string().max(120).optional() }).strict()
const dealPatch = z.object({ id: z.string().min(1).max(120), title: z.string().max(300).optional(), nextAction: z.string().max(1000).optional(), nextActionDate: z.string().datetime().optional() }).strict()
export async function POST(request: NextRequest, context: Context) {
  const { resource } = await context.params
  if (!await authorize(request, resource, "write")) return NextResponse.json({ error: "Chave inválida ou sem permissão." }, { status: 403 })
  try {
    const body = await request.text()
    if (body.length > 20000) return NextResponse.json({ error: "Corpo excede o limite." }, { status: 413 })
    const input = JSON.parse(body)
    const now = new Date().toISOString()
    if (resource === "deals") {
      const { id, ...patch } = dealPatch.parse(input)
      const [row] = await db.update(crmRecords).set({ data: sql`${crmRecords.data} || ${JSON.stringify({ ...patch, updatedAt: now })}::jsonb`, updatedAt: new Date() }).where(sql`${crmRecords.resource}='deals' and ${crmRecords.id}=${id} and ${crmRecords.deleted}=false`).returning({ data: crmRecords.data })
      return NextResponse.json(row ? { data: row.data } : { error: "Negócio não encontrado." }, { status: row ? 200 : 404 })
    }
    if (!["leads", "tasks"].includes(resource)) return NextResponse.json({ error: "Operação não disponível." }, { status: 405 })
    const id = randomUUID()
    const data = resource === "leads" ? { ...leadSchema.parse(input), id, projectType: "outros", revenue: "sem_faturamento", source: "manual", temperature: "morno", status: "novo", ownerId: "", createdAt: now, updatedAt: now } : { description: "", dueDate: now, ...taskSchema.parse(input), id, status: "todo", priority: "media", assigneeId: "", checklist: [], comments: [], attachments: [], order: 0, createdAt: now }
    await db.insert(crmRecords).values({ resource, id, data, created: true })
    if (resource === "leads") await dispatchCrmEvent("lead.created", data).catch(() => {})
    return NextResponse.json({ data }, { status: 201 })
  } catch { return NextResponse.json({ error: "Dados inválidos ou operação indisponível." }, { status: 400 }) }
}
