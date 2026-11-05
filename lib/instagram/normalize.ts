import type { InstagramMedia, InstagramProfile } from "./types"

export function mediaKind(media: InstagramMedia): "post" | "reel" | "story" {
  if (media.media_product_type === "REELS") return "reel"
  if (media.media_product_type === "STORY") return "story"
  return "post"
}
export function safeInstagramUrl(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined
  try { const url = new URL(value); return ["http:", "https:"].includes(url.protocol) ? url.href : undefined } catch { return undefined }
}
export function currentStories(items: InstagramMedia[], now = Date.now()): InstagramMedia[] {
  return items.filter(item => { const timestamp = Date.parse(item.timestamp); return Number.isFinite(timestamp) && timestamp <= now && timestamp + 24 * 60 * 60 * 1000 > now })
}
export function mergeMedia(existing: InstagramMedia[], incoming: InstagramMedia[]): InstagramMedia[] {
  const items = new Map(existing.map(item => [item.id, item]))
  for (const item of incoming) if (item.id) items.set(item.id, item)
  return [...items.values()].sort((a, b) => Date.parse(b.timestamp) - Date.parse(a.timestamp))
}
export function normalizeProfile(value: unknown): InstagramProfile {
  if (!value || typeof value !== "object") throw new Error("Perfil inválido retornado pelo Instagram.")
  const data = value as Record<string, unknown>
  if (typeof data.id !== "string" || !/^\d+$/.test(data.id) || typeof data.username !== "string") throw new Error("A Meta não retornou um perfil profissional válido.")
  const profile: InstagramProfile = { id: data.id, username: data.username }
  for (const key of ["name", "biography", "website", "profile_picture_url"] as const) if (typeof data[key] === "string") profile[key] = data[key]
  for (const key of ["followers_count", "follows_count", "media_count"] as const) if (typeof data[key] === "number" && Number.isFinite(data[key])) profile[key] = data[key]
  return profile
}
export function normalizeMedia(value: unknown): InstagramMedia[] {
  if (!Array.isArray(value)) throw new Error("Lista de mídias inválida retornada pelo Instagram.")
  return value.flatMap(item => {
    if (!item || typeof item !== "object" || typeof item.id !== "string" || !/^\d+$/.test(item.id) || !["IMAGE", "VIDEO", "CAROUSEL_ALBUM"].includes(item.media_type) || !Number.isFinite(Date.parse(item.timestamp))) return []
    const media: InstagramMedia = { id: item.id, timestamp: item.timestamp, media_type: item.media_type }
    for (const key of ["caption", "media_product_type", "media_url", "thumbnail_url", "permalink"] as const) if (typeof item[key] === "string") media[key] = item[key]
    for (const key of ["like_count", "comments_count"] as const) if (typeof item[key] === "number") media[key] = item[key]
    if (Array.isArray(item.children?.data)) media.children = { data: normalizeMedia(item.children.data) }
    return [media]
  })
}
export function validateRedirectUri(input: string): string {
  const url = new URL(input)
  const local = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)
  if ((url.protocol !== "https:" && !(local && url.protocol === "http:")) || url.username || url.password || url.search || url.hash || url.pathname !== "/api/instagram/callback") {
    throw new Error("Use uma URL HTTPS terminada em /api/instagram/callback. HTTP só é permitido em localhost.")
  }
  return url.toString()
}
