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
export async function evolutionRequest<T>(path: string, method = "GET", body?: unknown): Promise<T> {
  const { url, key } = evolutionConfig()
  let response: Response
  try {
    response = await fetch(`${url}${path}`, { method, headers: { apikey: key, "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body), cache: "no-store", signal: AbortSignal.timeout(20000) })
  } catch { throw new Error("Não foi possível acessar o servidor do WhatsApp. Verifique se o serviço Evolution está rodando.") }
  if (!response.ok) throw new EvolutionError(response.status)
  if (response.status === 204) return {} as T
  const result = await response.json()
  if (result?.error === true) throw new Error("A Evolution API não conseguiu concluir a operação. Tente novamente.")
  return result
}
