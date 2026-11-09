/** Links coletados podem vir sem protocolo; somente navegação HTTP(S) é permitida. */
export function prospectUrl(value?: string, social?: "instagram" | "facebook") {
  const text = value?.trim()
  if (!text) return undefined
  const normalized = social && /^@?[\w.]+$/.test(text) ? `https://${social}.com/${text.replace(/^@/, "")}` : text
  if (/^[a-z][a-z\d+.-]*:/i.test(normalized) && !/^https?:\/\//i.test(normalized)) return undefined
  try {
    const url = new URL(/^https?:\/\//i.test(normalized) ? normalized : `https://${normalized}`)
    return ["http:", "https:"].includes(url.protocol) && url.hostname.includes(".") && !url.username && !url.password ? url.href : undefined
  } catch { return undefined }
}
