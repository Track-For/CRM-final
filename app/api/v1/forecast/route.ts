import type { NextRequest } from "next/server"
import { apiFailure, apiPipelines, authorizeApi } from "@/lib/integrations/api-server"
import { monthSchema } from "@/lib/commercial/model"
import { forecast, localDay } from "@/lib/commercial/metrics"
import { loadReceiptData } from "@/lib/finance/receipt-data"
export async function GET(request: NextRequest) {
  try {
    await authorizeApi(request, "reports:read")
    const month = monthSchema.parse(request.nextUrl.searchParams.get("month") || localDay(new Date().toISOString()).slice(0, 7))
    const paid = await loadReceiptData()
    const data = forecast(paid.deals, await apiPipelines(), month, request.nextUrl.searchParams.get("ownerId") || "", request.nextUrl.searchParams.get("pipelineId") || "", paid.receipts, undefined, paid.contractReceivables)
    return Response.json({ month, currency: "BRL", data }, { headers: { "Cache-Control": "no-store" } })
  } catch (error) { return apiFailure(error) }
}
