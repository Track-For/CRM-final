import { isIP } from "node:net"
export function isPublicAddress(address: string): boolean {
  if (isIP(address) === 6) return /^[23][0-9a-f]{3}:/i.test(address) && !/^2001:(?:db8|0*:)/i.test(address)
  if (isIP(address) !== 4) return false
  const [a, b] = address.split(".").map(Number)
  return !(a === 0 || a === 10 || a === 127 || a >= 224 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && (b === 168 || b === 0 || b === 2)) || (a === 100 && b >= 64 && b <= 127) || (a === 198 && (b === 18 || b === 19 || b === 51)) || (a === 203 && b === 0))
}
export function webhookUrl(value: string): URL {
  const url = new URL(value)
  if (url.protocol !== "https:" || url.username || url.password || url.hash || (url.port && url.port !== "443")) throw new Error("Use uma URL HTTPS pública na porta 443, sem credenciais.")
  const hostname = url.hostname.replace(/^\[|\]$/g, "")
  if (hostname === "localhost" || hostname.endsWith(".localhost") || (isIP(hostname) && !isPublicAddress(hostname))) throw new Error("O webhook exige um endereço público.")
  return url
}
