"use client"

import Link from "next/link"
import { useEffect, useRef, useState } from "react"
import { Mail, MessageCircle, Send } from "lucide-react"
import { toast } from "@/lib/store/save-feedback"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Panel } from "@/components/shared/panel"
import { useCrm, useQuickMessages } from "@/lib/data"
import { getLeadMessagingAvailability } from "@/lib/messages/actions"
import { MESSAGE_CATEGORIES, renderMessage, unresolvedVariables } from "@/lib/messages/templates"
import { MAX_WHATSAPP_PARTS, whatsappMessageParts } from "@/lib/messages/paragraphs"
import type { Activity } from "@/types"

interface Props {
  contact: { name: string; email: string; whatsapp: string }
  messageValues: Record<string, string | undefined>
  sendMessage: (input: { channel: "whatsapp" | "email"; expectedRecipient: string; subject: string; text: string; separateParagraphs?: boolean }) => Promise<{ activity: Activity | null; warning: string; remainingText?: string; sentCount?: number }>
  disabled?: boolean
  notice?: string
}

export function ContactMessageComposer({ contact, messageValues, sendMessage, disabled, notice }: Props) {
  const messages = useQuickMessages()
  const [channel, setChannel] = useState<"whatsapp" | "email">("whatsapp")
  const [selected, setSelected] = useState("")
  const [subject, setSubject] = useState("")
  const [text, setText] = useState("")
  const [sending, setSending] = useState(false)
  const [reviewing, setReviewing] = useState(false)
  const [availability, setAvailability] = useState<{ email: boolean; whatsapp: boolean } | null>(null)
  const [loadError, setLoadError] = useState("")
  const [separateParagraphs, setSeparateParagraphs] = useState(false)
  const [deliveryWarning, setDeliveryWarning] = useState("")
  const inFlight = useRef(false)
  useEffect(() => { let active = true; void getLeadMessagingAvailability().then(value => { if (active) setAvailability(value) }).catch(() => { if (active) setLoadError("Não foi possível verificar os canais. Recarregue a página.") }); return () => { active = false } }, [])
  function choose(id: string) {
    if (text && !window.confirm("Substituir o texto atual pelo modelo escolhido?")) return
    setSelected(id); setReviewing(false)
    const template = messages.find(message => message.id === id)
    const values = messageValues
    setText(renderMessage(template?.text || "", values)); setSubject(renderMessage(template?.subject || template?.title || "", values))
  }
  const missing = unresolvedVariables(`${text}${channel === "email" ? subject : ""}`)
  const recipient = channel === "email" ? contact.email : contact.whatsapp
  const configured = availability?.[channel]
  const parts = whatsappMessageParts(text, channel === "whatsapp" && separateParagraphs)
  const tooMany = channel === "whatsapp" && parts.length > MAX_WHATSAPP_PARTS
  const valid = Boolean(!disabled && configured && recipient && text.trim() && !missing.length && !tooMany && (channel !== "email" || subject.trim()))
  async function send() {
    if (!valid || inFlight.current) return
    inFlight.current = true; setSending(true)
    try {
      const result = await sendMessage({ channel, expectedRecipient: recipient, subject, text, separateParagraphs: channel === "whatsapp" && separateParagraphs })
      if (result.activity) useCrm.setState(state => ({ activities: [result.activity!, ...state.activities] }))
      if (result.warning) toast.warning(result.warning)
      else toast.success(channel === "email" ? "E-mail aceito pelo servidor de envio" : result.sentCount && result.sentCount > 1 ? `${result.sentCount} mensagens enviadas por WhatsApp` : "Mensagem enviada por WhatsApp")
      setDeliveryWarning(result.warning)
      setText(result.remainingText || ""); setSubject(result.remainingText ? subject : ""); setSelected(""); setReviewing(false)
    } catch (error) { toast.error(error instanceof Error ? error.message : "Não foi possível confirmar o envio."); setReviewing(false) }
    finally { setSending(false); inFlight.current = false }
  }
  return <Panel title="Enviar mensagem" description="Escolha um modelo, revise o texto e envie para este contato." actions={<Button asChild size="sm" variant="outline"><Link href="/mensagens">Gerenciar modelos</Link></Button>}>
    <fieldset disabled={sending || disabled} className="space-y-4">
      <div className="flex flex-wrap gap-2">{(["whatsapp", "email"] as const).map(value => <Button key={value} type="button" variant={channel === value ? "default" : "outline"} aria-pressed={channel === value} onClick={() => { setChannel(value); setReviewing(false) }}>{value === "email" ? <Mail /> : <MessageCircle />}{value === "email" ? "E-mail" : "WhatsApp"}</Button>)}</div>
      <p className="rounded-lg bg-surface p-3 text-sm">Para: <strong>{contact.name}</strong> · {recipient || "Contato não cadastrado para este canal."}</p>
      {notice && <p className="text-xs text-muted-foreground">{notice}</p>}
      {loadError && <p role="alert" className="text-sm text-destructive">{loadError}</p>}
      {deliveryWarning && <p role="alert" className="rounded-lg border border-warning/40 bg-warning-soft p-3 text-sm text-warning">{deliveryWarning}</p>}
      {availability && !configured && <p role="status" className="text-sm text-muted-foreground">{channel === "email" ? "Peça ao administrador para configurar o serviço de e-mail do CRM." : "Configure a conexão em Integrações → WhatsApp / Evolution para enviar."}</p>}
      <label className="block space-y-2 text-sm font-medium">Modelo<select className="h-10 w-full rounded-md border bg-background px-3 text-sm" value={selected} onChange={event => choose(event.target.value)}><option value="">Escrever sem modelo</option>{Object.entries(MESSAGE_CATEGORIES).map(([category, label]) => <optgroup key={category} label={label}>{messages.filter(message => message.category === category).map(message => <option key={message.id} value={message.id}>{message.title}</option>)}</optgroup>)}</select></label>
      {!messages.length && <p className="text-sm text-muted-foreground">Você ainda não tem modelos. Crie um em Mensagens ou escreva abaixo.</p>}
      {channel === "email" && <label className="block space-y-2 text-sm font-medium">Assunto<Input maxLength={200} value={subject} onChange={event => { setSubject(event.target.value); setReviewing(false) }} /></label>}
      <label className="block space-y-2 text-sm font-medium">Mensagem<Textarea rows={6} maxLength={10000} value={text} onChange={event => { setText(event.target.value); setReviewing(false) }} placeholder="Escolha um modelo ou escreva sua mensagem…" /></label>
      {channel === "whatsapp" && <div className="space-y-2"><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={separateParagraphs} onChange={event => { setSeparateParagraphs(event.target.checked); setReviewing(false) }} />Enviar cada parágrafo separadamente</label><p className="text-xs text-muted-foreground">Separe os parágrafos com uma linha em branco. {parts.length ? `${parts.length} ${parts.length === 1 ? "mensagem será enviada" : "mensagens serão enviadas"} no WhatsApp.` : "A prévia aparecerá na revisão."}</p></div>}
      {tooMany && <p role="alert" className="text-sm text-destructive">Use no máximo {MAX_WHATSAPP_PARTS} mensagens por envio.</p>}
      {!!missing.length && <p role="alert" className="text-sm text-destructive">Preencha as variáveis antes de enviar: {missing.join(", ")}.</p>}
      {reviewing ? <div className="space-y-3 rounded-xl border border-primary/30 bg-surface p-4"><h3 className="text-sm font-semibold">Revisão do envio por {channel === "email" ? "e-mail" : "WhatsApp"}</h3><p className="text-xs text-muted-foreground">Destinatário: {recipient}</p>{channel === "email" && <p className="text-sm font-semibold">{subject}</p>}{channel === "whatsapp" ? <ol aria-label="Prévia das mensagens no WhatsApp" className="space-y-2">{parts.map((part, index) => <li key={index} className="ml-4 rounded-xl rounded-tr-sm border bg-card p-3"><p className="mb-1 text-[11px] text-muted-foreground">Mensagem {index + 1} de {parts.length}</p><p className="whitespace-pre-wrap break-words text-sm">{part}</p></li>)}</ol> : <p className="whitespace-pre-wrap break-words text-sm">{text}</p>}<div className="flex flex-wrap justify-end gap-2"><Button variant="outline" onClick={() => setReviewing(false)}>Voltar à edição</Button><Button disabled={!valid || sending} onClick={() => void send()}><Send />{sending ? "Enviando…" : channel === "whatsapp" && parts.length > 1 ? `Confirmar envio de ${parts.length} mensagens` : "Confirmar envio"}</Button></div></div> : <div className="flex justify-end"><Button disabled={!valid || sending} onClick={() => setReviewing(true)}><Send />Revisar e enviar</Button></div>}
    </fieldset>
  </Panel>
}
