import { eq, and } from "drizzle-orm"
import { db, crmRecords } from "@/lib/db"
import { currentWorkspace } from "./context"
import { decryptSecret } from "@/lib/fiscal/crypto"
export type ConnectionEnv = Record<string, string | undefined>
export async function connectionEnv(): Promise<ConnectionEnv> {
  if (!await currentWorkspace()) return process.env
  const [row] = await db.select({ data: crmRecords.data }).from(crmRecords).where(and(eq(crmRecords.resource,'workspaceConnections'),eq(crmRecords.id,'default'),eq(crmRecords.deleted,false))).limit(1)
  if (!row?.data.encrypted) return {}
  return JSON.parse(decryptSecret(String(row.data.encrypted))) as ConnectionEnv
}
