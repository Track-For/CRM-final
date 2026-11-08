import { lookup } from "node:dns/promises"
import { request } from "node:https"
import { createHmac, randomUUID } from "node:crypto"
import { webhookUrl, isPublicAddress } from "@/lib/security/webhook-url"
import type { Webhook } from "@/types"

export async function deliverWebhook(webhook: Webhook, event: string, data: unknown, delivery: string = randomUUID()) {
  const url = webhookUrl(webhook.url)
  const addresses = await lookup(url.hostname, { all: true })
  if (!addresses.length || addresses.some(item => !isPublicAddress(item.address))) throw new Error("O destino do webhook não é público.")
  const target = addresses[0]
  const body = JSON.stringify({ event, delivery, data })
  const start = Date.now()
  const status = await new Promise<number>((resolve, reject) => {
    const req = request(url, { method: "POST", family: target.family, lookup: (_hostname, _options, callback) => callback(null, target.address, target.family), headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(body), "X-Solid-Event": event, "X-Solid-Delivery": delivery, "X-Solid-Signature": createHmac("sha256", webhook.secret).update(body).digest("hex") } }, response => { resolve(response.statusCode || 502); response.destroy() })
    req.setTimeout(8000, () => req.destroy(new Error("O destino não respondeu em 8 segundos.")))
    req.on("error", reject); req.end(body)
  })
  return { status, ms: Date.now() - start }
}
export { sendAndLog, dispatchCrmEvent } from "./webhook-queue"
