import { createHash, timingSafeEqual } from "node:crypto"
import type { AsaasPayment } from "@/lib/boleto/asaas"
import { applyWebhookPayment, isEventProcessed, markEventProcessed, readWebhookToken } from "@/lib/boleto/sync"

export const maxDuration = 60

/** Compara os hashes: tempo constante, sem revelar nem o tamanho do token. */
function sameToken(received: string, expected: string): boolean {
  const digest = (value: string) => createHash("sha256").update(value).digest()
  return timingSafeEqual(digest(received), digest(expected))
}

function reply(status: number) {
  return Response.json({ ok: status === 200 }, { status, headers: { "Cache-Control": "no-store" } })
}

type WebhookBody = { id?: unknown; event?: unknown; payment?: Partial<AsaasPayment> | null }

function parseBody(text: string): { id: string; event: string; payment: AsaasPayment } | null {
  let body: WebhookBody
  try {
    body = JSON.parse(text) as WebhookBody
  } catch {
    return null
  }
  const { id, event, payment } = body ?? {}
  if (typeof id !== "string" || !id || typeof event !== "string" || !event) return null
  if (!payment || typeof payment !== "object" || typeof payment.id !== "string" || !payment.id) return null
  return { id, event, payment: payment as AsaasPayment }
}

export async function POST(request: Request) {
  try {
    const expected = await readWebhookToken()
    const received = request.headers.get("asaas-access-token")
    if (!expected || !received || !sameToken(received, expected)) return reply(401)

    // Eventos que não são de cobrança respondem 200: um erro aqui só faria o Asaas pausar a fila.
    const parsed = parseBody(await request.text())
    if (!parsed) return reply(200)

    if (await isEventProcessed(parsed.id)) return reply(200)
    await applyWebhookPayment(parsed.event, parsed.payment)
    // Marca só depois de gravar: se algo falhar, o 500 faz o Asaas reenviar e nada se perde.
    await markEventProcessed(parsed.id, parsed.event, parsed.payment.id)
    return reply(200)
  } catch (err) {
    console.error("[boleto] falha ao processar webhook:", err instanceof Error ? err.message : err)
    return reply(500)
  }
}
