const reserved = new Set(["www", "app", "api", "admin", "mail", "smtp", "imap", "static", "assets"])
export function workspaceSlug(value: string) {
  if (!/^[a-z0-9](?:[a-z0-9-]{1,46}[a-z0-9])$/.test(value) || reserved.has(value)) throw Error("Use de 3 a 48 letras minúsculas, números ou hífens no endereço da empresa.")
  return value
}
export function slugFromHost(host: string, base: string): string | null {
  const hostname = host.toLowerCase().replace(/:\d+$/, "").replace(/\.$/, "")
  const domain = base.toLowerCase().replace(/:\d+$/, "").replace(/\.$/, "")
  if (domain === "localhost" && hostname === "127.0.0.1") return null
  if (hostname === domain || hostname === `www.${domain}`) return null
  if (!hostname.endsWith(`.${domain}`)) throw Error("Endereço de empresa não reconhecido.")
  return workspaceSlug(hostname.slice(0, -(domain.length + 1)))
}
export function schemaForWorkspace(id: string) {
  if (!/^[a-f0-9]{32}$/.test(id)) throw Error("Identificador de empresa inválido.")
  return `tenant_${id}`
}
