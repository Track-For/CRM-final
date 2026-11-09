"use server"

import { sql } from "drizzle-orm"
import { getCurrentUser } from "@/lib/auth/session"
import { assertResourceAccess } from "@/lib/data/resource-policy"
import { crmRecords, db } from "@/lib/db"
import { messageTemplateSchema } from "./validation"

export async function saveMessageTemplate(input: unknown) {
  const user = await getCurrentUser()
  if (!user) throw new Error("Sessão expirada. Entre novamente.")
  assertResourceAccess(user.role, "quickMessages", "write")
  const value = messageTemplateSchema.parse(input)
  const [saved] = await db.insert(crmRecords)
    .values({ resource: "quickMessages", id: value.id, data: { ...value }, created: true, updatedBy: user.id })
    .onConflictDoUpdate({ target: [crmRecords.resource, crmRecords.id], set: {
      data: sql`excluded.data`, created: true, deleted: false, updatedBy: user.id, updatedAt: new Date(),
    } })
    .returning({ data: crmRecords.data })
  return messageTemplateSchema.parse(saved.data)
}
