export class GoogleCalendarError extends Error {
  readonly status: number
  readonly reason: string
  constructor(status: number, reason = "") {
    super(reason === "invalid_grant" || status === 401 ? "A autorização do Google expirou ou foi revogada. Conecte sua conta novamente." : status === 412 ? "Este evento mudou no Google. Sincronize a agenda antes de salvar novamente." : status === 403 ? "O Google não permitiu esta operação. Confira o acesso à agenda ou reconecte sua conta." : status === 429 ? "O Google limitou as consultas. Aguarde um pouco e tente novamente." : `Não foi possível concluir a operação no Google Agenda (${status}).`)
    this.status = status; this.reason = reason
  }
}
async function responseJson<T>(response: Response): Promise<T> {
  if (response.status === 204) return {} as T
  let data: Record<string, unknown>
  try { data = await response.json() } catch { throw new GoogleCalendarError(response.status || 502) }
  if (!response.ok || data.error) {
    const error = data.error
    const reason = typeof error === "string" ? error : ""
    throw new GoogleCalendarError(response.status, reason)
  }
  return data as T
}
export async function googleTokenRequest<T>(params: Record<string, string>): Promise<T> {
  let response: Response
  try { response = await fetch("https://oauth2.googleapis.com/token", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams(params), cache: "no-store", signal: AbortSignal.timeout(20000) }) }
  catch { throw new Error("Não foi possível acessar o Google. Tente novamente em alguns instantes.") }
  return responseJson<T>(response)
}
export async function googleCalendarRequest<T>(path: string, token: string, options: { method?: string; body?: unknown; params?: Record<string, string>; etag?: string } = {}): Promise<T> {
  if (!path.startsWith("/") || path.includes("..") || path.startsWith("//")) throw new Error("Caminho de agenda inválido.")
  const url = new URL(`https://www.googleapis.com/calendar/v3${path}`)
  for (const [key, value] of Object.entries(options.params || {})) url.searchParams.set(key, value)
  let response: Response
  try { response = await fetch(url, { method: options.method || "GET", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...(options.etag ? { "If-Match": options.etag } : {}) }, body: options.body === undefined ? undefined : JSON.stringify(options.body), cache: "no-store", signal: AbortSignal.timeout(20000) }) }
  catch { throw new Error("O Google não confirmou a operação. Atualize a agenda antes de tentar novamente.") }
  return responseJson<T>(response)
}
export async function googleIdentity(token: string) {
  let response: Response
  try { response = await fetch("https://openidconnect.googleapis.com/v1/userinfo", { headers: { Authorization: `Bearer ${token}` }, cache: "no-store", signal: AbortSignal.timeout(15000) }) }
  catch { throw new Error("Não foi possível identificar a conta Google.") }
  return responseJson<{ sub: string; email: string; email_verified?: boolean }>(response)
}
