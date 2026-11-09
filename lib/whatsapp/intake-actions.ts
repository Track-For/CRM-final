"use server"

import { evolutionConfig } from "@/lib/whatsapp/client"

import { and, eq } from "drizzle-orm"
import { z } from "zod"
import { db, crmRecords } from "@/lib/db"
import { requireUser } from "@/lib/auth/session"
import { normalizePhone } from "./normalize"
import { intakeCategories, type IntakeData } from "./intake-model"
import { applyIntakeClassification, intakeId, readIntakeContext } from "./intake"

async function authorize() {
  const user = await requireUser()
  if (!["admin", "comercial"].includes(user.role)) throw Error("Sem permissão para classificar conversas.")
  return user
}
const phoneSchema = z.string().regex(/^[+\d\s().-]+$/).transform(normalizePhone).pipe(z.string().regex(/^\d{7,15}$/))
async function contact(input: string) {
  const phone = phoneSchema.parse(input), instance = (await evolutionConfig()).instance
  const { rows } = await readIntakeContext(instance, phone)
  if (!rows.some(r => r.direction === "in")) throw Error("Aguarde uma mensagem recebida e identifique o telefone antes de classificar.")
  const id = intakeId(instance, phone)
  const latest = rows.find(r => r.direction === "in")!
  const initial: IntakeData = { instance, phone, lastInboundAt: latest.sentAt.toISOString(), category: "unclassified", state: "review" }
  await db.insert(crmRecords).values({ resource: "whatsappIntake", id, data: { ...initial }, created: true }).onConflictDoNothing()
  return { id, phone, instance }
}
export async function classifyWhatsappContact(input: string, category: typeof intakeCategories[number]) {
  const user = await authorize()
  const value = z.enum(intakeCategories).parse(category)
  const c = await contact(input)
  return applyIntakeClassification(c.id, { category: value, confidence: 1, buyerIntent: value === "commercial", summary: "Classificação revisada pela equipe.", nextStep: value === "commercial" ? "Revisar a necessidade na conversa e fazer o primeiro atendimento comercial." : "", evidence: [] }, { manual: true, actor: user.id })
}
export async function retryWhatsappIntake(input: string) {
  const user = await authorize()
  const { id } = await contact(input)
  const [row] = await db.select().from(crmRecords).where(and(eq(crmRecords.resource, "whatsappIntake"), eq(crmRecords.id, id)))
  if (row?.data.state === "processing") throw Error("Esta conversa já está em análise. Aguarde a conclusão.")
  const data = { ...row.data, state: "pending", source: "ai", reason: "Aguardando classificação automática." }
  await db.update(crmRecords).set({ data, updatedBy: user.id, updatedAt: new Date() }).where(and(eq(crmRecords.resource, "whatsappIntake"), eq(crmRecords.id, id)))
}
