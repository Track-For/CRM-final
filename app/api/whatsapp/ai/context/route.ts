import { ContextError, getHermesCustomerContext } from "@/lib/whatsapp/ai/context"
export const runtime = "nodejs"
const headers = { "Cache-Control": "no-store, private", "Pragma": "no-cache" }
export async function POST(request: Request) {
  try {
    const raw = await request.text()
    if (Buffer.byteLength(raw) > 2048) return Response.json({ error: "Requisição muito grande." }, { status: 413, headers })
    let input: unknown
    try { input = JSON.parse(raw) } catch { return Response.json({ error: "JSON inválido." }, { status: 400, headers }) }
    return Response.json({ data: await getHermesCustomerContext(request.headers.get("authorization"), input) }, { headers })
  } catch (error) {
    return Response.json({ error: error instanceof ContextError ? error.message : "Consulta indisponível. Encaminhe o atendimento para a equipe." }, { status: error instanceof ContextError ? error.status : 503, headers })
  }
}
