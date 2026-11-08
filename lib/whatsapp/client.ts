import { z } from "zod"

export class EvolutionError extends Error {
  constructor(public status: number) { super(`Evolution API respondeu com erro (${status}).`) }
}
export function evolutionConfig() {
  const url = process.env.EVOLUTION_URL
  const key = process.env.EVOLUTION_API_KEY
  const instance = process.env.EVOLUTION_INSTANCE || "crm-principal"
  if (!url || !key) throw new Error("WhatsApp ainda não configurado. Inicie o serviço com npm run whatsapp:local.")
  z.string().regex(/^[a-zA-Z0-9_-]{1,80}$/).parse(instance)
  return { url: url.replace(/\/$/, ""), key, instance }
}
export async function evolutionRequest<T>(path: string, method = "GET", body?: unknown, maxBytes?: number): Promise<T> {
  const { url, key } = evolutionConfig()
  let response: Response
  try {
    response = await fetch(`${url}${path}`, { method, headers: { apikey: key, "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body), cache: "no-store", signal: AbortSignal.timeout(20000) })
  } catch { throw new Error("Não foi possível acessar o servidor do WhatsApp. Verifique se o serviço Evolution está rodando.") }
  if (!response.ok) throw new EvolutionError(response.status)
  if (response.status === 204) return {} as T
  let result
  if (maxBytes) {
    if (Number(response.headers.get("content-length")) > maxBytes) { await response.body?.cancel(); throw Error("Arquivo acima do limite permitido.") }
    const reader = response.body?.getReader()
    if (!reader) throw Error("O provedor não retornou o arquivo.")
    const chunks: Uint8Array[] = []; let size = 0
    try {
      while (true) {
        const part = await reader.read()
        if (part.done) break
        size += part.value.length
        if (size > maxBytes) throw Error("Arquivo acima do limite permitido.")
        chunks.push(part.value)
      }
      result = JSON.parse(Buffer.concat(chunks).toString("utf8"))
    } finally { await reader.cancel().catch(() => {}) }
  } else result = await response.json()
  if (result?.error === true) throw new Error("A Evolution API não conseguiu concluir a operação. Tente novamente.")
  return result
}
