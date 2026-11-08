"use client"
import { useState } from "react"
import Image from "next/image"
import { FileDown, Loader2, Sparkles } from "lucide-react"
import { Button } from "@/components/ui/button"
import { analyzeWhatsappMedia } from "@/lib/whatsapp/media-actions"

export function MessageMedia({ id, type, reading }: { id: string; type: string; reading?: string }) {
  const [text, setText] = useState(reading || "")
  const [busy, setBusy] = useState(false)
  const [preview, setPreview] = useState(false)
  const [error, setError] = useState("")
  const src = `/api/whatsapp/media/${id}`
  if (type === "stickerMessage") return <div className="mt-2 space-y-2">
    <a href={src} target="_blank" rel="noopener noreferrer" aria-label="Abrir figurinha do WhatsApp">
      <Image unoptimized width={160} height={160} src={src} alt="Figurinha do WhatsApp" className="h-40 w-40 max-w-full object-contain" onError={() => setError("A figurinha não está disponível no provedor.")} />
    </a>
    {error && <p role="alert" className="max-w-sm text-xs text-destructive">{error}</p>}
  </div>
  if (!["imageMessage", "audioMessage", "documentMessage"].includes(type)) return null
  async function analyze() {
    if (busy) return
    setBusy(true); setError("")
    try { setText((await analyzeWhatsappMedia(id)).text) }
    catch (e) { setError(e instanceof Error ? e.message : "Falha ao ler arquivo.") }
    finally { setBusy(false) }
  }
  return <div className="mt-2 space-y-2">
    {type === "audioMessage" && <audio controls preload="none" src={src} className="max-w-full" onError={() => setError("Não foi possível reproduzir o áudio. Baixe o arquivo ou tente transcrever.")} />}
    {type === "imageMessage" && <>{preview ? <a href={src} target="_blank" rel="noopener noreferrer"><Image unoptimized width={512} height={512} src={src} alt="Imagem recebida no WhatsApp" className="max-h-64 max-w-full rounded-lg" onError={() => setError("A imagem não está disponível no provedor.")} /></a> : <Button size="xs" variant="outline" onClick={() => setPreview(true)}>Ver imagem</Button>}</>}
    <div className="flex flex-wrap gap-2">
      <Button size="xs" variant="outline" asChild><a href={src} target="_blank" rel="noopener noreferrer" download><FileDown />Abrir arquivo</a></Button>
      {!(text || reading) && <Button size="xs" variant="outline" disabled={busy} onClick={() => void analyze()}>{busy ? <Loader2 className="animate-spin" /> : <Sparkles />}{type === "audioMessage" ? "Transcrever áudio" : "Ler com IA"}</Button>}
    </div>
    {!(text || reading) && <p className="max-w-sm text-[11px] text-muted-foreground">Ao solicitar a leitura, este arquivo será enviado à OpenAI e usará créditos da API.</p>}
    {(text || reading) && <details open className="max-w-lg text-sm"><summary className="cursor-pointer text-xs font-medium">{type === "audioMessage" ? "Transcrição do áudio" : "Leitura do arquivo"} · IA</summary><p className="mt-2 whitespace-pre-wrap break-words">{text || reading}</p><p className="mt-1 text-[11px] text-muted-foreground">Confira o original. A IA pode cometer erros.</p></details>}
    {error && <p role="alert" className="max-w-sm text-xs text-destructive">{error}</p>}
  </div>
}
