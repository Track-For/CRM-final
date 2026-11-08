"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { Check, CheckCheck, Loader2, RefreshCw, Send, Sparkles } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { getWhatsappThread, sendWhatsappText, syncWhatsappHistory } from "@/lib/whatsapp/actions"
import { cn } from "@/lib/utils"

import { WhatsappAiAssistant } from "./ai-assistant"
import { MessageMedia } from "./message-media"
import { useUiStore } from "@/lib/store/ui-store"

type Message = Awaited<ReturnType<typeof getWhatsappThread>>[number]
export function WhatsappThread({ phone, name, className }: { phone: string; name: string; className?: string }) {
  const [assistantOpen, setAssistantOpen] = useState(false)
  const role = useUiStore(state => state.role)
  const [messages, setMessages] = useState<Message[]>([])
  const [error, setError] = useState("")
  const [text, setText] = useState("")
  const [sending, setSending] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const scroll = useRef<HTMLDivElement>(null)
  const polling = useRef(false)
  const refresh = useCallback(async () => {
    if (polling.current || !phone) return
    polling.current = true
    try { setMessages(await getWhatsappThread(phone)); setError("") }
    catch (e) { setError(e instanceof Error ? e.message : "Falha ao carregar conversa") }
    finally { polling.current = false }
  }, [phone])
  useEffect(() => { const initial = setTimeout(() => void refresh(), 0); const timer = setInterval(() => void refresh(), 5000); return () => { clearTimeout(initial); clearInterval(timer) } }, [refresh])
  useEffect(() => { scroll.current?.scrollTo({ top: scroll.current.scrollHeight }) }, [messages.length])
  const recipient = phone.endsWith("@lid") ? messages.find(message => message.phone)?.phone : phone
  async function send() {
    const value = text.trim()
    if (!value || sending || !recipient) return
    setSending(true)
    try { setMessages(await sendWhatsappText(recipient, value)); setText(""); setError("") }
    catch (e) { toast.error(e instanceof Error ? e.message : "Falha ao enviar") }
    finally { setSending(false) }
  }
  async function sync() {
    setSyncing(true)
    try { const result = await syncWhatsappHistory(phone); await refresh(); toast.success(`${result.total} mensagem(ns) consultada(s), ${result.stored} nova(s).`) }
    catch (e) { toast.error(e instanceof Error ? e.message : "Falha ao sincronizar") }
    finally { setSyncing(false) }
  }
  return <><div className={cn("flex min-h-0 flex-col rounded-xl border bg-card", className)}>
    <div className="flex items-center justify-between gap-3 border-b p-4"><div className="min-w-0"><h2 className="truncate text-sm font-semibold">{name}</h2><p className="text-xs text-muted-foreground">{recipient || "Telefone ainda não identificado"} · Conversa real</p></div><div className="flex flex-wrap gap-2">{["admin", "comercial"].includes(role) && <Button size="sm" variant="outline" disabled={!recipient} onClick={() => setAssistantOpen(true)}><Sparkles />IA</Button>}<Button size="sm" variant="outline" disabled={syncing} onClick={() => void sync()}><RefreshCw className={syncing ? "animate-spin" : ""} />Sincronizar</Button></div></div>
    {error && <p role="alert" className="p-3 text-sm text-destructive">{error}</p>}
    <div ref={scroll} className="min-h-64 flex-1 space-y-3 overflow-y-auto p-4">
      {!messages.length && <p className="py-12 text-center text-sm text-muted-foreground">Nenhuma mensagem recebida deste contato. Conecte o WhatsApp ou sincronize o histórico disponível.</p>}
      {messages.map(m => <div key={m.id} className={cn("flex", m.direction === "out" ? "justify-end" : "justify-start")}><div className={cn("max-w-[85%] rounded-xl px-3 py-2", m.direction === "out" ? "bg-primary/15" : "bg-muted")}><p className="whitespace-pre-wrap break-words text-sm">{m.text}</p><MessageMedia id={m.id} type={m.messageType} reading={m.mediaReading} /><div className="mt-1 flex items-center justify-end gap-1 text-[10px] text-muted-foreground">{new Date(m.sentAt).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}{m.direction === "out" && (m.status === "enviada" ? <Check className="size-3" /> : <CheckCheck className={cn("size-3", m.status === "lida" && "text-sky-500")} />)}</div></div></div>)}
    </div>
    <form className="flex items-end gap-2 border-t p-3" onSubmit={e => { e.preventDefault(); void send() }}><Textarea aria-label="Mensagem" placeholder={recipient ? "Escreva uma mensagem" : "O envio será liberado quando o telefone for identificado"} maxLength={10000} value={text} disabled={sending || !recipient} onChange={e => setText(e.target.value)} onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); void send() } }} className="max-h-32 min-h-10 resize-none" /><Button type="submit" size="icon" disabled={sending || !text.trim() || !recipient} aria-label="Enviar mensagem">{sending ? <Loader2 className="animate-spin" /> : <Send />}</Button></form>
  </div>{assistantOpen && <WhatsappAiAssistant phone={recipient || phone} open={assistantOpen} onOpenChange={setAssistantOpen} />}</>
}
