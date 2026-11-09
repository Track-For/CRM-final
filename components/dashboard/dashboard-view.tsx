"use client"

import { DailyActions } from "@/components/dashboard/daily-actions"
import { ChevronDown } from "lucide-react"
import { useMemo, useState } from "react"
import Link from "next/link"
import { AlarmClock, ArrowRight, CalendarDays, CheckCircle2, CircleDollarSign, Clock, Percent, Receipt, Repeat, TriangleAlert, UserRound } from "lucide-react"
import { Button } from "@/components/ui/button"
import { ChartCard } from "@/components/shared/chart-card"
import { EmptyState } from "@/components/shared/empty-state"
import { PageHeader } from "@/components/shared/page-header"
import { Panel } from "@/components/shared/panel"
import { ReportTable } from "@/components/reports/report-table"
import { StatCard } from "@/components/shared/stat-card"
import { StatusBadge } from "@/components/shared/status-badge"
import { UserAvatar } from "@/components/shared/user-avatar"
import { stageName } from "@/components/sales/utils"
import { usePipelines } from "@/lib/data"
import { FunnelBars, RevenueChart, SourceBarChart } from "@/components/dashboard/charts"
import { useReceiptMetrics } from "@/lib/finance/use-receipt-metrics"
import { computeKpis, funnel, leadsIn } from "@/components/dashboard/metrics"
import {
  EVENT_TYPE_COLOR,
  EVENT_TYPE_LABEL,
  PAYMENT_METHOD_LABEL,
  SOURCE_COLOR,
  SOURCE_LABEL,
  TASK_PRIORITY_LABEL,
  TASK_PRIORITY_TONE,
} from "@/lib/constants"
import { useById, useCharges, useCurrentUser, useDeals, useEntries, useEvents, useLeads, useSubscriptions, useTasks } from "@/lib/data"
import { dealIdleDays, isStaleDeal, periodMonthBuckets, revenueByMonth } from "@/lib/data/selectors"
import { daysSince, formatDate, formatDateLong, formatMoney, formatNumber, formatPercent, formatTime } from "@/lib/format"
import { delta, getPeriodRange } from "@/lib/period"
import { useUiStore } from "@/lib/store/ui-store"
import type { LeadSource } from "@/types"

function ListLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Button asChild variant="ghost" size="xs" className="text-muted-foreground">
      <Link href={href}>
        {children}
        <ArrowRight />
      </Link>
    </Button>
  )
}

export function DashboardView() {
  const pipelines = usePipelines()
  const period = useUiStore((s) => s.period)
  const leads = useLeads()
  const deals = useDeals()
  const subscriptions = useSubscriptions()
  const charges = useCharges()
  const entries = useEntries()
  const events = useEvents()
  const tasks = useTasks()
  const clients = useById("clients")
  const leadMap = useById("leads")
  const user = useCurrentUser()

  const range = useMemo(() => getPeriodRange(period), [period])

  const { kpis, prev } = useMemo(() => {
    const data = { leads, deals, subscriptions, charges, entries }
    return {
      kpis: computeKpis({ from: range.from, to: range.to }, data),
      prev: computeKpis({ from: range.previousFrom, to: range.previousTo }, data),
    }
  }, [range, leads, deals, subscriptions, charges, entries])

  const revenueBuckets = useMemo(() => periodMonthBuckets(range), [range])
  const receipts = useReceiptMetrics(range, revenueBuckets)

  const bySource = useMemo(() => {
    const list = leadsIn(leads, range)
    return (Object.keys(SOURCE_LABEL) as LeadSource[])
      .map((s) => ({ label: SOURCE_LABEL[s], value: list.filter((l) => l.source === s).length, color: SOURCE_COLOR[s] }))
      .filter((d) => d.value > 0)
      .sort((a, b) => b.value - a.value)
  }, [leads, range])

  const revenue = useMemo(() => revenueByMonth(entries, revenueBuckets).map((row, i) => ({ ...row, realizado: receipts.data?.months[i]?.total ?? 0, mensalidades: receipts.data?.months[i]?.monthly ?? 0, outras: receipts.data?.months[i]?.other ?? 0, pagamentos: receipts.data?.months[i]?.count ?? 0 })), [entries, revenueBuckets, receipts.data])
  const undatedForecast = useMemo(() => {
    const pending = entries.filter(entry => entry.type === "receita" && !entry.dueDate && (entry.status === "pendente" || entry.status === "vencido"))
    return { amount: pending.reduce((total, entry) => total + Math.round(entry.amount * 100), 0) / 100, count: pending.length }
  }, [entries])
  const funnelData = useMemo(() => funnel(deals), [deals])

  const [now] = useState(() => Date.now())
  const upcoming = useMemo(
    () => events.filter((e) => new Date(e.end).getTime() >= now).sort((a, b) => a.start.localeCompare(b.start)).slice(0, 6),
    [events, now],
  )
  const overdueTasks = useMemo(
    () => tasks.filter((t) => t.status !== "done" && new Date(t.dueDate).getTime() < now).sort((a, b) => a.dueDate.localeCompare(b.dueDate)).slice(0, 6),
    [tasks, now],
  )
  const staleDeals = useMemo(() => deals.filter(isStaleDeal).sort((a, b) => dealIdleDays(b) - dealIdleDays(a)).slice(0, 6), [deals])
  const lastPaid = useMemo(
    () => charges.filter((c) => c.status === "pago" && c.paidAt).sort((a, b) => b.paidAt!.localeCompare(a.paidAt!)).slice(0, 6),
    [charges],
  )

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Olá, ${user?.name.split(" ")[0] ?? "time"}`}
        description="Veja os resultados do negócio e o que precisa da sua atenção."
        actions={
          <div className="flex flex-wrap gap-2"><Button asChild variant="outline"><Link href="/agenda"><CalendarDays />Agenda</Link></Button><Button onClick={() => useUiStore.getState().openQuickCreate("task")}><CheckCircle2 />Nova tarefa</Button></div>
        }
      />

      <section aria-labelledby="dashboard-results-title" className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id="dashboard-results-title" className="text-lg font-semibold">Resultados do período</h2>
          <span className="text-sm text-muted-foreground">{range.label}</span>
        </div>
        <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
          <StatCard label="Receita recebida" icon={CircleDollarSign} value={receipts.data ? formatMoney(receipts.data.current.total) : "—"} loading={receipts.loading} delta={receipts.data ? delta(receipts.data.current.total, receipts.data.previous.total) : null} hint="projetos + mensalidades · data do pagamento" highlight />
          <StatCard label="Mensalidades recebidas" icon={CheckCircle2} value={receipts.data ? formatMoney(receipts.data.current.monthly) : "—"} loading={receipts.loading} delta={receipts.data ? delta(receipts.data.current.monthly, receipts.data.previous.monthly) : null} hint="já incluídas na receita recebida" valueClassName="text-success" />
          <StatCard label="A receber no mês" icon={CalendarDays} value={formatMoney(kpis.receivable)} hint="pendente + vencido no mês de referência" />
          <StatCard label="Novos leads" icon={UserRound} value={formatNumber(kpis.leads)} delta={delta(kpis.leads, prev.leads)} hint="vs período anterior" />
        </div>
      </section>

      {receipts.error && <p role="alert" className="text-sm text-destructive">{receipts.error}</p>}
      {!!receipts.data?.undated && <p className="text-xs text-muted-foreground">{receipts.data.undated} recebimento(s) sem data de pagamento válida não entram nos totais. Corrija a data no Financeiro.</p>}

      <DailyActions />

      {receipts.enabled && <details className="group/months rounded-2xl border bg-card shadow-[0_2px_6px_#17243b03]"><summary className="flex items-center justify-between gap-4 p-5 sm:px-6"><span><span className="block text-sm font-semibold">Histórico de recebimentos</span><span className="mt-1 block text-xs text-muted-foreground">{range.label} · Consulte os valores mês a mês</span></span><span className="flex size-8 shrink-0 items-center justify-center rounded-lg border text-primary transition-transform group-open/months:rotate-180"><ChevronDown className="size-4" /></span></summary><Panel className="rounded-t-none border-x-0 border-b-0 shadow-none" title="Recebimentos por mês" description="Histórico pela data real do pagamento. Mensalidades já estão incluídas no total recebido." actions={<Button asChild variant="outline" size="sm"><Link href="/relatorios">Ver relatórios</Link></Button>}>
        {!receipts.data ? <p role="status" className="text-sm text-muted-foreground">{receipts.loading ? "Carregando histórico de recebimentos…" : "Histórico indisponível. Atualize a página para tentar novamente."}</p> : <ReportTable rows={revenue} getKey={r => r.month} columns={[
          { key: "mes", label: "Mês", render: r => <span className="capitalize">{r.month}</span> },
          { key: "outras", label: "Projetos e outras receitas", align: "right", render: r => formatMoney(r.outras) },
          { key: "mensalidades", label: "Mensalidades recebidas", align: "right", render: r => formatMoney(r.mensalidades) },
          { key: "total", label: "Total recebido", align: "right", render: r => <strong>{formatMoney(r.realizado)}</strong> },
          { key: "pagamentos", label: "Pagamentos registrados", align: "right", render: r => r.pagamentos || "Nenhum" },
        ]} />}
        <p className="mt-3 text-xs text-muted-foreground">Um mês sem pagamentos registrados aparece zerado. Se um pagamento antigo foi baixado com a data de hoje, corrija a data na cobrança para que ele apareça no mês em que foi recebido.</p>
      </Panel></details>}

      <details className="group rounded-2xl border bg-card p-5">
        <summary className="flex flex-wrap items-center justify-between gap-2"><div><h2 className="text-lg font-semibold">Análise detalhada</h2><p className="mt-1 text-sm text-muted-foreground">{range.label} · Conversão, receita e histórico</p></div><span className="flex items-center gap-2 text-xs font-medium text-primary"><span className="group-open:hidden">Ver análise</span><span className="hidden group-open:inline">Recolher</span><ChevronDown className="size-4 transition-transform group-open:rotate-180" /></span></summary>
        <div className="mt-6 space-y-6">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard label="Taxa de conversão" icon={Percent} value={formatPercent(kpis.conversion)} delta={delta(kpis.conversion, prev.conversion)} hint="ganhos / leads" />
        <StatCard label="Ticket médio contratado" icon={Receipt} value={formatMoney(kpis.ticket)} delta={delta(kpis.ticket, prev.ticket)} />
        <StatCard label="MRR mensalidades" icon={Repeat} value={formatMoney(kpis.mrr)} delta={delta(kpis.mrr, prev.mrr)} />
        <StatCard label="Inadimplência" icon={TriangleAlert} value={formatMoney(kpis.overdue)} delta={delta(kpis.overdue, prev.overdue)} invertDelta hint={formatPercent(kpis.overdueRate)} />
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <ChartCard title="Receita por mês" description="Recebido pela data do pagamento e previsto pelo vencimento · histórico do período selecionado" className="xl:col-span-2" height={280} actions={
          <Link href="/financeiro/cobrancas?visao=sem-data" className="block rounded-lg border bg-surface px-3 py-2 hover:border-primary" aria-label={`Previsto sem data: ${formatMoney(undatedForecast.amount)}. Ver cobranças`}>
            <span className="block text-xs text-muted-foreground">Previsto sem data</span>
            <span className="num block text-lg font-semibold text-primary">{formatMoney(undatedForecast.amount)}</span>
            <span className="block text-xs text-muted-foreground">{undatedForecast.count} {undatedForecast.count === 1 ? "cobrança pendente" : "cobranças pendentes"} · Fora das barras mensais</span>
          </Link>
        }>
          <RevenueChart data={revenue} />
        </ChartCard>
        <ChartCard title="Leads por origem" description={range.label} height={280}>
          {bySource.length ? <SourceBarChart data={bySource} /> : <EmptyState compact icon={UserRound} title="Sem leads no período" className="h-full border-0" />}
        </ChartCard>
      </div>

      <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
        <Panel title="Funil resumido" description="Negócios que chegaram em cada etapa" actions={<ListLink href="/funil">Funil</ListLink>}>
          <FunnelBars data={funnelData} stageLabel={stage => stageName(pipelines, undefined, stage)} />
        </Panel>

        <Panel title="Próximos compromissos" actions={<ListLink href="/agenda">Agenda</ListLink>} contentClassName="p-0">
          {upcoming.length === 0 ? (
            <EmptyState compact icon={CalendarDays} title="Nenhum compromisso agendado" className="m-4" />
          ) : (
            <ul className="divide-y">
              {upcoming.map((e) => (
                <li key={e.id}>
                  <Link href="/agenda" className="flex items-center gap-3 px-4 py-2.5 hover:bg-accent">
                    <span className="h-8 w-1 shrink-0 rounded-full" style={{ backgroundColor: EVENT_TYPE_COLOR[e.type] }} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm">{e.title}</p>
                      <p className="truncate text-xs text-muted-foreground capitalize">
                        {formatDateLong(e.start)} · <span className="num">{formatTime(e.start)}</span> · {EVENT_TYPE_LABEL[e.type]}
                      </p>
                    </div>
                    <UserAvatar userId={e.ownerId} />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel title="Tarefas atrasadas" actions={<ListLink href="/tarefas">Tarefas</ListLink>} contentClassName="p-0">
          {overdueTasks.length === 0 ? (
            <EmptyState compact icon={CheckCircle2} title="Nenhuma tarefa atrasada" description="A operação está em dia." className="m-4" />
          ) : (
            <ul className="divide-y">
              {overdueTasks.map((t) => (
                <li key={t.id}>
                  <Link href="/tarefas" className="flex items-center gap-3 px-4 py-2.5 hover:bg-accent">
                    <AlarmClock className="size-4 shrink-0 text-danger" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm">{t.title}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {t.projectName ?? "Sem projeto"} · <span className="num text-danger">{formatDate(t.dueDate)}</span> · {daysSince(t.dueDate)} dias de atraso
                      </p>
                    </div>
                    <StatusBadge tone={TASK_PRIORITY_TONE[t.priority]}>{TASK_PRIORITY_LABEL[t.priority]}</StatusBadge>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel title="Negócios parados há mais de 7 dias" actions={<ListLink href="/kanban">Kanban</ListLink>} contentClassName="p-0" className="xl:col-span-2">
          {staleDeals.length === 0 ? (
            <EmptyState compact icon={Clock} title="Nenhum negócio parado" className="m-4" />
          ) : (
            <ul className="divide-y">
              {staleDeals.map((d) => (
                <li key={d.id}>
                  <Link href={`/vendas/${d.id}`} className="flex items-center gap-3 px-4 py-2.5 hover:bg-accent">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm">{d.title}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {leadMap.get(d.leadId)?.name ?? "—"} · {stageName(pipelines, d.pipelineId, d.stage)}
                      </p>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1 sm:flex-row sm:items-center sm:gap-3">
                      <span className="num text-sm">{formatMoney(d.value)}</span>
                      <StatusBadge tone="danger">
                        <span className="num">{dealIdleDays(d)}</span> dias parado
                      </StatusBadge>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel title="Últimas cobranças pagas" actions={<ListLink href="/financeiro/cobrancas">Cobranças</ListLink>} contentClassName="p-0">
          {lastPaid.length === 0 ? (
            <EmptyState compact icon={Receipt} title="Nenhum pagamento recente" className="m-4" />
          ) : (
            <ul className="divide-y">
              {lastPaid.map((c) => (
                <li key={c.id}>
                  <Link href="/financeiro/cobrancas" className="flex items-center gap-3 px-4 py-2.5 hover:bg-accent">
                    <CheckCircle2 className="size-4 shrink-0 text-success" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm">{clients.get(c.clientId)?.name ?? "—"}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        <span className="num">{c.number}</span> · {PAYMENT_METHOD_LABEL[c.method]} · {formatDate(c.paidAt)}
                      </p>
                    </div>
                    <span className="num text-sm font-medium text-success">{formatMoney(c.amount)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
        </div>
      </details>
    </div>
  )
}
