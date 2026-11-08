"use client"

import { DailyActions } from "@/components/dashboard/daily-actions"
import { useMemo, useState } from "react"
import Link from "next/link"
import { AlarmClock, ArrowRight, CalendarDays, CheckCircle2, CircleDollarSign, Clock, Percent, Receipt, Repeat, TriangleAlert, UserRound } from "lucide-react"
import { Button } from "@/components/ui/button"
import { ChartCard } from "@/components/shared/chart-card"
import { EmptyState } from "@/components/shared/empty-state"
import { PageHeader } from "@/components/shared/page-header"
import { Panel } from "@/components/shared/panel"
import { StatCard } from "@/components/shared/stat-card"
import { StatusBadge } from "@/components/shared/status-badge"
import { UserAvatar } from "@/components/shared/user-avatar"
import { FunnelBars, RevenueChart, SourceBarChart } from "@/components/dashboard/charts"
import { computeKpis, funnel, leadsIn } from "@/components/dashboard/metrics"
import {
  EVENT_TYPE_COLOR,
  EVENT_TYPE_LABEL,
  PAYMENT_METHOD_LABEL,
  SOURCE_COLOR,
  SOURCE_LABEL,
  STAGE_LABEL,
  TASK_PRIORITY_LABEL,
  TASK_PRIORITY_TONE,
} from "@/lib/constants"
import { useById, useCharges, useCurrentUser, useDeals, useEntries, useEvents, useLeads, useSubscriptions, useTasks } from "@/lib/data"
import { dealIdleDays, isStaleDeal, monthBuckets, revenueByMonth } from "@/lib/data/selectors"
import { daysSince, formatDate, formatDateLong, formatMoney, formatNumber, formatPercent, formatTime } from "@/lib/format"
import { delta, getPeriodRange, inRange } from "@/lib/period"
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
    const data = { leads, deals, subscriptions, charges }
    return {
      kpis: computeKpis({ from: range.from, to: range.to }, data),
      prev: computeKpis({ from: range.previousFrom, to: range.previousTo }, data),
    }
  }, [range, leads, deals, subscriptions, charges])

  const received = useMemo(() => {
    const total = (from: Date, to: Date) => charges
      .filter(charge => charge.status === "pago" && inRange(charge.paidAt, from, to))
      .reduce((amount, charge) => amount + charge.amount, 0)
    return { current: total(range.from, range.to), previous: total(range.previousFrom, range.previousTo) }
  }, [charges, range])

  const bySource = useMemo(() => {
    const list = leadsIn(leads, range)
    return (Object.keys(SOURCE_LABEL) as LeadSource[])
      .map((s) => ({ label: SOURCE_LABEL[s], value: list.filter((l) => l.source === s).length, color: SOURCE_COLOR[s] }))
      .filter((d) => d.value > 0)
      .sort((a, b) => b.value - a.value)
  }, [leads, range])

  const revenue = useMemo(() => revenueByMonth(entries, monthBuckets(-5, 1)), [entries])
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
          <StatCard label="Vendas fechadas" icon={CircleDollarSign} value={formatMoney(kpis.sales)} delta={delta(kpis.sales, prev.sales)} hint="vs período anterior" highlight />
          <StatCard label="Recebido no período" icon={CheckCircle2} value={formatMoney(received.current)} delta={delta(received.current, received.previous)} hint="pagamentos confirmados" valueClassName="text-success" />
          <StatCard label="A receber no mês" icon={CalendarDays} value={formatMoney(kpis.receivable)} hint="pendente + vencido no mês de referência" />
          <StatCard label="Novos leads" icon={UserRound} value={formatNumber(kpis.leads)} delta={delta(kpis.leads, prev.leads)} hint="vs período anterior" />
        </div>
      </section>

      <DailyActions />

      <details className="group rounded-2xl border bg-card p-5">
        <summary className="flex flex-wrap items-center justify-between gap-2"><div><h2 className="text-lg font-semibold">Análise detalhada</h2><p className="mt-1 text-sm text-muted-foreground">{range.label} · Conversão, receita e histórico</p></div><span className="text-sm font-medium text-primary">Ver análise +</span></summary>
        <div className="mt-6 space-y-6">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard label="Taxa de conversão" icon={Percent} value={formatPercent(kpis.conversion)} delta={delta(kpis.conversion, prev.conversion)} hint="ganhos / leads" />
        <StatCard label="Ticket médio" icon={Receipt} value={formatMoney(kpis.ticket)} delta={delta(kpis.ticket, prev.ticket)} />
        <StatCard label="MRR mensalidades" icon={Repeat} value={formatMoney(kpis.mrr)} delta={delta(kpis.mrr, prev.mrr)} />
        <StatCard label="Inadimplência" icon={TriangleAlert} value={formatMoney(kpis.overdue)} delta={delta(kpis.overdue, prev.overdue)} invertDelta hint={formatPercent(kpis.overdueRate)} />
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <ChartCard title="Receita por mês" description="Realizado x previsto (últimos 6 meses e próximo)" className="xl:col-span-2" height={280} actions={
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
          <FunnelBars data={funnelData} />
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
                        {leadMap.get(d.leadId)?.name ?? "—"} · {STAGE_LABEL[d.stage]}
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
