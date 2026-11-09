"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import Link from "next/link"
import { ArrowLeft, ArrowUpRight, CheckSquare, FolderKanban, MessageCircle, RefreshCw, Settings2, Wallet } from "lucide-react"
import { toast } from "@/lib/store/save-feedback"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { PageHeader } from "@/components/shared/page-header"
import { StatusBadge } from "@/components/shared/status-badge"
import { Progress } from "@/components/ui/progress"
import { getWhatsappInbox, syncWhatsappHistory } from "@/lib/whatsapp/actions"
import { useCharges, useClients, useLeads, useProjects, useTasks } from "@/lib/data"
import { matchWhatsappContact } from "@/lib/whatsapp/contact-match"
import { projectProgress } from "@/lib/projects/plan"
import { formatDate, formatMoney } from "@/lib/format"
import { useUiStore } from "@/lib/store/ui-store"
import { cn } from "@/lib/utils"
import { useCrmStore } from "@/lib/store/crm-store"
import { intakeLabels } from "@/lib/whatsapp/intake-model"
import { WhatsappIntakeCard } from "./intake-card"
import { WhatsappThread } from "./thread"
import { WhatsappConnectionCard } from "./connection-card"

export function WhatsappInbox({ canManage }: { canManage: boolean }) {
  const [chats, setChats] = useState<Awaited<ReturnType<typeof getWhatsappInbox>>>([])
  const [selected, setSelected] = useState("")
  const [query, setQuery] = useState("")
  const [filter, setFilter] = useState("all")
  const [error, setError] = useState("")
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(true)
  const [connected, setConnected] = useState(false)
  const generation = useRef(0)
  const polling = useRef(false)
  const leads = useLeads()
  const clients = useClients()
  const projects = useProjects()
  const tasks = useTasks()
  const charges = useCharges()
  const role = useUiStore(state => state.role)
  const openQuickCreate = useUiStore(state => state.openQuickCreate)
  const canSell = role === "admin" || role === "comercial"
  const canFinance = role === "admin" || role === "financeiro"
  const refresh = useCallback(async () => {
    if (polling.current) return
    polling.current = true
    const run = generation.current
    try { const rows = await getWhatsappInbox(); if (run === generation.current) { setChats(rows); setError(""); const store = useCrmStore.getState(); const added = rows.flatMap(row => row.lead && !store.leads.some(lead => lead.id === row.lead!.id) ? [row.lead] : []); if (added.length) store.replace("leads", [...store.leads, ...added]) } }
    catch (e) { setError(e instanceof Error ? e.message : "Falha ao carregar conversas") }
    finally { polling.current = false; setLoading(false) }
  }, [])
  const connectionChanged = useCallback((state: string) => {
    setConnected(state === "open")
    if (["close", "connecting", "unconfigured"].includes(state)) {
      generation.current++
      setChats([]); setSelected("")
    }
  }, [])
  useEffect(() => { const initial = setTimeout(() => void refresh(), 0); const timer = setInterval(() => { if (!document.hidden) void refresh() }, 5000); return () => { clearTimeout(initial); clearInterval(timer) } }, [refresh])
  const contactFor = (phone: string) => matchWhatsappContact(phone, leads, clients)
  const active = chats.find(chat => chat.phone === selected)
  const { client, lead, ambiguous } = contactFor(selected)
  const nameFor = (phone: string) => { const contact = contactFor(phone); return contact.ambiguous ? "Cadastros duplicados" : contact.client?.contactName || contact.client?.name || contact.lead?.name }
  const ownProjects = projects.filter(project => client && project.clientId === client.id && project.status !== "entregue")
  const ownTasks = tasks.filter(task => task.status !== "done" && ((client && task.clientId === client.id) || (lead && task.leadId === lead.id))).sort((a, b) => a.dueDate.localeCompare(b.dueDate))
  const ownCharges = charges.filter(charge => client && charge.clientId === client.id && ["pendente", "vencido"].includes(charge.status))
  const visibleChats = chats.filter(chat => {
    const registered = Boolean(nameFor(chat.phone))
    return (filter === "all" || (filter === "known" ? registered : filter === "review" ? !chat.intake || chat.intake.category === "unclassified" || chat.intake.state !== "classified" : !registered)) && `${nameFor(chat.phone) || chat.name} ${chat.phone}`.toLowerCase().includes(query.toLowerCase())
  })
  async function sync() {
    setBusy(true)
    try { const result = await syncWhatsappHistory(); await refresh(); toast.success(`${result.total} mensagens consultadas. ${result.stored} novas.`) }
    catch (e) { toast.error(e instanceof Error ? e.message : "Falha ao sincronizar") }
    finally { setBusy(false) }
  }
  return <div className="space-y-5">
    <PageHeader title="WhatsApp" description="Converse com o cliente e acompanhe o que está acontecendo no CRM." actions={<><Button variant="outline" disabled={busy || !connected} onClick={() => void sync()}><RefreshCw className={busy ? "animate-spin" : ""} />{busy ? "Sincronizando…" : "Sincronizar"}</Button>{canManage && <Button asChild variant="ghost"><Link href="/integracoes/evolution"><Settings2 />Configurar WhatsApp e IA</Link></Button>}</>} />
    <WhatsappConnectionCard canManage={canManage} onConnectionChange={connectionChanged} />
    {error && <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-danger/25 bg-danger-soft p-4 text-sm text-danger"><p>{error}</p><Button variant="outline" size="sm" onClick={() => void refresh()}>Tentar novamente</Button></div>}
    <div className="grid gap-4 lg:grid-cols-[280px_minmax(0,1fr)] xl:grid-cols-[280px_minmax(0,1fr)_250px]">
      <section aria-label="Lista de conversas" className={cn("flex min-w-0 flex-col overflow-hidden rounded-2xl border bg-card lg:h-[calc(100dvh-14rem)] lg:min-h-[480px]", selected && "hidden lg:flex")}>
        <div className="space-y-4 border-b p-4"><div className="flex items-center justify-between"><h2 className="font-semibold">Conversas</h2><StatusBadge tone="brand">{chats.length}</StatusBadge></div><Input aria-label="Buscar conversas" placeholder="Buscar nome ou telefone" value={query} onChange={event => setQuery(event.target.value)} /><div className="flex gap-1 rounded-lg bg-surface p-1">{[{ id: "all", label: "Todas" }, { id: "known", label: "Cadastrados" }, { id: "review", label: "A classificar" }].map(item => <button key={item.id} aria-pressed={filter === item.id} onClick={() => setFilter(item.id)} className={cn("flex-1 rounded-md px-1 py-2 text-xs font-medium", filter === item.id ? "bg-white text-primary shadow-sm" : "text-muted-foreground")}>{item.label}</button>)}</div></div>
        <div className="max-h-[65dvh] flex-1 overflow-y-auto p-2 lg:max-h-none">{visibleChats.map(chat => {
          const name = nameFor(chat.phone) || chat.name || (chat.unresolved ? "Contato a identificar" : chat.phone)
          return <button type="button" key={chat.phone} aria-pressed={selected === chat.phone} onClick={() => setSelected(chat.phone)} className={cn("flex w-full gap-3 rounded-xl border border-transparent p-3 text-left transition-colors hover:bg-surface", selected === chat.phone && "border-primary/20 bg-brand-soft")}><span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-surface font-semibold text-primary">{name.slice(0, 1).toUpperCase()}</span><div className="min-w-0 flex-1"><div className="flex items-center justify-between gap-2"><p className="truncate text-sm font-semibold">{name}</p><span className="shrink-0 text-[10px] text-muted-foreground">{new Date(chat.sentAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</span></div><p className="mt-1 truncate text-xs text-muted-foreground">{chat.direction === "out" ? "Você: " : ""}{chat.preview}</p>{chat.intake && <p className="mt-1 text-[10px] font-medium text-primary">{intakeLabels[chat.intake.category]}</p>}{chat.unresolved && <p className="mt-1 text-[10px] font-medium text-primary">Identificação pendente</p>}</div></button>
        })}{!visibleChats.length && <div className="space-y-3 px-4 py-12 text-center"><MessageCircle className="mx-auto size-8 text-primary" /><p role="status" className="text-sm font-medium">{loading ? "Carregando conversas…" : query || filter !== "all" ? "Nenhuma conversa encontrada" : "Suas conversas aparecerão aqui"}</p><p className="text-xs leading-relaxed text-muted-foreground">{query || filter !== "all" ? "Tente outro nome ou altere o filtro." : "Conecte o número nas integrações e sincronize as mensagens disponíveis."}</p>{canManage && !query && <Button asChild variant="outline" size="sm"><Link href="/integracoes/evolution">Abrir configurações</Link></Button>}</div>}</div>
      </section>
      <div className={cn("min-w-0", !selected && "hidden lg:block")}>{selected ? <><Button className="mb-3 lg:hidden" size="sm" variant="outline" onClick={() => setSelected("")}><ArrowLeft />Voltar às conversas</Button><WhatsappThread key={selected} phone={selected} name={nameFor(selected) || active?.name || "Contato"} className="h-[calc(100dvh-15rem)] min-h-[480px] rounded-2xl" /></> : <div className="flex h-full min-h-[480px] flex-col items-center justify-center rounded-2xl border bg-card p-8 text-center"><span className="mb-5 flex size-16 items-center justify-center rounded-2xl bg-brand-soft"><MessageCircle className="size-8 text-primary" /></span><h2 className="text-lg font-semibold">Seu atendimento começa aqui</h2><p className="mt-2 max-w-sm text-sm leading-relaxed text-muted-foreground">Selecione uma conversa. Os projetos e as próximas ações do cliente ficam ao lado das mensagens.</p></div>}</div>
      {selected && <aside className="min-w-0 space-y-4 rounded-2xl border bg-card p-4 lg:col-span-2 xl:col-span-1 xl:self-start" aria-label="Resumo do contato">{ambiguous && <p role="alert" className="rounded-lg bg-warning-soft p-3 text-sm text-warning">Mais de um cadastro corresponde a este telefone. Revise os cadastros antes de vincular tarefas ou consultar o contexto do cliente.</p>}<div className="border-b pb-4"><p className="text-xs font-semibold tracking-wide text-primary uppercase">Contexto do cliente</p><h2 className="mt-2 break-words font-semibold">{client?.name || lead?.company || nameFor(selected) || active?.name || "Contato sem cadastro"}</h2><p className="mt-1 break-all text-xs text-muted-foreground">{selected.endsWith("@lid") ? "Telefone a identificar" : `+${selected}`}</p><div className="mt-4 flex flex-wrap gap-2">{client ? <Button asChild size="sm" variant="outline"><Link href={`/clientes/${client.id}`}>Abrir cliente<ArrowUpRight /></Link></Button> : lead ? <Button asChild size="sm" variant="outline"><Link href={`/leads/${lead.id}`}>Abrir lead<ArrowUpRight /></Link></Button> : null}{(client || lead) && <Button variant="outline" size="sm" onClick={() => openQuickCreate("task", { clientId: client?.id, leadId: lead?.id, projectName: ownProjects[0]?.name })}><CheckSquare />Criar tarefa</Button>}</div></div>
        <WhatsappIntakeCard key={`${selected}:${active?.intake?.classifiedAt || "initial"}`} phone={selected} intake={active?.intake} canEdit={canSell && !ambiguous} unresolved={active?.unresolved} known={Boolean(client || lead)} onChanged={refresh} />
        <section className="space-y-3"><h3 className="flex items-center gap-2 text-sm font-semibold"><FolderKanban className="size-4 text-primary" />Projetos em andamento</h3>{ownProjects.length ? ownProjects.slice(0, 3).map(project => { const progress = projectProgress(project.stages); const stage = project.stages?.find(stage => stage.status !== "concluida"); return <Link key={project.id} href={`/clientes/${project.clientId}?projeto=${encodeURIComponent(project.id)}`} className="block space-y-2 rounded-xl border bg-surface p-3 hover:border-primary"><p className="text-sm font-medium">{project.name}</p><p className="text-xs text-muted-foreground">{stage?.name || "Planejamento do projeto"}</p><Progress value={progress.percent} aria-label={`Progresso de ${project.name}`} /><p className="text-xs text-muted-foreground">{progress.percent}% concluído · {project.deliveryDate ? `Entrega ${formatDate(project.deliveryDate)}` : "Entrega a definir"}</p></Link> }) : <p className="text-xs leading-relaxed text-muted-foreground">{client ? "Nenhum projeto em andamento." : "Os projetos serão exibidos quando este contato estiver vinculado a um cliente."}</p>}</section>
        <section className="space-y-2 border-t pt-4"><h3 className="flex items-center gap-2 text-sm font-semibold"><CheckSquare className="size-4 text-primary" />Próximas tarefas <span className="text-xs text-muted-foreground">{ownTasks.length}</span></h3>{ownTasks.slice(0, 3).map(task => <Link key={task.id} href={`/tarefas?tarefa=${encodeURIComponent(task.id)}`} className="block rounded-lg p-2 hover:bg-surface"><p className="text-xs font-medium">{task.title}</p><p className="mt-1 text-xs text-muted-foreground">{formatDate(task.dueDate)}</p></Link>)}{!ownTasks.length && <p className="text-xs text-muted-foreground">Nenhuma tarefa pendente.</p>}</section>
        {canFinance && client && <section className="space-y-2 border-t pt-4"><h3 className="flex items-center gap-2 text-sm font-semibold"><Wallet className="size-4 text-primary" />Cobranças em aberto</h3>{ownCharges.slice(0, 3).map(charge => <Link key={charge.id} href={`/financeiro/cobrancas?cobranca=${encodeURIComponent(charge.id)}`} className="flex items-center justify-between gap-2 rounded-lg p-2 text-xs hover:bg-surface"><span>{charge.number}<span className="mt-1 block text-muted-foreground">{formatDate(charge.dueDate)}</span></span><span className="num font-semibold">{formatMoney(charge.amount)}</span></Link>)}{!ownCharges.length && <p className="text-xs text-muted-foreground">Nenhuma cobrança em aberto.</p>}</section>}
      </aside>}
    </div>
    <p className="text-xs text-muted-foreground">Áudios e anexos aparecem identificados por tipo. O histórico disponível depende da conexão com o WhatsApp.</p>
  </div>
}
