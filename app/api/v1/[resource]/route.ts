import { type NextRequest } from "next/server"
import { sql } from "drizzle-orm"
import { z } from "zod"
import { db, crmRecords } from "@/lib/db"
import { API_RESOURCES, pagination, projectApiRecord } from "@/lib/integrations/api-contract"
import { ApiError, apiFailure, apiPipelines, authorizeApi, createApiRecord, patchApiRecord, readApiBody } from "@/lib/integrations/api-server"

type Context = { params: Promise<{ resource: string }> }
export async function GET(request: NextRequest, context: Context) {
  try {
    const { resource } = await context.params
    if (!(API_RESOURCES as readonly string[]).includes(resource)) throw new ApiError(404, "Recurso não encontrado.")
    await authorizeApi(request, `${resource}:read`)
    const { limit, offset } = pagination(request.nextUrl.searchParams)
    const filters = [sql`${crmRecords.resource}=${resource}`, sql`${crmRecords.deleted}=false`, sql`coalesce(${crmRecords.data}->>'deletedAt','')=''`, sql`coalesce(${crmRecords.data}->>'conversionReverted','false')<>'true'`]
    for (const key of ["ownerId", "assigneeId", "status", "stage", "pipelineId", "source", "clientId", "leadId", "dealId"]) {
      const value = request.nextUrl.searchParams.get(key)
      if (value) { z.string().max(120).parse(value); filters.push(sql`${crmRecords.data}->>${key}=${value}`) }
    }
    if (resource === "pipelines") {
      const all = await apiPipelines()
      return Response.json({ data: all.slice(offset, offset + limit), total: all.length, limit, offset, hasMore: offset + limit < all.length }, { headers: { "Cache-Control": "no-store" } })
    }
    const result = await db.execute(sql`with filtered as (select id,data from crm_records where ${sql.join(filters, sql` and `)}) select (select count(*)::int from filtered) as total,coalesce((select jsonb_agg(row_to_json(page)) from (select id,data from filtered order by id limit ${limit} offset ${offset}) page),'[]'::jsonb) as records`)
    const [summary] = result as unknown as { total: number; records: { id: string; data: Record<string, unknown> }[] }[]
    return Response.json({ data: summary.records.map(r => projectApiRecord(resource, r.id, r.data)), total: summary.total, limit, offset, hasMore: offset + limit < summary.total }, { headers: { "Cache-Control": "no-store" } })
  } catch (error) { return apiFailure(error) }
}
export async function POST(request: NextRequest, context: Context) {
  try {
    const { resource } = await context.params
    const keyId = await authorizeApi(request, `${resource}:write`)
    const input = await readApiBody(request)
    // Compatibilidade com integrações anteriores que atualizam negócios por POST.
    if (resource === "deals" && input && typeof input === "object" && "id" in input) {
      const { id, ...patch } = input
      z.string().min(1).max(120).parse(id)
      const data = await patchApiRecord(resource, id, patch)
      return Response.json({ data: projectApiRecord(resource, id, data) }, { headers: { "Cache-Control": "no-store" } })
    }
    const result = await createApiRecord(resource, input, keyId, request.headers.get("Idempotency-Key"))
    return Response.json({ data: projectApiRecord(resource, String(result.data.id), result.data), replayed: result.replayed }, { status: result.replayed ? 200 : 201, headers: { "Cache-Control": "no-store", Location: `/api/v1/${resource}/${result.data.id}` } })
  } catch (error) { return apiFailure(error) }
}
