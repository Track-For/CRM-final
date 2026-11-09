"use client"

import Image from "next/image"
import { useCallback, useEffect, useRef, useState } from "react"
import { Loader2, QrCode, RefreshCw, Unplug } from "lucide-react"
import { toast } from "@/lib/store/save-feedback"
import { Button } from "@/components/ui/button"
import { Panel } from "@/components/shared/panel"
import { connectWhatsapp, disconnectWhatsapp, getWhatsappConnection } from "@/lib/whatsapp/actions"

export function WhatsappConnectionCard({ canManage = true, onConnectionChange }: { canManage?: boolean; onConnectionChange?: (state: string) => void }) {
  const [state, setState] = useState<Awaited<ReturnType<typeof getWhatsappConnection>> | null>(null)
  const [image, setImage] = useState("")
  const [busy, setBusy] = useState(false)
  const polling = useRef(false)
  const refresh = useCallback(async () => {
    if (polling.current) return
    polling.current = true
    try {
      const result = await getWhatsappConnection()
      setState(result)
      onConnectionChange?.(result.state)
      if (result.state === "open") setImage("")
    } catch (e) { setState({ state: "unavailable", expectedPhone: "", error: e instanceof Error ? e.message : "Falha ao consultar conexão" }) }
    finally { polling.current = false }
  }, [onConnectionChange])
  useEffect(() => { const initial = setTimeout(() => void refresh(), 0); const timer = setInterval(() => void refresh(), 5000); return () => { clearTimeout(initial); clearInterval(timer) } }, [refresh])
  async function connect() {
    setBusy(true)
    try {
      const result = await connectWhatsapp()
      setState(result.connection); setImage(result.image)
      onConnectionChange?.(result.connection.state)
      if (!result.image && result.connection.state !== "open") toast.info("O WhatsApp está preparando o QR Code. Aguarde alguns segundos e clique novamente.")
    } catch (e) { toast.error(e instanceof Error ? e.message : "Falha ao gerar QR Code") }
    finally { setBusy(false) }
  }
  async function disconnect() {
    setBusy(true)
    try { await disconnectWhatsapp(); setImage(""); onConnectionChange?.("close"); await refresh(); toast.success("WhatsApp desconectado") }
    catch (e) { toast.error(e instanceof Error ? e.message : "Falha ao desconectar") }
    finally { setBusy(false) }
  }
  return <Panel title="Conexão do WhatsApp" description={state?.expectedPhone ? `Número de referência: +${state.expectedPhone}` : "Conecte o número que você já usa pelo QR Code."} actions={<Button variant="ghost" size="icon" aria-label="Atualizar conexão" onClick={() => void refresh()}><RefreshCw /></Button>}>
    <div className="flex flex-wrap items-center justify-between gap-3"><p className="text-sm" role="status"><span className={`mr-2 inline-block size-2 rounded-full ${state?.state === "open" ? "bg-green-500" : "bg-amber-500"}`} />{!state ? "Verificando conexão…" : state.state === "open" ? "WhatsApp conectado" : state.state === "connecting" ? "Aguardando leitura do QR Code" : "WhatsApp desconectado"}</p>{canManage && (state?.state === "open" ? <Button variant="outline" disabled={busy} onClick={() => void disconnect()}><Unplug />Desconectar</Button> : <Button disabled={busy} onClick={() => void connect()}>{busy ? <Loader2 className="animate-spin" /> : <QrCode />}{image ? "Renovar QR Code" : "Gerar QR Code"}</Button>)}</div>
    {state?.error && <p className="mt-3 text-sm text-destructive" role="alert">{state.error}</p>}
    {image && <div className="mt-5 flex flex-col items-center gap-3"><div className="rounded-lg bg-white p-3"><Image unoptimized src={image} width={280} height={280} alt="QR Code real para conectar o WhatsApp" /></div><p className="max-w-md text-center text-sm text-muted-foreground">No celular deste número, abra WhatsApp → Aparelhos conectados → Conectar aparelho e leia o código. O status atualiza automaticamente. Se o código expirar, clique em Renovar QR Code.</p></div>}
  </Panel>
}
