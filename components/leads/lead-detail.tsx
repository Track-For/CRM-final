"use client"

import { useMemo, useState } from "react"
import Link from "next/link"
import {
  CalendarPlus,
  CalendarDays,
  CheckSquare,
  FileText,
  Handshake,
  MessageCircle,
  Pencil,
  Plus,
  StickyNote,
  UserX,
} from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import { EmptyState } from "@/components/shared/empty-state"
import { OptionSelect } from "@/components/shared/option-select"
import { PageHeader } from "@/components/shared/page-header"
import { InfoRow, Panel } from "@/components/shared/panel"
import { EnumBadge, StatusBadge } from "@/components/shared/status-badge"
import { InitialsAvatar, UserAvatar } from "@/components/shared/user-avatar"
import { LeadFormDialog } from "@/components/forms/lead-form-dialog"
import { LeadTimeline } from "@/components/leads/lead-timeline"
import { LeadMessageComposer } from "@/components/leads/lead-message-composer"
import { WhatsappChat } from "@/components/leads/whatsapp-chat"
import {
  EVENT_TYPE_COLOR,
  EVENT_TYPE_LABEL,
  LEAD_STATUS_LABEL,
  LEAD_STATUS_TONE,
  PROJECT_TYPE_LABEL,
  QUOTE_STATUS_LABEL,
  QUOTE_STATUS_TONE,
  REVENUE_LABEL,
  SOURCE_LABEL,
  STAGE_LABEL,
  STAGE_TONE,
  TASK_PRIORITY_LABEL,
  TASK_PRIORITY_TONE,
  TASK_STATUS_LABEL,
  TASK_STATUS_TONE,
  TEMPERATURE_LABEL,
  TEMPERATURE_TONE,
  toOptions,
} from "@/lib/constants"
import { newId, useActivities, useById, useCrm, useDeals, useEvents, useLead, useNotes, useQuotes, useTasks } from "@/lib/data"
import { useEntityOptions } from "@/lib/data/options"
import { formatDate, formatDateTime, formatDays, formatMoney, formatRelative, whatsappLink } from "@/lib/format"
import { useUiStore } from "@/lib/store/ui-store"
import { cn } from "@/lib/utils"
import type { LeadStatus, Temperature } from "@/types"

function Count({ n }: { n: number }) {
  return n ? <span className="num ml-1 rounded bg-surface px-1 text-[10px] text-muted-foreground">{n}</span> : null
}

export function LeadDetail({ id }: { id: string }) {
  const lead = useLead(id)
  const deals = useDeals()
  const quotes = useQuotes()
  const tasks = useTasks()
  const events = useEvents()
  const notes = useNotes()
  const activities = useActivities()
  const catalog = useById("catalog")
  const update = useCrm((s) => s.update)
  const add = useCrm((s) => s.add)
  const logActivity = useCrm((s) => s.logActivity)
  const currentUserId = useCrm((s) => s.currentUserId)
  const openQuickCreate = useUiStore((s) => s.openQuickCreate)
  const { userOptions } = useEntityOptions()
  const [editOpen, setEditOpen] = useState(false)
  const [noteText, setNoteText] = useState("")

  const clientId = lead?.clientId
  const related = useMemo(() => {
    const leadDeals = deals.filter((d) => d.leadId === id)
    const dealIds = new Set(leadDeals.map((d) => d.id))
    return {
      deals: leadDeals,
      quotes: quotes.filter((q) => q.leadId === id || (q.dealId && dealIds.has(q.dealId))),
      tasks: tasks.filter((t) => t.leadId === id || (t.dealId && dealIds.has(t.dealId)) || (clientId && t.clientId === clientId)),
      events: events.filter((e) => e.leadId === id || (e.dealId && dealIds.has(e.dealId))).sort((a, b) => b.start.localeCompare(a.start)),
      notes: notes.filter((n) => n.leadId === id).sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
      activities: activities.filter((a) => a.leadId === id).sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    }
  }, [id, clientId, deals, quotes, tasks, events, notes, activities])

  if (!lead) {
    return (
      <EmptyState
        icon={UserX}
        title="Lead não encontrado"
        description="Ele pode ter sido removido ou o link está incorreto."
        action={
          <Button asChild size="sm" variant="outline">
            <Link href="/leads">Voltar para leads</Link>
          </Button>
        }
        className="mt-10"
      />
    )
  }

  const setField = (patch: { temperature?: Temperature; status?: LeadStatus; ownerId?: string }, message: string) => {
    update("leads", lead.id, { ...patch, updatedAt: new Date().toISOString() })
    logActivity({ type: "status", title: message, leadId: lead.id })
    toast.success(message)
  }

  const addNote = () => {
    const text = noteText.trim()
    if (!text) {
      toast.error("Escreva a nota antes de salvar")
      return
    }
    add("notes", { id: newId("note"), text, leadId: lead.id, authorId: currentUserId, createdAt: new Date().toISOString() })
    logActivity({ type: "nota", title: "Nota adicionada", description: text, leadId: lead.id })
    setNoteText("")
    toast.success("Nota salva")
  }

  return (
    <>
      <PageHeader
        backHref="/leads"
        backLabel="Leads"
        title={
          <span className="flex items-center gap-3">
            <InitialsAvatar name={lead.name} id={lead.id} size="lg" />
            <span className="min-w-0">
              <span className="block truncate">{lead.name}</span>
              <span className="block truncate text-sm font-normal text-muted-foreground">{lead.company || "Sem empresa"}</span>
            </span>
          </span>
        }
        actions={
          <>
            <Button size="sm" variant="outline" asChild>
              <a href={whatsappLink(lead.whatsapp)} target="_blank" rel="noopener noreferrer">
                <MessageCircle className="text-success" />
                WhatsApp
              </a>
            </Button>
            <Button size="sm" variant="outline" onClick={() => openQuickCreate("event", { leadId: lead.id, type: "call", title: `Call — ${lead.name}` })}>
              <CalendarPlus />
              Agendar call
            </Button>
            <Button size="sm" variant="outline" onClick={() => openQuickCreate("deal", { leadId: lead.id })}>
              <Handshake />
              Criar negócio
            </Button>
            <Button size="sm" asChild>
              <Link href={`/orcamentos/novo?leadId=${lead.id}`}>
                <FileText />
                Criar orçamento
              </Link>
            </Button>
          </>
        }
      >
        <div className="flex flex-wrap items-center gap-2">
          <EnumBadge value={lead.status} labels={LEAD_STATUS_LABEL} tones={LEAD_STATUS_TONE} />
          <EnumBadge value={lead.temperature} labels={TEMPERATURE_LABEL} tones={TEMPERATURE_TONE} />
          <StatusBadge dot={false}>{PROJECT_TYPE_LABEL[lead.projectType]}</StatusBadge>
          <StatusBadge dot={false}>{SOURCE_LABEL[lead.source]}</StatusBadge>
          <span className="text-xs text-muted-foreground">Entrou {formatRelative(lead.createdAt)}</span>
        </div>
      </PageHeader>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4">
          <Panel
            title="Dados do lead"
            actions={
              <Button size="xs" variant="ghost" onClick={() => setEditOpen(true)}>
                <Pencil />
                Editar
              </Button>
            }
          >
            <div className="mb-3 grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <p className="text-[11px] text-muted-foreground">Status</p>
                <OptionSelect value={lead.status} onChange={(v) => setField({ status: v }, `Status alterado para ${LEAD_STATUS_LABEL[v]}`)} options={toOptions(LEAD_STATUS_LABEL)} />
              </div>
              <div className="space-y-1">
                <p className="text-[11px] text-muted-foreground">Temperatura</p>
                <OptionSelect value={lead.temperature} onChange={(v) => setField({ temperature: v }, `Temperatura alterada para ${TEMPERATURE_LABEL[v]}`)} options={toOptions(TEMPERATURE_LABEL)} />
              </div>
              <div className="col-span-2 space-y-1">
                <p className="text-[11px] text-muted-foreground">Responsável</p>
                <OptionSelect value={lead.ownerId} onChange={(v) => setField({ ownerId: v }, "Responsável alterado")} options={userOptions} />
              </div>
            </div>
            <div className="divide-y">
              <InfoRow label="WhatsApp" mono>
                {lead.whatsapp}
              </InfoRow>
              <InfoRow label="E-mail">{lead.email || "—"}</InfoRow>
              <InfoRow label="Empresa">{lead.company || "—"}</InfoRow>
              <InfoRow label="Tipo de projeto">{PROJECT_TYPE_LABEL[lead.projectType]}</InfoRow>
              <InfoRow label="Faturamento">{REVENUE_LABEL[lead.revenue]}</InfoRow>
              <InfoRow label="Origem">{SOURCE_LABEL[lead.source]}</InfoRow>
              <InfoRow label="Cadastro" mono>
                {formatDate(lead.createdAt)}
              </InfoRow>
              <InfoRow label="ID" mono>
                {lead.id}
              </InfoRow>
              {lead.clientId && (
                <InfoRow label="Cliente">
                  <Link href={`/clientes/${lead.clientId}`} className="text-primary hover:underline">
                    Ver ficha do cliente
                  </Link>
                </InfoRow>
              )}
            </div>
          </Panel>

          <Panel title="Rastreamento (UTMs)">
            {Object.values(lead.utm).some(Boolean) ? (
              <div className="divide-y">
                {(["source", "medium", "campaign", "content", "term"] as const).map((k) =>
                  lead.utm[k] ? (
                    <InfoRow key={k} label={`utm_${k}`} mono>
                      {lead.utm[k]}
                    </InfoRow>
                  ) : null,
                )}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">Lead sem parâmetros UTM (entrada orgânica ou manual).</p>
            )}
          </Panel>
        </div>

        <div className="min-w-0 lg:col-span-2">
          <Tabs defaultValue="mensagens" className="gap-3">
            <div className="-mx-4 overflow-x-auto px-4 md:mx-0 md:px-0">
              <TabsList className="w-max">
                <TabsTrigger value="mensagens">Enviar mensagem</TabsTrigger>
                <TabsTrigger value="conversa">Conversa</TabsTrigger>
                <TabsTrigger value="timeline">
                  Timeline
                  <Count n={related.activities.length} />
                </TabsTrigger>
                <TabsTrigger value="negocios">
                  Negócios
                  <Count n={related.deals.length} />
                </TabsTrigger>
                <TabsTrigger value="orcamentos">
                  Orçamentos
                  <Count n={related.quotes.length} />
                </TabsTrigger>
                <TabsTrigger value="tarefas">
                  Tarefas
                  <Count n={related.tasks.length} />
                </TabsTrigger>
                <TabsTrigger value="eventos">
                  Eventos
                  <Count n={related.events.length} />
                </TabsTrigger>
                <TabsTrigger value="notas">
                  Notas
                  <Count n={related.notes.length} />
                </TabsTrigger>
              </TabsList>
            </div>

            <TabsContent value="mensagens"><LeadMessageComposer key={lead.id} lead={lead} /></TabsContent>

            <TabsContent value="conversa">
              <WhatsappChat lead={lead} className="h-[560px] max-h-[75dvh]" />
            </TabsContent>

            <TabsContent value="timeline">
              <Panel title="Atividades">
                <LeadTimeline activities={related.activities} />
              </Panel>
            </TabsContent>

            <TabsContent value="negocios">
              <Panel
                title="Negócios"
                actions={
                  <Button size="xs" variant="outline" onClick={() => openQuickCreate("deal", { leadId: lead.id })}>
                    <Plus />
                    Novo
                  </Button>
                }
                contentClassName="p-0"
              >
                {related.deals.length === 0 ? (
                  <EmptyState compact icon={Handshake} title="Nenhum negócio" description="Crie um negócio para acompanhar este lead no pipeline." className="m-4" />
                ) : (
                  <ul className="divide-y">
                    {related.deals.map((d) => (
                      <li key={d.id}>
                        <Link href={`/vendas/${d.id}`} className="flex flex-col gap-2 p-4 hover:bg-accent sm:flex-row sm:items-center sm:justify-between">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-medium">{d.title}</p>
                            <p className="text-xs text-muted-foreground">Previsão {formatDate(d.expectedCloseDate)}</p>
                          </div>
                          <div className="flex items-center gap-3">
                            <EnumBadge value={d.stage} labels={STAGE_LABEL} tones={STAGE_TONE} />
                            <div className="text-right">
                              <p className="num text-sm font-semibold">{formatMoney(d.value)}</p>
                              {d.monthlyFee > 0 && <p className="num text-xs text-muted-foreground">+ {formatMoney(d.monthlyFee)}/mês</p>}
                            </div>
                          </div>
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </Panel>
            </TabsContent>

            <TabsContent value="orcamentos">
              <Panel
                title="Orçamentos"
                actions={
                  <Button size="xs" variant="outline" asChild>
                    <Link href={`/orcamentos/novo?leadId=${lead.id}`}>
                      <Plus />
                      Novo
                    </Link>
                  </Button>
                }
                contentClassName="p-0"
              >
                {related.quotes.length === 0 ? (
                  <EmptyState compact icon={FileText} title="Nenhum orçamento" description="Monte uma proposta com o formulário de precificação." className="m-4" />
                ) : (
                  <ul className="divide-y">
                    {related.quotes.map((q) => (
                      <li key={q.id}>
                        <Link href={`/orcamentos/${q.id}`} className="flex flex-col gap-2 p-4 hover:bg-accent sm:flex-row sm:items-center sm:justify-between">
                          <div className="min-w-0">
                            <p className="text-sm font-medium">
                              <span className="num text-muted-foreground">{q.number}</span> · {catalog.get(q.catalogItemId)?.name ?? "Projeto"}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              Validade <span className="num">{formatDate(q.validUntil)}</span> · Prazo {formatDays(q.deadlineDays)}
                            </p>
                          </div>
                          <div className="flex items-center gap-3">
                            <EnumBadge value={q.status} labels={QUOTE_STATUS_LABEL} tones={QUOTE_STATUS_TONE} />
                            <span className="num text-sm font-semibold">{formatMoney(q.total)}</span>
                          </div>
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </Panel>
            </TabsContent>

            <TabsContent value="tarefas">
              <Panel
                title="Tarefas"
                actions={
                  <Button size="xs" variant="outline" onClick={() => openQuickCreate("task", { leadId: lead.id, clientId: lead.clientId })}>
                    <Plus />
                    Nova
                  </Button>
                }
                contentClassName="p-0"
              >
                {related.tasks.length === 0 ? (
                  <EmptyState compact icon={CheckSquare} title="Nenhuma tarefa" className="m-4" />
                ) : (
                  <ul className="divide-y">
                    {related.tasks.map((t) => {
                      const late = t.status !== "done" && new Date(t.dueDate) < new Date()
                      return (
                        <li key={t.id} className="flex flex-col gap-2 p-4 sm:flex-row sm:items-center sm:justify-between">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-medium">{t.title}</p>
                            <p className={cn("num text-xs", late ? "text-danger" : "text-muted-foreground")}>Prazo {formatDate(t.dueDate)}</p>
                          </div>
                          <div className="flex items-center gap-2">
                            <EnumBadge value={t.priority} labels={TASK_PRIORITY_LABEL} tones={TASK_PRIORITY_TONE} />
                            <EnumBadge value={t.status} labels={TASK_STATUS_LABEL} tones={TASK_STATUS_TONE} />
                            <UserAvatar userId={t.assigneeId} />
                          </div>
                        </li>
                      )
                    })}
                  </ul>
                )}
              </Panel>
            </TabsContent>

            <TabsContent value="eventos">
              <Panel
                title="Eventos"
                actions={
                  <Button size="xs" variant="outline" onClick={() => openQuickCreate("event", { leadId: lead.id, type: "call", title: `Call — ${lead.name}` })}>
                    <Plus />
                    Agendar
                  </Button>
                }
                contentClassName="p-0"
              >
                {related.events.length === 0 ? (
                  <EmptyState compact icon={CalendarDays} title="Nenhum evento" description="Agende uma call de diagnóstico." className="m-4" />
                ) : (
                  <ul className="divide-y">
                    {related.events.map((e) => (
                      <li key={e.id} className="flex items-center gap-3 p-4">
                        <span className="h-9 w-1 shrink-0 rounded-full" style={{ backgroundColor: EVENT_TYPE_COLOR[e.type] }} />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium">{e.title}</p>
                          <p className="text-xs text-muted-foreground">
                            {EVENT_TYPE_LABEL[e.type]} · <span className="num">{formatDateTime(e.start)}</span>
                          </p>
                        </div>
                        {e.meetingUrl && (
                          <Button size="xs" variant="outline" asChild>
                            <a href={e.meetingUrl} target="_blank" rel="noopener noreferrer">
                              Entrar
                            </a>
                          </Button>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </Panel>
            </TabsContent>

            <TabsContent value="notas">
              <Panel title="Notas">
                <div className="mb-4 space-y-2">
                  <Textarea value={noteText} onChange={(e) => setNoteText(e.target.value)} rows={3} placeholder="Registre algo importante sobre este lead..." />
                  <div className="flex justify-end">
                    <Button size="sm" onClick={addNote}>
                      <StickyNote />
                      Salvar nota
                    </Button>
                  </div>
                </div>
                {related.notes.length === 0 ? (
                  <p className="text-xs text-muted-foreground">Nenhuma nota ainda.</p>
                ) : (
                  <ul className="space-y-2">
                    {related.notes.map((n) => (
                      <li key={n.id} className="rounded-lg border bg-surface p-3">
                        <p className="text-sm whitespace-pre-wrap">{n.text}</p>
                        <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
                          <UserAvatar userId={n.authorId} size="xs" showName />
                          <span className="num">{formatDateTime(n.createdAt)}</span>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </Panel>
            </TabsContent>
          </Tabs>
        </div>
      </div>

      <LeadFormDialog open={editOpen} onOpenChange={setEditOpen} lead={lead} />
    </>
  )
}
