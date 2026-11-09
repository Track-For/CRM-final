"use client"

import { SalesViewNav } from "@/components/sales/sales-view-nav"
import { useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { CalendarCheck, Handshake, Plus, Repeat, Scale, Target } from "lucide-react"
import { Button } from "@/components/ui/button"
import { DataTable, type ColumnDef } from "@/components/shared/data-table"
import { EmptyState } from "@/components/shared/empty-state"
import { FilterBar, ALL, matches } from "@/components/shared/filter-bar"
import { PageHeader } from "@/components/shared/page-header"
import { StatCard, StatGrid } from "@/components/shared/stat-card"
import { StatusBadge } from "@/components/shared/status-badge"
import { UserAvatar } from "@/components/shared/user-avatar"
import { stageName } from "@/components/sales/utils"
import { PROJECT_TYPE_LABEL, SOURCE_LABEL, STAGE_ORDER, STAGE_LABEL, STAGE_TONE, STALE_DEAL_DAYS, toOptions } from "@/lib/constants"
import { useById, useDeals, usePipelines } from "@/lib/data"
import { useEntityOptions } from "@/lib/data/options"
import { useReceiptMetrics } from "@/lib/finance/use-receipt-metrics"
import { dealProbability } from "@/lib/data/deal-forecast"
import { dealIdleDays, isOpenDeal, sum, weightedValue } from "@/lib/data/selectors"
import { formatDate, formatMoney } from "@/lib/format"
import { delta, getPeriodRange, inRange } from "@/lib/period"
import { useUiStore } from "@/lib/store/ui-store"
import { cn } from "@/lib/utils"
import type { Deal } from "@/types"

export function DealsList() {
  const router = useRouter()
  const deals = useDeals()
  const leads = useById("leads")
  const pipelines = usePipelines()
  const { userOptions } = useEntityOptions()
  const period = useUiStore((s) => s.period)
  const openQuickCreate = useUiStore((s) => s.openQuickCreate)

  const [search, setSearch] = useState("")
  const [stage, setStage] = useState(ALL)
  const [pipelineId, setPipelineId] = useState(ALL)
  const [owner, setOwner] = useState(ALL)
  const [type, setType] = useState(ALL)
  const [source, setSource] = useState(ALL)

  const range = useMemo(() => getPeriodRange(period), [period])
  const receipts = useReceiptMetrics(range, [])
  const kpis = useMemo(() => {
    const won = deals.filter((d) => d.stage === "ganho" && inRange(d.wonAt, range.from, range.to))
    const prevWon = deals.filter((d) => d.stage === "ganho" && inRange(d.wonAt, range.previousFrom, range.previousTo))
    const closed = sum(won, (d) => d.value)
    const prevClosed = sum(prevWon, (d) => d.value)
    const ticket = won.length ? closed / won.length : 0
    const prevTicket = prevWon.length ? prevClosed / prevWon.length : 0
    const open = deals.filter(isOpenDeal)
    return {
      label: range.label.toLowerCase(),
      closed,
      closedDelta: delta(closed, prevClosed),
      wonCount: won.length,
      weighted: sum(open, d => weightedValue(d, pipelines, receipts.data?.projectPaidByDeal)),
      openCount: open.length,
      ticket,
      ticketDelta: delta(ticket, prevTicket),
      monthly: sum(won, (d) => d.monthlyFee),
      monthlyDelta: delta(sum(won, (d) => d.monthlyFee), sum(prevWon, (d) => d.monthlyFee)),
    }
  }, [deals, range, pipelines, receipts.data])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return deals.filter((d) => {
      if (!matches(stage, d.stage) || !matches(pipelineId, d.pipelineId) || !matches(owner, d.ownerId) || !matches(type, d.projectType) || !matches(source, d.source)) return false
      if (!q) return true
      const lead = leads.get(d.leadId)
      return `${d.title} ${lead?.name ?? ""} ${lead?.company ?? ""}`.toLowerCase().includes(q)
    })
  }, [deals, leads, search, stage, pipelineId, owner, type, source])

  const columns = useMemo<ColumnDef<Deal, unknown>[]>(
    () => [
      {
        id: "title",
        header: "Negócio",
        accessorFn: (d) => d.title,
        cell: ({ row }) => {
          const lead = leads.get(row.original.leadId)
          return (
            <div className="min-w-0 max-w-72">
              <p className="truncate font-medium">{row.original.title}</p>
              <p className="truncate text-xs text-muted-foreground">
                {lead?.name} · {PROJECT_TYPE_LABEL[row.original.projectType]}
              </p>
            </div>
          )
        },
      },
      {
        id: "stage",
        header: "Etapa",
        accessorFn: (d) => STAGE_ORDER.indexOf(d.stage),
        cell: ({ row }) => <StatusBadge tone={STAGE_TONE[row.original.stage]}>{stageName(pipelines, row.original.pipelineId, row.original.stage)}</StatusBadge>,
      },
      { id: "value", header: "Valor", accessorFn: (d) => d.value, cell: ({ row }) => <span className="num font-medium">{formatMoney(row.original.value)}</span> },
      {
        id: "monthly",
        header: "Mensalidade",
        accessorFn: (d) => d.monthlyFee,
        cell: ({ row }) => <span className="num text-muted-foreground">{row.original.monthlyFee ? formatMoney(row.original.monthlyFee) : "—"}</span>,
      },
      { id: "probability", header: "Prob.", accessorFn: (d) => dealProbability(d, pipelines), cell: ({ row }) => <span className="num">{dealProbability(row.original, pipelines)}%</span> },
      { id: "start", header: "Início", accessorFn: (d) => d.startDate, cell: ({ row }) => <span className="num text-muted-foreground">{formatDate(row.original.startDate)}</span> },
      { id: "owner", header: "Responsável", accessorFn: (d) => d.ownerId, cell: ({ row }) => <UserAvatar userId={row.original.ownerId} showName /> },
      {
        id: "idle",
        header: "Parado",
        accessorFn: (d) => (isOpenDeal(d) ? dealIdleDays(d) : -1),
        cell: ({ row }) => {
          if (!isOpenDeal(row.original)) return <span className="text-muted-foreground">—</span>
          const idle = dealIdleDays(row.original)
          return <span className={cn("num", idle > STALE_DEAL_DAYS ? "font-semibold text-danger" : "text-muted-foreground")}>{idle} {idle === 1 ? "dia" : "dias"}</span>
        },
      },
    ],
    [leads, pipelines],
  )

  return (
    <div className="space-y-6">
      <PageHeader
        title="Vendas"
        description="Todos os negócios do funil comercial"
        actions={
          <Button onClick={() => openQuickCreate("deal")}>
            <Plus />
            Novo negócio
          </Button>
        }
        className="mb-0"
      />
      <SalesViewNav />
      <StatGrid>
        <StatCard label={`Fechado (${kpis.label})`} value={formatMoney(kpis.closed)} icon={Handshake} highlight delta={kpis.closedDelta} hint={`${kpis.wonCount} ganho(s)`} />
        <StatCard label="Previsto ponderado" value={receipts.data ? formatMoney(kpis.weighted) : "—"} loading={receipts.loading} icon={Scale} hint={`${kpis.openCount} negócios · saldo restante × probabilidade da etapa`} />
        <StatCard label="Ticket médio" value={formatMoney(kpis.ticket)} icon={Target} delta={kpis.ticketDelta} hint="vs. período anterior" />
        <StatCard label="Mensalidade nova" value={formatMoney(kpis.monthly)} icon={Repeat} delta={kpis.monthlyDelta} hint="recorrência dos ganhos" />
      </StatGrid>

      <div>
        <FilterBar
          search={search}
          onSearch={setSearch}
          searchPlaceholder="Buscar negócio ou lead"
          filters={[
            { key: "stage", label: "Etapa", value: stage, onChange: setStage, options: toOptions(STAGE_LABEL) },
            { key: "pipeline", label: "Pipeline", value: pipelineId, onChange: setPipelineId, options: pipelines.map((p) => ({ value: p.id, label: p.name })) },
            { key: "owner", label: "Responsável", value: owner, onChange: setOwner, options: userOptions },
            { key: "type", label: "Tipo", value: type, onChange: setType, options: toOptions(PROJECT_TYPE_LABEL) },
            { key: "source", label: "Origem", value: source, onChange: setSource, options: toOptions(SOURCE_LABEL) },
          ]}
          onClear={() => {
            setSearch("")
            setStage(ALL)
            setPipelineId(ALL)
            setOwner(ALL)
            setType(ALL)
            setSource(ALL)
          }}
        />
        <DataTable
          columns={columns}
          data={filtered}
          getRowId={(d) => d.id}
          onRowClick={(d) => router.push(`/vendas/${d.id}`)}
          initialSorting={[{ id: "value", desc: true }]}
          empty={<EmptyState icon={CalendarCheck} title="Nenhum negócio encontrado" description="Ajuste os filtros ou crie um novo negócio." />}
          mobileCard={(d) => {
            const lead = leads.get(d.leadId)
            return (
              <div className="space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{d.title}</p>
                    <p className="truncate text-xs text-muted-foreground">{lead?.name}</p>
                  </div>
                  <StatusBadge tone={STAGE_TONE[d.stage]}>{stageName(pipelines, d.pipelineId, d.stage)}</StatusBadge>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="num text-sm font-semibold text-primary">{formatMoney(d.value)}</span>
                  <span className="num text-muted-foreground">
                    {dealProbability(d, pipelines)}% · Início: {formatDate(d.startDate)}
                  </span>
                </div>
              </div>
            )
          }}
        />
      </div>
    </div>
  )
}
