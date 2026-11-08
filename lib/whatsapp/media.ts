import { and, eq } from "drizzle-orm"
import { z } from "zod"
import { db, whatsappMessages } from "@/lib/db"
import { requireUser } from "@/lib/auth/session"
import { evolutionRequest } from "./client"

export const MEDIA_MAX_BYTES = 12 * 1024 * 1024
const extensions: Record<string, string> = {
  "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif",
  "audio/ogg": "ogg", "audio/mpeg": "mp3", "audio/mp4": "m4a", "audio/wav": "wav", "audio/x-wav": "wav", "audio/webm": "webm", "audio/flac": "flac",
  "application/pdf": "pdf", "text/plain": "txt", "text/csv": "csv",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
}
export async function authorizedMediaMessage(id: string) {
  const user = await requireUser()
  if (!["admin", "comercial", "operacao"].includes(user.role)) throw Error("Sem permissão para acessar arquivos do WhatsApp.")
  z.string().regex(/^[a-f0-9]{64}$/).parse(id)
  const instance = process.env.EVOLUTION_INSTANCE || "crm-principal"
  const [message] = await db.select().from(whatsappMessages).where(and(eq(whatsappMessages.id, id), eq(whatsappMessages.instance, instance))).limit(1)
  if (!message || !["imageMessage", "audioMessage", "documentMessage", "stickerMessage"].includes(message.messageType)) throw Error("Arquivo não encontrado ou tipo indisponível.")
  return { user, message }
}

export function decodeMedia(raw: { base64?: string; mimetype?: string; fileName?: string }, messageType: string) {
  const mime = String(raw.mimetype || "").split(";")[0].trim().toLowerCase()
  if (!extensions[mime]) throw Error("Formato não suportado. Use imagens, PDF, DOCX, XLSX, TXT, CSV ou áudio.")
  if (messageType === "audioMessage" && !mime.startsWith("audio/") || ["imageMessage", "stickerMessage"].includes(messageType) && !mime.startsWith("image/")) throw Error("O formato do arquivo não corresponde à mensagem.")
  const base64 = String(raw.base64 || "").replace(/^data:[^,]+;base64,/, "").replace(/\s/g, "")
  if (!base64 || base64.length > Math.ceil(MEDIA_MAX_BYTES / 3) * 4 || !/^[A-Za-z0-9+/]*={0,2}$/.test(base64)) throw Error("Arquivo indisponível, inválido ou maior que 12 MB.")
  const bytes = Buffer.from(base64, "base64")
  if (!bytes.length || bytes.length > MEDIA_MAX_BYTES) throw Error("Arquivo indisponível ou maior que 12 MB.")
  const start = bytes.subarray(0, 12)
  const valid = mime === "application/pdf" ? start.toString().startsWith("%PDF-")
    : mime === "image/png" ? start.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]))
    : mime === "image/jpeg" ? start[0] === 255 && start[1] === 216 && start[2] === 255
    : mime === "image/webp" ? start.toString("ascii", 0, 4) === "RIFF" && start.toString("ascii", 8, 12) === "WEBP"
    : mime === "image/gif" ? /^GIF8[79]a/.test(start.toString("ascii"))
    : mime.includes("openxmlformats") ? start[0] === 80 && start[1] === 75
    : mime === "audio/ogg" ? start.toString("ascii", 0, 4) === "OggS"
    : true
  if (!valid) throw Error("O conteúdo do arquivo não corresponde ao formato informado.")
  const name = String(raw.fileName || "arquivo").replace(/[\x00-\x1f\x7f/\\"<>:]/g, "_").slice(0, 100).replace(/\.[^.]+$/, "")
  return { bytes, mime, filename: `${name || "arquivo"}.${extensions[mime]}` }
}

export async function fetchMessageMedia(message: typeof whatsappMessages.$inferSelect) {
  // A chave vem do banco. Nunca buscar URLs ou aceitar chaves de mídia fornecidas pelo navegador.
  const raw = await evolutionRequest<{ base64?: string; mimetype?: string; fileName?: string }>(`/chat/getBase64FromMediaMessage/${message.instance}`, "POST",
    { message: { key: { id: message.providerId, remoteJid: message.remoteJid, fromMe: message.direction === "out" } }, convertToMp4: false }, 18 * 1024 * 1024)
  return decodeMedia(raw, message.messageType)
}
