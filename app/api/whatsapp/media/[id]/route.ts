import { getCurrentUser } from "@/lib/auth/session"
import { authorizedMediaMessage, fetchMessageMedia } from "@/lib/whatsapp/media"

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser()
  if (!user) return Response.json({ error: "Não autenticado." }, { status: 401 })
  if (!["admin", "comercial", "operacao"].includes(user.role)) return Response.json({ error: "Sem permissão." }, { status: 403 })
  try {
    const { message } = await authorizedMediaMessage((await params).id)
    const media = await fetchMessageMedia(message)
    const inline = media.mime.startsWith("image/") || media.mime.startsWith("audio/")
    return new Response(new Uint8Array(media.bytes), { headers: { "Content-Type": media.mime, "Content-Length": String(media.bytes.length),
      "Content-Disposition": `${inline ? "inline" : "attachment"}; filename*=UTF-8''${encodeURIComponent(media.filename)}`,
      "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff", "Content-Security-Policy": "default-src 'none'; sandbox" } })
  } catch { return Response.json({ error: "Arquivo indisponível, expirado no provedor ou em formato não suportado." }, { status: 422 }) }
}
