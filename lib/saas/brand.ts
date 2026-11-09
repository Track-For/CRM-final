import { cache } from "react"
import { sql } from "drizzle-orm"
import { currentWorkspace } from "./context"
import { db, crmRecords } from "@/lib/db"
import type { Company } from "@/types"
export const workspaceBrand = cache(async () => {
  const workspace = await currentWorkspace()
  if (!workspace) return undefined
  const [row] = await db.select({data:crmRecords.data}).from(crmRecords).where(sql`${crmRecords.resource}='settings' and ${crmRecords.id}='company' and ${crmRecords.deleted}=false`).limit(1)
  const company = row?.data.company as Company | undefined
  const profile = company?.businessProfile
  return {brandName:profile?.brandName || workspace.name,brandColor:profile?.brandColor || '#2563eb',logo:profile?.logo || ''}
})
