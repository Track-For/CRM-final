"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import Link from "next/link"
import { RefreshCw } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { PageHeader } from "@/components/shared/page-header"
import { getWhatsappInbox, syncWhatsappHistory } from "@/lib/whatsapp/actions"
import { useCrmStore } from "@/lib/store/crm-store"
import { HermesAccessCard } from "./hermes-access-card"
import { WhatsappConnectionCard } from "./connection-card"
import { WhatsappThread } from "./thread"

const identity = (input: string) => { let n = input.replace(/\D/g, ""); if (n.length === 10 || n.length === 11) n = `55${n}`; return /^55\d{2}9\d{8}$/.test(n) ? n.slice(0, 4) + n.slice(5) : n }
export function WhatsappInbox({ canManage }: { canManage: boolean }) {
  const [chats, setChats] = useState<Awaited<ReturnType<typeof getWhatsappInbox>>>([])
  const [selected, setSelected] = useState("")
  const [query, setQuery] = useState("")
  const [error, setError] = useState("")
  const [busy, setBusy] = useState(false)
  const polling = useRef(false)
  const leads = useCrmStore(s => s.leads)
  const refresh = useCallback(async () => {
    if (polling.current) return
    polling.current = true
    try { setChats(await getWhatsappInbox()); setError("") }
    catch (e) { setError(e instanceof Error ? e.message : "Falha ao carregar conversas") }
    finally { polling.current = false }
  }, [])
  useEffect(() => { const initial = setTimeout(() => void refresh(), 0); const timer = setInterval(() => void refresh(), 5000); return () => { clearTimeout(initial); clearInterval(timer) } }, [refresh])
  const nameFor = (phone: string) => phone.endsWith("@lid") ? undefined : leads.find(l => identity(l.whatsapp) === identity(phone))
  const active = chats.find(c => c.phone === selected)
  const lead = nameFor(selected)
  async function sync() {
    setBusy(true)
    try { const result = await syncWhatsappHistory(); await refresh(); toast.success(`${result.total} mensagens recentes consultadas. ${result.stored} novas.`) }
    catch (e) { toast.error(e instanceof Error ? e.message : "Falha ao sincronizar") }
    finally { setBusy(false) }
  }
  return <div className="space-y-5"><PageHeader title="WhatsApp" description="Acompanhe as mensagens recebidas e enviadas pelo número conectado, incluindo respostas automáticas." actions={<Button variant="outline" disabled={busy} onClick={() => void sync()}><RefreshCw className={busy ? "animate-spin" : ""} />Sincronizar recentes</Button>} /><WhatsappConnectionCard canManage={canManage} />{canManage && <HermesAccessCard />}{error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    <div className="grid gap-4 lg:grid-cols-[320px_1fr]"><section className="rounded-xl border bg-card p-3"><Input aria-label="Buscar conversas" placeholder="Buscar nome ou telefone" value={query} onChange={e => setQuery(e.target.value)} /><div className="mt-3 max-h-[60dvh] space-y-1 overflow-y-auto">{chats.filter(c => `${nameFor(c.phone)?.name || c.name} ${c.phone}`.toLowerCase().includes(query.toLowerCase())).map(c => <button type="button" key={c.phone} onClick={() => setSelected(c.phone)} className={`w-full rounded-lg p-3 text-left hover:bg-accent ${selected === c.phone ? "bg-accent" : ""}`}><p className="truncate text-sm font-medium">{nameFor(c.phone)?.name || c.name || (c.unresolved ? "Contato sem telefone identificado" : c.phone)}</p><p className="truncate text-xs text-muted-foreground">{c.direction === "out" ? "Você: " : ""}{c.preview}</p>{c.unresolved && <p className="mt-1 text-[10px] text-amber-500">Aguardando identificação do telefone</p>}<p className="mt-1 text-[10px] text-muted-foreground">{new Date(c.sentAt).toLocaleString("pt-BR")}</p></button>)}{!chats.length && <p className="px-3 py-10 text-center text-sm text-muted-foreground">Após conectar, as novas mensagens aparecerão aqui. Use Sincronizar recentes para consultar o histórico disponível.</p>}</div></section><div className="min-w-0">{selected ? <>{lead && <Link href={`/leads/${lead.id}`} className="mb-2 inline-block text-sm text-primary">Abrir ficha de {lead.name}</Link>}<WhatsappThread key={selected} phone={selected} name={lead?.name || active?.name || (selected.endsWith("@lid") ? "Contato sem telefone identificado" : selected)} className="h-[65dvh] min-h-[400px]" /></> : <div className="flex min-h-[400px] items-center justify-center rounded-xl border p-8 text-sm text-muted-foreground">Selecione uma conversa para ver as mensagens.</div>}</div></div><p className="text-xs text-muted-foreground">São exibidas conversas individuais. Áudios, imagens e documentos aparecem identificados por tipo; a reprodução de anexos ainda não está disponível. O histórico anterior depende do que o WhatsApp disponibilizar à conexão.</p></div>
}
