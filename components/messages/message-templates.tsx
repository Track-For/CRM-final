"use client"

import { useRef, useState } from "react"
import { Pencil, Plus, Save, Trash2 } from "lucide-react"
import { toast } from "@/lib/store/save-feedback"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { PageHeader } from "@/components/shared/page-header"
import { OptionSelect } from "@/components/shared/option-select"
import { newId, useCrm, useQuickMessages } from "@/lib/data"
import { deleteRecord } from "@/lib/data/records-actions"
import { saveMessageTemplate } from "@/lib/messages/template-actions"
import { MESSAGE_CATEGORIES, MESSAGE_VARIABLES, renderMessage } from "@/lib/messages/templates"
import type { QuickMessage } from "@/types"

const blank = (): QuickMessage => ({ id: newId("qm"), title: "", category: "primeiro_contato", subject: "", text: "" })
const example = { nome: "Mariana", empresa: "Clínica Sorriso", email: "mariana@example.com", whatsapp: "(11) 99999-9999", projeto: "site institucional" }
export function MessageTemplates() {
  const messages = useQuickMessages()
  const [draft, setDraft] = useState<QuickMessage>(() => messages[0] || blank())
  const [dirty, setDirty] = useState(false)
  const [busy, setBusy] = useState(false)
  const [saveError, setSaveError] = useState("")
  const inFlight = useRef(false)
  const textarea = useRef<HTMLTextAreaElement>(null)
  const form = useRef<HTMLFormElement>(null)
  const existing = messages.some(item => item.id === draft.id)
  function patch(value: Partial<QuickMessage>) { setDraft(current => ({ ...current, ...value })); setDirty(true) }
  function choose(value: QuickMessage) {
    if (dirty && !window.confirm("Descartar as alterações não salvas deste modelo?")) return
    setDraft(value); setDirty(false); setSaveError("")
    requestAnimationFrame(() => { form.current?.scrollIntoView({ behavior: "smooth", block: "start" }); textarea.current?.focus({ preventScroll: true }) })
  }
  function cancel() {
    const saved = messages.find(item => item.id === draft.id)
    if (saved) { setDraft(saved); setDirty(false) }
  }
  async function save(fields: FormData) {
    if (inFlight.current) return
    if (!String(fields.get("title") || "").trim() || !String(fields.get("text") || "").trim()) { toast.error("Preencha o nome e a mensagem."); return }
    inFlight.current = true; setBusy(true); setSaveError("")
    try {
      const value = await saveMessageTemplate({ ...draft, title: fields.get("title"), text: fields.get("text"), subject: fields.get("subject") || "" })
      useCrm.setState(state => ({ quickMessages: state.quickMessages.some(item => item.id === value.id) ? state.quickMessages.map(item => item.id === value.id ? value : item) : [...state.quickMessages, value] }))
      setDraft(value); setDirty(false); toast.success("Modelo salvo")
    } catch (error) { const message = error instanceof Error ? error.message : "Não foi possível salvar."; setSaveError(message); toast.error(message) }
    finally { inFlight.current = false; setBusy(false) }
  }
  async function remove() {
    if (inFlight.current) return
    if (!window.confirm("Excluir este modelo? As mensagens já enviadas serão preservadas.")) return
    inFlight.current = true; setBusy(true)
    try {
      await deleteRecord("quickMessages", draft.id)
      const remaining = messages.filter(item => item.id !== draft.id)
      useCrm.setState({ quickMessages: remaining }); setDraft(remaining[0] || blank()); setDirty(false); toast.success("Modelo excluído")
    } catch (error) { toast.error(error instanceof Error ? error.message : "Não foi possível excluir.") }
    finally { inFlight.current = false; setBusy(false) }
  }
  function insert(variable: string) {
    const field = textarea.current
    const start = field?.selectionStart ?? draft.text.length
    const end = field?.selectionEnd ?? start
    const token = `{${variable}}`
    patch({ text: draft.text.slice(0, start) + token + draft.text.slice(end) })
    requestAnimationFrame(() => { field?.focus(); field?.setSelectionRange(start + token.length, start + token.length) })
  }
  return <div className="space-y-5">
    <PageHeader title="Mensagens" description="Crie modelos para primeiro contato, follow-up e outras conversas. Use na ficha do lead por WhatsApp ou e-mail." actions={<Button disabled={busy} onClick={() => choose(blank())}><Plus />Novo modelo</Button>} />
    <div className="grid items-start gap-5 lg:grid-cols-[300px_minmax(0,1fr)]">
      <aside aria-label="Modelos salvos" className="overflow-hidden rounded-2xl border bg-card">
        <h2 className="border-b p-4 text-sm font-semibold">Modelos salvos · {messages.length}</h2>
        {!messages.length && <p className="p-5 text-sm text-muted-foreground">Seu primeiro modelo aparecerá aqui depois de salvar.</p>}
        {messages.map(message => <button key={message.id} disabled={busy} aria-label={`Editar mensagem: ${message.title}`} aria-pressed={draft.id === message.id} onClick={() => choose(message)} className={`block w-full border-b p-4 text-left last:border-b-0 hover:bg-accent ${draft.id === message.id ? "bg-brand-soft" : ""}`}><p className="font-semibold">{message.title}</p><p className="mt-1 text-xs text-primary">{MESSAGE_CATEGORIES[message.category]}</p><p className="mt-2 truncate text-sm text-muted-foreground">{message.text}</p><span className="mt-3 inline-flex items-center gap-1.5 text-xs font-medium text-primary"><Pencil className="size-3.5" />Editar mensagem</span></button>)}
      </aside>
      <form ref={form} onSubmit={event => { event.preventDefault(); void save(new FormData(event.currentTarget)) }} className="scroll-mt-24 space-y-5 rounded-2xl border bg-card p-5 sm:p-7">
        {saveError && <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">{saveError} Suas alterações continuam nos campos abaixo.</p>}
        <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="font-semibold">{existing ? "Editar mensagem" : "Novo modelo"}</h2><p role="status" className="mt-1 text-xs text-muted-foreground">{dirty ? "Alterações não salvas" : "Edite os campos e salve para atualizar o modelo."}</p></div><div className="flex flex-wrap gap-2">{existing && dirty && <Button type="button" variant="outline" disabled={busy} onClick={cancel}>Cancelar alterações</Button>}<Button type="submit" disabled={busy || (existing && !dirty)}><Save />{busy ? "Salvando…" : existing ? "Salvar alterações" : "Salvar modelo"}</Button></div></div>
        <label className="block space-y-2 text-sm font-medium">Nome do modelo<Input name="title" required maxLength={120} value={draft.title} disabled={busy} onChange={event => patch({ title: event.target.value })} placeholder="Ex.: Primeiro contato — cliente novo" /></label>
        <div className="space-y-2"><label htmlFor="template-category" className="text-sm font-medium">Categoria</label><OptionSelect id="template-category" disabled={busy} value={draft.category} onChange={category => patch({ category })} options={Object.entries(MESSAGE_CATEGORIES).map(([value, label]) => ({ value: value as QuickMessage["category"], label }))} /></div>
        <label className="block space-y-2 text-sm font-medium">Assunto do e-mail <span className="font-normal text-muted-foreground">(opcional para WhatsApp)</span><Input name="subject" maxLength={200} disabled={busy} value={draft.subject || ""} onChange={event => patch({ subject: event.target.value })} placeholder="Ex.: Uma ideia para {empresa}" /></label>
        <label className="block space-y-2 text-sm font-medium">Mensagem<Textarea name="text" ref={textarea} required rows={7} maxLength={10000} disabled={busy} value={draft.text} onChange={event => patch({ text: event.target.value })} placeholder="Olá, {nome}! Tudo bem?" /></label>
        <div><div className="flex flex-wrap gap-2">{MESSAGE_VARIABLES.map(variable => <Button disabled={busy} key={variable} type="button" variant="outline" size="sm" onClick={() => insert(variable)}>+ {`{${variable}}`}</Button>)}</div><p className="mt-2 text-xs text-muted-foreground">Clique para inserir na posição do cursor. Os dados são preenchidos ao escolher um lead.</p></div>
        <div className="space-y-2"><h3 className="text-sm font-semibold">Prévia com dados de exemplo</h3><div className="rounded-xl border bg-surface p-4">{draft.subject && <p className="mb-3 border-b pb-3 text-sm font-semibold">{renderMessage(draft.subject, example)}</p>}<p className="whitespace-pre-wrap break-words text-sm">{renderMessage(draft.text, example) || "Escreva a mensagem para visualizar."}</p></div></div>
        <div className="flex flex-wrap justify-between gap-3 border-t pt-4">{existing ? <Button type="button" variant="outline" className="text-destructive" disabled={busy} onClick={() => void remove()}><Trash2 />Excluir modelo</Button> : <span />}<Button type="submit" disabled={busy || (existing && !dirty)}><Save />{busy ? "Salvando…" : existing ? "Salvar alterações" : "Salvar modelo"}</Button></div>
      </form>
    </div>
  </div>
}
