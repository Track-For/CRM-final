import type { NextRequest } from "next/server"
import { sql } from "drizzle-orm"
import { db, crmRecords } from "@/lib/db"
import { identifier } from "@/lib/commercial/model"
import { API_RESOURCES, projectApiRecord } from "@/lib/integrations/api-contract"
import { ApiError, apiFailure, apiPipelines, authorizeApi, patchApiRecord, readApiBody } from "@/lib/integrations/api-server"
type Context = { params: Promise<{ resource: string; id: string }> }
export async function GET(request: NextRequest, context: Context) {
  try {
    const { resource, id } = await context.params
    identifier.parse(id)
    if (!(API_RESOURCES as readonly string[]).includes(resource)) throw new ApiError(404, "Recurso não encontrado.")
    await authorizeApi(request, `${resource}:read`)
    const row = resource === "pipelines" ? (await apiPipelines()).find(p => p.id === id) : (await db.select({ data: crmRecords.data }).from(crmRecords).where(sql`${crmRecords.resource}=${resource} and ${crmRecords.id}=${id} and ${crmRecords.deleted}=false and coalesce(${crmRecords.data}->>'deletedAt','')='' and coalesce(${crmRecords.data}->>'conversionReverted','false')<>'true'`).limit(1))[0]?.data
    if (!row) throw new ApiError(404, "Registro não encontrado.")
    return Response.json({ data: projectApiRecord(resource, id, { ...row }) }, { headers: { "Cache-Control": "no-store" } })
  } catch (error) { return apiFailure(error) }
}
export async function PATCH(request: NextRequest, context: Context) {
  try {
    const { resource, id } = await context.params
    identifier.parse(id)
    await authorizeApi(request, `${resource}:write`)
    const data = await patchApiRecord(resource, id, await readApiBody(request))
    return Response.json({ data: projectApiRecord(resource, id, data) }, { headers: { "Cache-Control": "no-store" } })
  } catch (error) { return apiFailure(error) }
}
