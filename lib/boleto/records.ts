// Somente servidor. Merge em crm_records sem exigir sessão: o webhook não tem cookie.
import { schedulePaidChargeInvoice } from "@/lib/fiscal/automatic-schedule"
import { and, eq, sql } from "drizzle-orm"
import { crmRecords, db } from "@/lib/db"

type MergeOptions = {
  skipFiscal?: boolean
  created?: boolean
  /** Omitido, não mexe em `deleted`: um webhook não ressuscita o que foi excluído na tela. */
  deleted?: boolean
  userId?: string
}

/** JSON não guarda `undefined`: campos vazios viajam como null, como em lib/data/api.ts. */
function toStored(value: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, v === undefined ? null : v]))
}

export async function mergeRecord(resource: "charges" | "entries", id: string, data: Record<string, unknown>, options: MergeOptions = {}): Promise<void> {
  const { created = false, deleted, userId } = options
  await db
    .insert(crmRecords)
    .values({ resource, id, data: toStored(data), created, deleted: deleted ?? false, updatedBy: userId ?? null })
    .onConflictDoUpdate({
      target: [crmRecords.resource, crmRecords.id],
      set: {
        data: sql`${crmRecords.data} || excluded.data`,
        created: sql`${crmRecords.created} or excluded.created`,
        updatedAt: new Date(),
        ...(deleted === undefined ? {} : { deleted }),
        ...(userId ? { updatedBy: userId } : {}),
      },
    })
  if (resource === "charges" && data.status === "pago" && !options.skipFiscal) await schedulePaidChargeInvoice(id)
}

export async function readRecord(resource: "charges" | "entries", id: string): Promise<Record<string, unknown> | null> {
  const [row] = await db
    .select({ data: crmRecords.data })
    .from(crmRecords)
    .where(and(eq(crmRecords.resource, resource), eq(crmRecords.id, id)))
    .limit(1)
  if (!row) return null
  return { ...Object.fromEntries(Object.entries(row.data).filter(([, v]) => v !== null)), id }
}
