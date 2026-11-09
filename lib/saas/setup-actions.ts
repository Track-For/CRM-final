"use server"
import { sql } from "drizzle-orm"
import { requireUser } from "@/lib/auth/session"
import { db, crmRecords } from "@/lib/db"
import { initialDatabase } from "@/lib/data/initial"
import { currentWorkspace } from "./context"
import { controlSql } from "./control"
import { setupSchema, workspaceSetupPlan } from "./setup-model"
import { pipelines } from "@/lib/mock/static"
import type { CatalogItem, Company } from "@/types"
export async function loadWorkspaceSetup() {
  const user = await requireUser()
  if (user.role !== "admin") throw Error("A configuração da empresa deve ser concluída pelo administrador.")
  const rows = await db.select().from(crmRecords).where(sql`${crmRecords.resource} in ('settings','catalog') and ${crmRecords.deleted}=false`)
  return { company: (rows.find(r=>r.resource==='settings'&&r.id==='company')?.data.company || initialDatabase.company) as Company, catalog: rows.filter(r=>r.resource==='catalog').map(r=>({...r.data,id:r.id}) as unknown as CatalogItem) }
}
export async function saveWorkspaceSetup(input: unknown) {
  const user = await requireUser()
  if (user.role !== "admin") throw Error("Somente o administrador pode configurar a empresa.")
  const value = setupSchema.parse(input)
  const workspace = await currentWorkspace()
  if (!workspace) throw Error("Esta configuração é destinada às empresas da plataforma SaaS.")
  const result = await db.transaction(async tx => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext('workspace-setup'))`)
    const rows = await tx.select().from(crmRecords).where(sql`${crmRecords.resource} in ('settings','catalog') and ${crmRecords.deleted}=false`).for("update")
    const company = (rows.find(r=>r.resource==='settings'&&r.id==='company')?.data.company || initialDatabase.company) as Company
    const catalog = rows.filter(r=>r.resource==='catalog').map(r=>({...r.data,id:r.id}) as unknown as CatalogItem)
    const plan = workspaceSetupPlan(value, company, catalog, new Date().toISOString())
    await tx.insert(crmRecords).values({ resource:'settings', id:'company', data:{ company:plan.company }, created:true, updatedBy:user.id }).onConflictDoUpdate({ target:[crmRecords.resource,crmRecords.id],set:{data:{company:plan.company},created:true,deleted:false,updatedBy:user.id,updatedAt:new Date()} })
    for (const service of plan.catalog) await tx.insert(crmRecords).values({resource:'catalog',id:service.id,data:{...service},created:true,updatedBy:user.id}).onConflictDoUpdate({target:[crmRecords.resource,crmRecords.id],set:{data:{...service},created:true,deleted:false,updatedBy:user.id,updatedAt:new Date()}})
    const pipeline = { id:'pip_services',name:'Comercial',description:'Processo comercial da empresa',stages:pipelines[0].stages.map(stage=>({...stage,name:stage.key==='call_agendada'?'Reunião agendada':stage.name})) }
    await tx.insert(crmRecords).values({resource:'pipelines',id:pipeline.id,data:pipeline,created:true,updatedBy:user.id}).onConflictDoNothing()
    return plan
  })
  // O estado de conclusão deriva dos dados persistidos, permitindo repetir após uma falha.
  await controlSql()`update saas_workspaces set name=${result.company.name},onboarded_at=coalesce(onboarded_at,now()) where id=${workspace.id}`
  return result
}
