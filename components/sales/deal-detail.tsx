"use client"

import Link from "next/link"
import { Controller, useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { format } from "date-fns"
import { toast } from "sonner"
import {
  ArrowRight,
  CalendarPlus,
  Check,
  FilePlus2,
  FileText,
  History,
  MessageCircle,
  Trophy,
  Wallet,
  XCircle,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { EmptyState } from "@/components/shared/empty-state"
import { FormField, FormGrid } from "@/components/shared/form-field"
import { MoneyInput } from "@/components/shared/money-input"
import { OptionSelect } from "@/components/shared/option-select"
import { PageHeader } from "@/components/shared/page-header"
import { InfoRow, Panel } from "@/components/shared/panel"
import { StatusBadge } from "@/components/shared/status-badge"
import { UserAvatar } from "@/components/shared/user-avatar"
import { useStageMover } from "@/components/sales/use-stage-mover"
import { orderedStages, stageName } from "@/components/sales/utils"
import {
  EVENT_TYPE_LABEL,
  EVENT_TYPE_TONE,
  PROJECT_TYPE_LABEL,
  QUOTE_STATUS_LABEL,
  QUOTE_STATUS_TONE,
  SOURCE_LABEL,
  STAGE_TONE,
  STALE_DEAL_DAYS,
} from "@/lib/constants"
import { newId, useById, useCrm, useDeal, useEvents, useLead, usePipelines, useQuotes } from "@/lib/data"
import { useEntityOptions } from "@/lib/data/options"
import { dealIdleDays, isOpenDeal, weightedValue } from "@/lib/data/selectors"
import { formatDate, formatDateTime, formatDays, formatMoney, whatsappLink } from "@/lib/format"
import { useUiStore } from "@/lib/store/ui-store"
import { cn } from "@/lib/utils"
import { v } from "@/lib/validation"
import type { Deal } from "@/types"

const schema = z.object({
  title: v.required("Título"),
  value: v.money("Valor do projeto"),
  monthlyFee: z.number().min(0, "Mensalidade inválida"),
  probability: z.number({ error: "Informe a probabilidade" }).min(0, "Mínimo 0%").max(100, "Máximo 100%"),
  expectedCloseDate: v.date("Previsão de fechamento"),
  ownerId: v.required("Responsável"),
})
type Values = z.infer<typeof schema>

function DealEditForm({ deal }: { deal: Deal }) {
  const update = useCrm((s) => s.update)
  const currentUserId = useCrm((s) => s.currentUserId)
  const { userOptions } = useEntityOptions()
  const { register, control, handleSubmit, reset, formState } = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: {
      title: deal.title,
      value: deal.value,
      monthlyFee: deal.monthlyFee,
      probability: deal.probability,
      expectedCloseDate: format(new Date(deal.expectedCloseDate), "yyyy-MM-dd"),
      ownerId: deal.ownerId,
    },
  })
  const errors = formState.errors

  const onSubmit = handleSubmit((values) => {
    const history = [...deal.history]
    if (values.value !== deal.value || values.monthlyFee !== deal.monthlyFee) {
      history.push({
        id: newId("dh"),
        type: "value",
        description: `Valor alterado de ${formatMoney(deal.value)} para ${formatMoney(values.value)}`,
        authorId: currentUserId,
        createdAt: new Date().toISOString(),
      })
    }
    if (values.ownerId !== deal.ownerId) {
      history.push({ id: newId("dh"), type: "owner", description: "Responsável alterado", authorId: currentUserId, createdAt: new Date().toISOString() })
    }
    update("deals", deal.id, {
      ...values,
      expectedCloseDate: new Date(`${values.expectedCloseDate}T12:00:00`).toISOString(),
      history,
    })
    reset(values)
    toast.success("Negócio atualizado")
  })

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-4">
      <FormGrid>
        <FormField label="Título" required error={errors.title?.message} className="sm:col-span-2">
          <Input {...register("title")} aria-invalid={!!errors.title} />
        </FormField>
        <FormField label="Valor do projeto" required error={errors.value?.message}>
          <Controller control={control} name="value" render={({ field }) => <MoneyInput value={field.value} onChange={field.onChange} aria-invalid={!!errors.value} />} />
        </FormField>
        <FormField label="Mensalidade" error={errors.monthlyFee?.message}>
          <Controller control={control} name="monthlyFee" render={({ field }) => <MoneyInput value={field.value} onChange={field.onChange} />} />
        </FormField>
        <FormField label="Probabilidade (%)" required error={errors.probability?.message}>
          <Input type="number" min={0} max={100} className="num" {...register("probability", { valueAsNumber: true })} aria-invalid={!!errors.probability} />
        </FormField>
        <FormField label="Previsão de fechamento" required error={errors.expectedCloseDate?.message}>
          <Input type="date" {...register("expectedCloseDate")} />
        </FormField>
        <FormField label="Responsável" required className="sm:col-span-2">
          <Controller control={control} name="ownerId" render={({ field }) => <OptionSelect value={field.value} onChange={field.onChange} options={userOptions} />} />
        </FormField>
      </FormGrid>
      <div className="flex justify-end">
        <Button type="submit" disabled={!formState.isDirty}>
          <Check />
          Salvar alterações
        </Button>
      </div>
    </form>
  )
}

export function DealDetail({ id }: { id: string }) {
  const deal = useDeal(id)
  const lead = useLead(deal?.leadId)
  const pipelines = usePipelines()
  const quotes = useQuotes()
  const events = useEvents()
  const catalog = useById("catalog")
  const users = useById("users")
  const lostReasons = useCrm((s) => s.lostReasons)
  const openQuickCreate = useUiStore((s) => s.openQuickCreate)
  const { requestMove, dialog } = useStageMover()

  if (!deal) {
    return (
      <EmptyState
        title="Negócio não encontrado"
        description="Ele pode ter sido removido ou o link está incorreto."
        action={
          <Button asChild variant="outline" size="sm">
            <Link href="/vendas">Voltar para vendas</Link>
          </Button>
        }
        className="mt-10"
      />
    )
  }

  const pipeline = pipelines.find((p) => p.id === deal.pipelineId)
  const stages = orderedStages(pipeline)
  const openStages = stages.filter((s) => s.kind === "open")
  const currentIdx = openStages.findIndex((s) => s.key === deal.stage)
  const linkedQuotes = quotes.filter((q) => q.dealId === deal.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  const dealEvents = events.filter((e) => e.dealId === deal.id).sort((a, b) => a.start.localeCompare(b.start))
  const idle = dealIdleDays(deal)
  const lostReason = lostReasons.find((r) => r.id === deal.lostReasonId)
  const history = [...deal.history].sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  const waText = lead ? `Olá, ${lead.name.split(" ")[0]}! Tudo bem? Passando para dar sequência ao seu projeto com a Track For.` : ""

  return (
    <div className="space-y-6">
      <PageHeader
        backHref="/vendas"
        backLabel="Vendas"
        title={deal.title}
        description={
          <span className="flex flex-wrap items-center gap-2">
            <StatusBadge tone={STAGE_TONE[deal.stage]}>{stageName(pipelines, deal.pipelineId, deal.stage)}</StatusBadge>
            <span>Pipeline {pipeline?.name ?? "—"}</span>
            <span>·</span>
            <span>{PROJECT_TYPE_LABEL[deal.projectType]}</span>
          </span>
        }
        className="mb-0"
        actions={
          <>
            {lead && (
              <Button asChild variant="outline" size="sm">
                <a href={whatsappLink(lead.whatsapp, waText)} target="_blank" rel="noopener noreferrer">
                  <MessageCircle />
                  WhatsApp
                </a>
              </Button>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={() => openQuickCreate("event", { dealId: deal.id, leadId: deal.leadId, type: "call", title: `Call — ${lead?.name ?? deal.title}` })}
            >
              <CalendarPlus />
              Agendar
            </Button>
            {deal.stage === "ganho" ? (
              <Button
                size="sm"
                onClick={() =>
                  openQuickCreate("charge", { clientId: deal.clientId, dealId: deal.id, amount: String(Math.round(deal.value / 2)), description: `Entrada 50% — ${deal.title}` })
                }
              >
                <Wallet />
                Gerar cobrança
              </Button>
            ) : (
              <Button asChild size="sm">
                <Link href={`/orcamentos/novo?dealId=${deal.id}`}>
                  <FilePlus2 />
                  Gerar orçamento
                </Link>
              </Button>
            )}
          </>
        }
      />

      <Panel title="Etapa do negócio" description="Clique para mover. Perdido exige o motivo.">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
          <div className="grid flex-1 grid-cols-2 gap-1.5 sm:grid-cols-5">
            {openStages.map((s, i) => {
              const done = deal.stage === "ganho" || (currentIdx >= 0 && i < currentIdx)
              const active = s.key === deal.stage
              return (
                <button
                  key={s.key}
                  type="button"
                  onClick={() => requestMove(deal, s.key)}
                  className={cn(
                    "flex h-10 items-center justify-between gap-1 rounded-lg border px-2.5 text-left text-xs transition-colors hover:border-[#444]",
                    active && "border-primary bg-brand-soft font-semibold text-primary",
                    done && !active && "bg-surface text-foreground",
                    !done && !active && "text-muted-foreground",
                  )}
                >
                  <span className="truncate">{s.name}</span>
                  <span className="num shrink-0 text-[10px] opacity-70">{s.probability}%</span>
                </button>
              )
            })}
          </div>
          <div className="grid grid-cols-2 gap-1.5 lg:w-64">
            <Button variant={deal.stage === "ganho" ? "default" : "outline"} onClick={() => requestMove(deal, "ganho")} className={cn(deal.stage !== "ganho" && "text-success")}>
              <Trophy />
              Ganho
            </Button>
            <Button variant={deal.stage === "perdido" ? "destructive" : "outline"} onClick={() => requestMove(deal, "perdido")} className={cn(deal.stage !== "perdido" && "text-danger")}>
              <XCircle />
              Perdido
            </Button>
          </div>
        </div>
      </Panel>

      <div className="grid gap-6 xl:grid-cols-[1fr_360px]">
        <div className="min-w-0 space-y-6">
          <Panel title="Dados do negócio">
            <DealEditForm key={`${deal.id}-${deal.stage}-${deal.probability}`} deal={deal} />
          </Panel>

          <Panel
            title="Orçamentos vinculados"
            actions={
              <Button asChild variant="ghost" size="sm">
                <Link href={`/orcamentos/novo?dealId=${deal.id}`}>
                  <FilePlus2 />
                  Novo
                </Link>
              </Button>
            }
            contentClassName="p-0"
          >
            {linkedQuotes.length === 0 ? (
              <EmptyState compact icon={FileText} title="Nenhum orçamento ainda" description="Gere um orçamento a partir do catálogo." className="m-4" />
            ) : (
              <ul className="divide-y">
                {linkedQuotes.map((q) => (
                  <li key={q.id}>
                    <Link href={`/orcamentos/${q.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-accent">
                      <FileText className="size-4 shrink-0 text-muted-foreground" />
                      <div className="min-w-0 flex-1">
                        <p className="num text-sm font-medium">{q.number}</p>
                        <p className="truncate text-xs text-muted-foreground">
                          {catalog.get(q.catalogItemId)?.name ?? "—"} · {formatDays(q.deadlineDays)} · válido até {formatDate(q.validUntil)}
                        </p>
                      </div>
                      <div className="flex shrink-0 flex-col items-end gap-1">
                        <span className="num text-sm font-semibold">{formatMoney(q.total)}</span>
                        <StatusBadge tone={QUOTE_STATUS_TONE[q.status]}>{QUOTE_STATUS_LABEL[q.status]}</StatusBadge>
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          <Panel title="Histórico" actions={<History className="size-4 text-muted-foreground" />}>
            {history.length === 0 ? (
              <p className="text-sm text-muted-foreground">Sem movimentações.</p>
            ) : (
              <ol className="relative space-y-4 border-l pl-5">
                {history.map((h) => (
                  <li key={h.id} className="relative">
                    <span
                      className={cn(
                        "absolute top-1.5 -left-[25px] size-2.5 rounded-full border-2 border-background",
                        h.type === "won" ? "bg-success" : h.type === "lost" ? "bg-danger" : h.type === "stage" ? "bg-primary" : "bg-muted-foreground",
                      )}
                    />
                    <p className="text-sm">{h.description}</p>
                    {h.fromStage && h.toStage && (
                      <p className="mt-0.5 flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
                        {stageName(pipelines, deal.pipelineId, h.fromStage)}
                        <ArrowRight className="size-3" />
                        <span className="text-foreground">{stageName(pipelines, deal.pipelineId, h.toStage)}</span>
                      </p>
                    )}
                    <p className="num mt-0.5 text-[11px] text-muted-foreground">
                      {formatDateTime(h.createdAt)} · {users.get(h.authorId)?.name ?? "Sistema"}
                    </p>
                  </li>
                ))}
              </ol>
            )}
          </Panel>
        </div>

        <div className="space-y-6">
          <Panel title="Resumo">
            <InfoRow label="Valor do projeto" mono>
              <span className="text-primary">{formatMoney(deal.value)}</span>
            </InfoRow>
            <InfoRow label="Mensalidade" mono>
              {deal.monthlyFee ? `${formatMoney(deal.monthlyFee)}/mês` : "—"}
            </InfoRow>
            <InfoRow label="Probabilidade" mono>
              {deal.probability}%
            </InfoRow>
            <InfoRow label="Valor ponderado" mono>
              {formatMoney(weightedValue(deal))}
            </InfoRow>
            <InfoRow label="Previsão de fechamento" mono>
              {formatDate(deal.expectedCloseDate)}
            </InfoRow>
            {deal.wonAt && (
              <InfoRow label="Ganho em" mono>
                {formatDate(deal.wonAt)}
              </InfoRow>
            )}
            <InfoRow label="Origem">{SOURCE_LABEL[deal.source]}</InfoRow>
            <InfoRow label="Responsável">
              <UserAvatar userId={deal.ownerId} showName />
            </InfoRow>
            <InfoRow label="Criado em" mono>
              {formatDate(deal.createdAt)}
            </InfoRow>
            {isOpenDeal(deal) && (
              <InfoRow label="Sem movimentação">
                <span className={cn("num", idle > STALE_DEAL_DAYS && "font-semibold text-danger")}>{idle} {idle === 1 ? "dia" : "dias"}</span>
              </InfoRow>
            )}
          </Panel>

          {deal.stage === "perdido" && (
            <Panel title="Motivo da perda" className="border-[#4a1818]">
              <p className="text-sm font-medium text-danger">{lostReason?.label ?? "Não informado"}</p>
              {deal.lostNote && <p className="mt-1 text-sm text-muted-foreground">{deal.lostNote}</p>}
              {deal.lostAt && <p className="num mt-2 text-xs text-muted-foreground">Perdido em {formatDate(deal.lostAt)}</p>}
            </Panel>
          )}

          <Panel
            title="Lead"
            actions={
              lead && (
                <Button asChild variant="ghost" size="sm">
                  <Link href={`/leads/${lead.id}`}>Abrir ficha</Link>
                </Button>
              )
            }
          >
            {lead ? (
              <>
                <InfoRow label="Nome">{lead.name}</InfoRow>
                <InfoRow label="Empresa">{lead.company || "—"}</InfoRow>
                <InfoRow label="WhatsApp" mono>
                  {lead.whatsapp}
                </InfoRow>
                <InfoRow label="E-mail">{lead.email || "—"}</InfoRow>
                {deal.clientId && (
                  <div className="pt-2">
                    <Button asChild variant="outline" size="sm" className="w-full">
                      <Link href={`/clientes/${deal.clientId}`}>Ver cliente</Link>
                    </Button>
                  </div>
                )}
              </>
            ) : (
              <p className="text-sm text-muted-foreground">Lead não encontrado.</p>
            )}
          </Panel>

          <Panel title="Compromissos" contentClassName="p-0">
            {dealEvents.length === 0 ? (
              <p className="p-4 text-sm text-muted-foreground">Nenhum compromisso vinculado.</p>
            ) : (
              <ul className="divide-y">
                {dealEvents.map((e) => (
                  <li key={e.id} className="flex items-start justify-between gap-2 px-4 py-2.5">
                    <div className="min-w-0">
                      <p className="truncate text-sm">{e.title}</p>
                      <p className="num text-xs text-muted-foreground">{formatDateTime(e.start)}</p>
                    </div>
                    <StatusBadge tone={EVENT_TYPE_TONE[e.type]}>{EVENT_TYPE_LABEL[e.type]}</StatusBadge>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>
      </div>
      {dialog}
    </div>
  )
}
