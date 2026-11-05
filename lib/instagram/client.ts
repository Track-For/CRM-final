import { createHmac } from "node:crypto"

export class InstagramApiError extends Error {
  readonly code: number
  readonly httpStatus: number

  constructor(code: number, httpStatus: number) {
    super(code === 190 ? "A autorização do Instagram expirou ou foi revogada. Conecte a conta novamente." : [10, 200].includes(code) ? "A Meta não liberou a permissão necessária. Reconecte e confira as permissões do aplicativo." : code === 4 || code === 613 ? "O Instagram limitou temporariamente as consultas. Tente novamente mais tarde." : `Não foi possível consultar o Instagram (código ${code || httpStatus}).`)
    this.code = code
    this.httpStatus = httpStatus
  }
}
export async function graphRequest<T>(path: string, options: { token?: string; appSecret?: string; version: string; params?: Record<string, string> }): Promise<T> {
  if (!/^v\d+\.\d+$/.test(options.version) || !/^[a-zA-Z0-9_/-]+$/.test(path)) throw new Error("Requisição ao Instagram inválida.")
  const url = new URL(`https://graph.facebook.com/${options.version}/${path}`)
  for (const [key, value] of Object.entries(options.params || {})) url.searchParams.set(key, value)
  if (options.token && options.appSecret) url.searchParams.set("appsecret_proof", createHmac("sha256", options.appSecret).update(options.token).digest("hex"))
  let response: Response
  try {
    response = await fetch(url, { headers: options.token ? { Authorization: `Bearer ${options.token}` } : {}, cache: "no-store", signal: AbortSignal.timeout(20000) })
  } catch { throw new Error("Não foi possível acessar a Meta. Verifique a conexão e tente novamente.") }
  let body: Record<string, unknown>
  try { body = await response.json() } catch { throw new Error("A Meta retornou uma resposta inválida.") }
  if (!response.ok || body.error) {
    const error = body.error as { code?: number } | undefined
    throw new InstagramApiError(error?.code || 0, response.status)
  }
  return body as T
}
export const PROFILE_FIELDS = "id,username,name,biography,website,profile_picture_url,followers_count,follows_count,media_count"
export const MEDIA_FIELDS = "id,caption,media_type,media_product_type,media_url,thumbnail_url,permalink,timestamp,like_count,comments_count,children{id,media_type,media_url,thumbnail_url,timestamp}"
export const STORY_FIELDS = "id,media_type,media_url,thumbnail_url,permalink,timestamp"
