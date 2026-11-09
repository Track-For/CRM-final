import { sql } from "drizzle-orm"
import { db, crmRecords } from "@/lib/db"
import { collectContractReceivables, collectReceipts } from "./receipts"
import type { Charge, Client, Deal, FinancialEntry } from "@/types"

/** Uso interno: o chamador deve autorizar o usuário ou a chave antes de consultar. */
export async function loadReceiptData() {
  const rows = await db.select({ resource: crmRecords.resource, id: crmRecords.id, data: crmRecords.data, deleted: crmRecords.deleted }).from(crmRecords).where(sql`${crmRecords.resource} in ('charges','entries','deals','clients')`)
  const data = <T,>(resource: string) => rows.filter(r => r.resource === resource && !r.deleted).map(r => ({ ...r.data, id: r.id }) as T)
  const charges = rows.filter(r => r.resource === "charges").map(r => ({ ...r.data, id: r.id, ...(r.deleted ? { deletedAt: "archived" } : {}) }) as unknown as Charge)
  const deals = data<Deal>("deals")
  const entries = data<FinancialEntry>("entries")
  return { ...collectReceipts(charges, entries, deals, data<Client>("clients")), deals, contractReceivables: collectContractReceivables(charges, entries, deals) }
}
