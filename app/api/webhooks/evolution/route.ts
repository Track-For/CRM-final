import { connectionEnv } from "@/lib/saas/connections"
import { timingSafeEqual } from "node:crypto"
import { object, messageRows } from "@/lib/whatsapp/normalize"
import { storeMessages, updateDelivery, learnContactMappings } from "@/lib/whatsapp/storage"

export const runtime = "nodejs"
export async function POST(request: Request) {
  const token = (await connectionEnv()).EVOLUTION_WEBHOOK_TOKEN
  const received = request.headers.get("x-webhook-token") || ""
  if (!token || Buffer.byteLength(token) !== Buffer.byteLength(received) || !timingSafeEqual(Buffer.from(token), Buffer.from(received))) {
    return Response.json({ error: "Não autorizado" }, { status: 401 })
  }
  const body = await request.text()
  if (Buffer.byteLength(body) > 5_000_000) return Response.json({ error: "Evento muito grande" }, { status: 413 })
  let payload: Record<string, unknown>
  try { payload = object(JSON.parse(body)) } catch { return Response.json({ error: "JSON inválido" }, { status: 400 }) }
  const instance = (await connectionEnv()).EVOLUTION_INSTANCE || "crm-principal"
  if (payload.instance !== instance) return Response.json({ error: "Instância inválida" }, { status: 400 })
  const event = String(payload.event || "").toLowerCase().replaceAll("_", ".")
  const list = messageRows(payload.data)
  try {
    if (["messages.upsert", "messages.set", "send.message"].includes(event)) await storeMessages(instance, list, { assumeOutgoing: event === "send.message" })
    if (["contacts.upsert", "contacts.update", "contacts.set"].includes(event)) await learnContactMappings(instance, list)
    if (event === "messages.update") await updateDelivery(instance, list)
    return Response.json({ ok: true })
  } catch {
    return Response.json({ error: "Não foi possível persistir o evento" }, { status: 500 })
  }
}
