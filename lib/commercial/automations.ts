import { createHash } from "node:crypto"
import { sql } from "drizzle-orm"
import { db, crmRecords, users } from "@/lib/db"
import { automationEvents, automationMatches, automationSchema } from "./model"

const hash = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex")
// Uma execução por regra, evento, registro e etapa. Reentregas não duplicam tarefas.
export async function queueAutomationEvent(event: string, payload: unknown) {
  if (!(automationEvents as readonly string[]).includes(event) || !payload || typeof payload !== "object") return
  const data = payload as Record<string, unknown>
  if (typeof data.id !== "string") return
  const resource = event.startsWith("lead.") ? "leads" : "deals"
  const [source] = await db.select({ data: crmRecords.data }).from(crmRecords).where(sql`${crmRecords.resource}=${resource} and ${crmRecords.id}=${data.id} and ${crmRecords.deleted}=false`).limit(1)
  if (!source) return
  const snapshot: Record<string, unknown> = { ...source.data, id: data.id }
  const id = hash([event, resource, data.id, snapshot.stage || ""])
  await db.insert(crmRecords).values({ resource: "automationEvents", id, data: { event, resource, sourceId: data.id, snapshot, state: "pending", attempts: 0, createdAt: new Date().toISOString() }, created: true }).onConflictDoNothing()
}

export async function processAutomationEvents() {
  const pending = await db.select({ id: crmRecords.id }).from(crmRecords).where(sql`${crmRecords.resource}='automationEvents' and ${crmRecords.data}->>'state'='pending' and ${crmRecords.deleted}=false`).orderBy(crmRecords.updatedAt).limit(30)
  for (const job of pending) {
    try {
      await db.transaction(async tx => {
        const [row] = await tx.select().from(crmRecords).where(sql`${crmRecords.resource}='automationEvents' and ${crmRecords.id}=${job.id}`).for("update")
        if (!row || row.data.state !== "pending") return
        const item = row.data
        const [source] = await tx.select().from(crmRecords).where(sql`${crmRecords.resource}=${String(item.resource)} and ${crmRecords.id}=${String(item.sourceId)} and ${crmRecords.deleted}=false`).for("update")
        if (source) {
          const rules = await tx.select().from(crmRecords).where(sql`${crmRecords.resource}='automationRules' and ${crmRecords.deleted}=false`).orderBy(crmRecords.id)
          for (const saved of rules) {
            const parsed = automationSchema.safeParse(Object.fromEntries(Object.entries(saved.data).filter(([key]) => key !== "id")))
            if (!parsed.success || !automationMatches(parsed.data, String(item.event), item.snapshot as Record<string, unknown>)) continue
            const rule = parsed.data
            const runId = hash([saved.id, job.id])
            const now = new Date().toISOString()
            const [reserved] = await tx.insert(crmRecords).values({ resource: "automationRuns", id: runId, data: { id: runId, eventId: job.id, ruleId: saved.id, ruleName: rule.name, sourceId: source.id, event: item.event, state: "completed", createdAt: now }, created: true }).onConflictDoNothing().returning({ id: crmRecords.id })
            if (!reserved) continue
            if (rule.userId) {
              const [person] = await tx.select({ role: users.role }).from(users).where(sql`${users.id}=${rule.userId} and ${users.active}=true`).limit(1)
              if (!person || (rule.action === "assign_owner" && !["admin", "comercial"].includes(person.role))) throw Error("Responsável indisponível.")
            }
            if (rule.action === "assign_owner") {
              await tx.update(crmRecords).set({ data: sql`${crmRecords.data} || ${JSON.stringify({ ownerId: rule.userId, updatedAt: now })}::jsonb`, updatedAt: new Date() }).where(sql`${crmRecords.resource}=${source.resource} and ${crmRecords.id}=${source.id}`)
            } else {
              const title = rule.title.replace(/\{nome\}/g, String(source.data.name || source.data.title || "Contato"))
              const due = new Date(String(item.createdAt)); due.setUTCDate(due.getUTCDate() + rule.dueDays)
              const taskId = `auto_${runId}`
              const task = { id: taskId, title, description: `Criada pela automação: ${rule.name}`, status: "todo", priority: "media", assigneeId: rule.userId || "", ...(source.resource === "leads" ? { leadId: source.id } : { dealId: source.id }), ...(source.data.clientId ? { clientId: source.data.clientId } : {}), dueDate: due.toISOString(), checklist: [], comments: [], attachments: [], order: 0, createdAt: now }
              await tx.insert(crmRecords).values({ resource: "tasks", id: taskId, data: task, created: true }).onConflictDoNothing()
            }
          }
        }
        await tx.update(crmRecords).set({ data: sql`${crmRecords.data} || '{"state":"completed"}'::jsonb`, updatedAt: new Date() }).where(sql`${crmRecords.resource}='automationEvents' and ${crmRecords.id}=${job.id}`)
      })
    } catch {
      await db.update(crmRecords).set({ data: sql`${crmRecords.data} || jsonb_build_object('attempts',coalesce((${crmRecords.data}->>'attempts')::int,0)+1,'state',case when coalesce((${crmRecords.data}->>'attempts')::int,0)>=4 then 'failed' else 'pending' end)`, updatedAt: new Date() }).where(sql`${crmRecords.resource}='automationEvents' and ${crmRecords.id}=${job.id} and ${crmRecords.data}->>'state'='pending'`)
    }
  }
}
