"use client"

import { useMemo, useState } from "react"
import { Bar, BarChart, CartesianGrid, ComposedChart, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts"
import { CalendarDays, CircleDollarSign, Clock, Download, FileDown, Repeat, TrendingDown, UserRound } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { ChartCard, ChartLegend, chartAxis, chartGrid } from "@/components/shared/chart-card"
import { EmptyState } from "@/components/shared/empty-state"
import { MoneyInput } from "@/components/shared/money-input"
import { PageHeader } from "@/components/shared/page-header"
import { Panel } from "@/components/shared/panel"
import { StatCard } from "@/components/shared/stat-card"
import { InitialsAvatar } from "@/components/shared/user-avatar"
import { FunnelBars, RevenueChart, SourceBarChart, moneyTick, tooltipContent } from "@/components/dashboard/charts"
import { avgCloseDays, churnIn, funnel, leadsIn, lostIn, mrrAt, wonIn, type Range } from "@/components/dashboard/metrics"
import { ReportTable } from "@/components/reports/report-table"
import { ROLE_LABEL, SOURCE_COLOR, SOURCE_LABEL, STAGE_LABEL } from "@/lib/constants"
import { downloadCsv } from "@/lib/browser"
import { useAdSpend, useCrm, useDeals, useEntries, useLeads, useLostReasons, usePipelines, useSubscriptions, useUsers } from "@/lib/data"
import { isOpenDeal, monthBuckets, revenueByMonth, sum } from "@/lib/data/selectors"
import { formatDate, formatDays, formatMoney, formatNumber, formatPercent } from "@/lib/format"
import { PERIOD_LABEL, delta, getPeriodRange, type PeriodPreset } from "@/lib/period"
import { useUiStore } from "@/lib/store/ui-store"
import { cn } from "@/lib/utils"
import type { LeadSource } from "@/types"

const PAID_SOURCES: LeadSource[] = ["meta_ads", "google_ads", "instagram"]

function Delta({ value }: { value: number | null }) {
  if (value == null) return <span className="text-muted-foreground">—</span>
  return <span className={cn("num", value >= 0 ? "text-success" : "text-danger")}>{`${value >= 0 ? "+" : "-"}${formatPercent(Math.abs(value))}`}</span>
}

export function ReportsView() {
  const globalPeriod = useUiStore((s) => s.period)
  const [localPeriod, setLocalPeriod] = useState<PeriodPreset | null>(null)
  const period = localPeriod ?? globalPeriod
  const range = useMemo(() => getPeriodRange(period), [period])
  const cur: Range = { from: range.from, to: range.to }
  const prev: Range = { from: range.previousFrom, to: range.previousTo }

  const leads = useLeads()
  const deals = useDeals()
  const entries = useEntries()
  const subscriptions = useSubscriptions()
  const users = useUsers()
  const lostReasons = useLostReasons()
  const pipelines = usePipelines()
  const adSpend = useAdSpend()
  const setSingleton = useCrm((s) => s.setSingleton)

  /* ---------------------------- Comercial ---------------------------- */
  const commercial = useMemo(() => {
    const curLeads = leadsIn(leads, cur)
    const prevLeads = leadsIn(leads, prev)
    const won = wonIn(deals, cur)
    const wonPrev = wonIn(deals, prev)
    const bySource = (Object.keys(SOURCE_LABEL) as LeadSource[]).map((source) => {
      const count = curLeads.filter((l) => l.source === source).length
      const previous = prevLeads.filter((l) => l.source === source).length
      const wonCount = won.filter((d) => d.source === source).length
      return { source, label: SOURCE_LABEL[source], count, previous, delta: delta(count, previous), won: wonCount, conversion: count ? wonCount / count : 0 }
    })
    const createdCur = deals.filter((d) => cur.from <= new Date(d.createdAt) && new Date(d.createdAt) <= cur.to)
    const createdPrev = deals.filter((d) => prev.from <= new Date(d.createdAt) && new Date(d.createdAt) <= prev.to)
    const funnelCur = funnel(createdCur.length ? createdCur : deals)
    const funnelPrev = funnel(createdPrev)
    const stages = funnelCur.map((f, i) => ({ ...f, previous: funnelPrev[i]?.count ?? 0 }))
    const lost = lostIn(deals, cur)
    const reasons = lostReasons
      .map((r) => {
        const list = lost.filter((d) => d.lostReasonId === r.id)
        return { id: r.id, label: r.label, count: list.length, value: sum(list, (d) => d.value) }
      })
      .filter((r) => r.count > 0)
      .sort((a, b) => b.count - a.count)
    const closeByPipeline = pipelines.map((p) => {
      const list = deals.filter((d) => d.pipelineId === p.id && d.stage === "ganho")
      return { id: p.id, name: p.name, won: list.length, days: avgCloseDays(list) }
    })
    return {
      curLeads,
      prevLeads,
      won,
      wonPrev,
      bySource,
      stages,
      usedAllDeals: createdCur.length === 0,
      lost,
      reasons,
      closeDays: avgCloseDays(won.length ? won : deals.filter((d) => d.stage === "ganho")),
      closeDaysPrev: avgCloseDays(wonPrev),
      closeByPipeline,
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leads, deals, lostReasons, pipelines, range])

  /* ----------------------------- Receita ----------------------------- */
  const revenue = useMemo(() => {
    const buckets = monthBuckets(-5, 0)
    const byMonth = revenueByMonth(entries, buckets)
    const now = new Date()
    const months = buckets.map((b, i) => {
      const won = wonIn(deals, b)
      const ref = b.to > now ? now : b.to
      const mrr = mrrAt(subscriptions, ref)
      const mrrStart = mrrAt(subscriptions, new Date(b.from.getTime() - 1))
      const churned = sum(churnIn(subscriptions, b), (s) => s.amount)
      const newMrr = sum(
        subscriptions.filter((s) => b.from <= new Date(s.startDate) && new Date(s.startDate) <= b.to),
        (s) => s.amount,
      )
      return {
        month: b.label,
        realizado: byMonth[i].realizado,
        previsto: byMonth[i].previsto,
        vendas: sum(won, (d) => d.value),
        negocios: won.length,
        ticket: won.length ? sum(won, (d) => d.value) / won.length : 0,
        mrr,
        novo: newMrr,
        churn: churned,
        churnRate: mrrStart ? churned / mrrStart : 0,
      }
    })
    return { months }
  }, [entries, deals, subscriptions])

  /* ------------------------------ Equipe ----------------------------- */
  const team = useMemo(() => {
    const curLeads = leadsIn(leads, cur)
    const won = wonIn(deals, cur)
    return users
      .filter((u) => u.role === "comercial" || u.role === "admin")
      .map((u) => {
        const myLeads = curLeads.filter((l) => l.ownerId === u.id).length
        const myWon = won.filter((d) => d.ownerId === u.id)
        const open = deals.filter((d) => d.ownerId === u.id && isOpenDeal(d))
        const wonValue = sum(myWon, (d) => d.value)
        return {
          id: u.id,
          name: u.name,
          role: ROLE_LABEL[u.role],
          leads: myLeads,
          won: myWon.length,
          wonValue,
          conversion: myLeads ? myWon.length / myLeads : 0,
          ticket: myWon.length ? wonValue / myWon.length : 0,
          pipeline: sum(open, (d) => d.value),
          closeDays: avgCloseDays(myWon),
        }
      })
      .sort((a, b) => b.wonValue - a.wonValue)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [users, leads, deals, range])

  /* --------------------------- Custo por lead ------------------------ */
  const cpl = useMemo(() => {
    const curLeads = leadsIn(leads, cur)
    const won = wonIn(deals, cur)
    const rows = adSpend.map((a) => {
      const count = curLeads.filter((l) => l.source === a.source).length
      const wonList = won.filter((d) => d.source === a.source)
      const revenueWon = sum(wonList, (d) => d.value)
      return {
        source: a.source,
        label: SOURCE_LABEL[a.source],
        amount: a.amount,
        leads: count,
        cpl: count ? a.amount / count : null,
        won: wonList.length,
        cac: wonList.length ? a.amount / wonList.length : null,
        roi: a.amount ? (revenueWon - a.amount) / a.amount : null,
      }
    })
    const amount = sum(rows, (r) => r.amount)
    const leadsTotal = sum(rows.filter((r) => r.amount > 0), (r) => r.leads)
    const wonTotal = sum(rows.filter((r) => r.amount > 0), (r) => r.won)
    return { rows, amount, leadsTotal, cpl: leadsTotal ? amount / leadsTotal : null, cac: wonTotal ? amount / wonTotal : null }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [adSpend, leads, deals, range])

  const setSpend = (source: LeadSource, amount: number) => {
    setSingleton(
      "adSpend",
      adSpend.map((a) => (a.source === source ? { ...a, amount } : a)),
    )
  }

  /* ----------------------------- Resumo ------------------------------ */
  const salesCur = sum(commercial.won, (d) => d.value)
  const salesPrev = sum(commercial.wonPrev, (d) => d.value)
  const ticketCur = commercial.won.length ? salesCur / commercial.won.length : 0
  const ticketPrev = commercial.wonPrev.length ? salesPrev / commercial.wonPrev.length : 0
  const lastMonth = revenue.months[revenue.months.length - 1]
  const prevMonth = revenue.months[revenue.months.length - 2]

  /* ------------------------------ Export ----------------------------- */
  const exports: { key: string; label: string; rows: () => Record<string, string | number | null>[] }[] = [
    {
      key: "leads-por-origem",
      label: "Leads e conversão por origem",
      rows: () => commercial.bySource.map((r) => ({ Origem: r.label, Leads: r.count, "Período anterior": r.previous, Ganhos: r.won, "Conversão (%)": (r.conversion * 100).toFixed(1) })),
    },
    {
      key: "conversao-por-etapa",
      label: "Conversão por etapa",
      rows: () => commercial.stages.map((s) => ({ Etapa: STAGE_LABEL[s.stage], Negócios: s.count, "Período anterior": s.previous, "Conversão da etapa anterior (%)": (s.conversion * 100).toFixed(1) })),
    },
    {
      key: "motivos-de-perda",
      label: "Motivos de perda",
      rows: () => commercial.reasons.map((r) => ({ Motivo: r.label, Negócios: r.count, "Valor perdido": r.value.toFixed(2) })),
    },
    {
      key: "receita-mrr-churn",
      label: "Receita, ticket, MRR e churn por mês",
      rows: () =>
        revenue.months.map((m) => ({
          Mês: m.month,
          Realizado: m.realizado.toFixed(2),
          Previsto: m.previsto.toFixed(2),
          "Vendas fechadas": m.vendas.toFixed(2),
          "Ticket médio": m.ticket.toFixed(2),
          MRR: m.mrr.toFixed(2),
          "MRR novo": m.novo.toFixed(2),
          Churn: m.churn.toFixed(2),
          "Churn (%)": (m.churnRate * 100).toFixed(1),
        })),
    },
    {
      key: "desempenho-por-responsavel",
      label: "Desempenho por responsável",
      rows: () => team.map((t) => ({ Responsável: t.name, Leads: t.leads, Ganhos: t.won, "Valor ganho": t.wonValue.toFixed(2), "Conversão (%)": (t.conversion * 100).toFixed(1), "Ticket médio": t.ticket.toFixed(2), "Pipeline aberto": t.pipeline.toFixed(2), "Tempo médio de fechamento (dias)": t.closeDays ?? "" })),
    },
    {
      key: "custo-por-lead",
      label: "Custo por lead",
      rows: () => cpl.rows.map((r) => ({ Origem: r.label, Investimento: r.amount.toFixed(2), Leads: r.leads, CPL: r.cpl?.toFixed(2) ?? "", Ganhos: r.won, CAC: r.cac?.toFixed(2) ?? "" })),
    },
  ]
  const suffix = `${formatDate(range.from).replace(/\//g, "-")}_${formatDate(range.to).replace(/\//g, "-")}`

  const sourceChart = commercial.bySource.filter((s) => s.count > 0).map((s) => ({ label: s.label, value: s.count, color: SOURCE_COLOR[s.source] }))

  return (
    <div className="space-y-6">
      <PageHeader
        title="Relatórios"
        description={`${range.label}: ${formatDate(range.from)} a ${formatDate(range.to)} · comparado com ${formatDate(range.previousFrom)} a ${formatDate(range.previousTo)}`}
        actions={
          <>
            <Select value={period} onValueChange={(v) => setLocalPeriod(v as PeriodPreset)}>
              <SelectTrigger size="sm" className="w-44" aria-label="Período do relatório">
                <CalendarDays className="size-3.5 text-muted-foreground" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent align="end">
                {(Object.keys(PERIOD_LABEL) as PeriodPreset[]).map((p) => (
                  <SelectItem key={p} value={p}>
                    {PERIOD_LABEL[p]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm">
                  <Download />
                  Exportar CSV
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-64">
                <DropdownMenuLabel className="text-xs text-muted-foreground">Escolha o relatório</DropdownMenuLabel>
                {exports.map((e) => (
                  <DropdownMenuItem key={e.key} onSelect={() => downloadCsv(`${e.key}_${suffix}`, e.rows())}>
                    {e.label}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                toast.info("Gerando PDF", { description: "Use \"Salvar como PDF\" na janela de impressão." })
                setTimeout(() => window.print(), 300)
              }}
            >
              <FileDown />
              Exportar PDF
            </Button>
          </>
        }
      />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <StatCard label="Leads" icon={UserRound} value={formatNumber(commercial.curLeads.length)} delta={delta(commercial.curLeads.length, commercial.prevLeads.length)} hint={`anterior: ${commercial.prevLeads.length}`} />
        <StatCard label="Vendas fechadas" icon={CircleDollarSign} value={formatMoney(salesCur)} delta={delta(salesCur, salesPrev)} highlight />
        <StatCard label="Ticket médio" icon={CircleDollarSign} value={formatMoney(ticketCur)} delta={delta(ticketCur, ticketPrev)} />
        <StatCard label="Tempo médio de fechamento" icon={Clock} value={formatDays(commercial.closeDays)} hint={commercial.closeDaysPrev != null ? `anterior: ${formatDays(commercial.closeDaysPrev)}` : "do lead ao ganho"} />
        <StatCard label="MRR atual" icon={Repeat} value={formatMoney(lastMonth?.mrr ?? 0)} delta={prevMonth ? delta(lastMonth.mrr, prevMonth.mrr) : null} hint="vs mês anterior" />
        <StatCard label="Churn do mês" icon={TrendingDown} value={formatPercent(lastMonth?.churnRate ?? 0)} hint={formatMoney(lastMonth?.churn ?? 0)} />
      </div>

      <Tabs defaultValue="comercial" className="gap-4">
        <div className="-mx-4 overflow-x-auto px-4 md:mx-0 md:px-0">
          <TabsList>
            <TabsTrigger value="comercial">Comercial</TabsTrigger>
            <TabsTrigger value="receita">Receita e MRR</TabsTrigger>
            <TabsTrigger value="equipe">Equipe</TabsTrigger>
            <TabsTrigger value="cpl">Custo por lead</TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="comercial" className="space-y-4">
          <div className="grid gap-4 xl:grid-cols-5">
            <ChartCard title="Leads por origem" description={range.label} className="xl:col-span-2" height={280}>
              {sourceChart.length ? <SourceBarChart data={sourceChart} /> : <EmptyState compact title="Sem leads no período" className="h-full border-0" />}
            </ChartCard>
            <Panel title="Conversão por origem" description="Ganhos no período / leads no período" className="xl:col-span-3">
              <ReportTable
                rows={commercial.bySource}
                getKey={(r) => r.source}
                columns={[
                  { key: "origem", label: "Origem", render: (r) => <span className="inline-flex items-center gap-2"><span className="size-2 rounded-sm" style={{ backgroundColor: SOURCE_COLOR[r.source] }} />{r.label}</span> },
                  { key: "leads", label: "Leads", align: "right", mono: true, render: (r) => r.count },
                  { key: "anterior", label: "Anterior", align: "right", mono: true, render: (r) => r.previous },
                  { key: "var", label: "Variação", align: "right", render: (r) => <Delta value={r.delta} /> },
                  { key: "ganhos", label: "Ganhos", align: "right", mono: true, render: (r) => r.won },
                  { key: "conv", label: "Conversão", align: "right", mono: true, render: (r) => formatPercent(r.conversion) },
                ]}
              />
            </Panel>
          </div>

          <div className="grid gap-4 xl:grid-cols-2">
            <Panel title="Conversão por etapa" description={commercial.usedAllDeals ? "Sem negócios criados no período: exibindo todos os negócios" : "Negócios criados no período que alcançaram cada etapa"}>
              <FunnelBars data={commercial.stages} />
              <ReportTable
                className="mt-4"
                rows={commercial.stages}
                getKey={(r) => r.stage}
                columns={[
                  { key: "etapa", label: "Etapa", render: (r) => STAGE_LABEL[r.stage] },
                  { key: "atual", label: "Atual", align: "right", mono: true, render: (r) => r.count },
                  { key: "anterior", label: "Anterior", align: "right", mono: true, render: (r) => r.previous },
                  { key: "conv", label: "Conv. etapa", align: "right", mono: true, render: (r) => formatPercent(r.conversion) },
                ]}
              />
            </Panel>
            <div className="space-y-4">
              <ChartCard title="Motivos de perda" description={`${commercial.lost.length} negócio(s) perdido(s) · ${formatMoney(sum(commercial.lost, (d) => d.value))}`} height={240}>
                {commercial.reasons.length ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={commercial.reasons} layout="vertical" margin={{ left: 8, right: 16 }}>
                      <CartesianGrid {...chartGrid} horizontal={false} vertical />
                      <XAxis type="number" {...chartAxis} allowDecimals={false} />
                      <YAxis type="category" dataKey="label" {...chartAxis} width={150} />
                      <Tooltip cursor={{ fill: "#141414" }} content={tooltipContent(false)} />
                      <Bar dataKey="count" name="Negócios" fill="var(--danger)" radius={[0, 4, 4, 0]} barSize={14} />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <EmptyState compact icon={TrendingDown} title="Nenhuma perda no período" className="h-full border-0" />
                )}
              </ChartCard>
              <Panel title="Tempo médio de fechamento por pipeline" description="Da criação do negócio até o ganho">
                <ReportTable
                  rows={commercial.closeByPipeline}
                  getKey={(r) => r.id}
                  columns={[
                    { key: "pipe", label: "Pipeline", render: (r) => r.name },
                    { key: "won", label: "Ganhos", align: "right", mono: true, render: (r) => r.won },
                    { key: "dias", label: "Tempo médio", align: "right", mono: true, render: (r) => (r.days == null ? "—" : formatDays(r.days)) },
                  ]}
                />
              </Panel>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="receita" className="space-y-4">
          <div className="grid gap-4 xl:grid-cols-2">
            <ChartCard title="Receita por mês" description="Realizado x previsto, últimos 6 meses" height={280}>
              <RevenueChart data={revenue.months} />
            </ChartCard>
            <ChartCard title="Ticket médio por mês" description="Valor médio dos negócios ganhos" height={280}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={revenue.months} margin={{ left: 0, right: 8, top: 8 }}>
                  <CartesianGrid {...chartGrid} />
                  <XAxis dataKey="month" {...chartAxis} />
                  <YAxis {...chartAxis} width={64} tickFormatter={moneyTick} />
                  <Tooltip content={tooltipContent(true)} />
                  <Line dataKey="ticket" name="Ticket médio" stroke="var(--primary)" strokeWidth={2} dot={{ r: 3, fill: "var(--primary)" }} />
                </LineChart>
              </ResponsiveContainer>
            </ChartCard>
          </div>
          <ChartCard
            title="MRR e churn"
            description="Receita recorrente no fim de cada mês e valor cancelado"
            height={280}
            actions={<ChartLegend items={[{ label: "MRR", color: "var(--primary)" }, { label: "Novo", color: "var(--success)" }, { label: "Churn", color: "var(--danger)" }]} />}
          >
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={revenue.months} margin={{ left: 0, right: 8, top: 8 }}>
                <CartesianGrid {...chartGrid} />
                <XAxis dataKey="month" {...chartAxis} />
                <YAxis {...chartAxis} width={64} tickFormatter={moneyTick} />
                <Tooltip cursor={{ fill: "#141414" }} content={tooltipContent(true)} />
                <Bar dataKey="novo" name="Novo" fill="var(--success)" radius={[4, 4, 0, 0]} barSize={14} />
                <Bar dataKey="churn" name="Churn" fill="var(--danger)" radius={[4, 4, 0, 0]} barSize={14} />
                <Line dataKey="mrr" name="MRR" stroke="var(--primary)" strokeWidth={2} dot={{ r: 3, fill: "var(--primary)" }} />
              </ComposedChart>
            </ResponsiveContainer>
          </ChartCard>
          <Panel title="Resumo mensal">
            <ReportTable
              rows={revenue.months}
              getKey={(r) => r.month}
              columns={[
                { key: "mes", label: "Mês", render: (r) => <span className="capitalize">{r.month}</span> },
                { key: "real", label: "Realizado", align: "right", mono: true, render: (r) => formatMoney(r.realizado) },
                { key: "prev", label: "Previsto", align: "right", mono: true, render: (r) => formatMoney(r.previsto) },
                { key: "vendas", label: "Vendas", align: "right", mono: true, render: (r) => formatMoney(r.vendas) },
                { key: "ticket", label: "Ticket médio", align: "right", mono: true, render: (r) => formatMoney(r.ticket) },
                { key: "mrr", label: "MRR", align: "right", mono: true, render: (r) => formatMoney(r.mrr) },
                { key: "churn", label: "Churn", align: "right", mono: true, render: (r) => `${formatMoney(r.churn)} (${formatPercent(r.churnRate)})` },
              ]}
            />
          </Panel>
        </TabsContent>

        <TabsContent value="equipe" className="space-y-4">
          <ChartCard title="Valor ganho por responsável" description={range.label} height={240}>
            {team.some((t) => t.wonValue > 0) ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={team.map((t) => ({ name: t.name.split(" ")[0], valor: t.wonValue, pipeline: t.pipeline }))} margin={{ left: 0, right: 8, top: 8 }}>
                  <CartesianGrid {...chartGrid} />
                  <XAxis dataKey="name" {...chartAxis} />
                  <YAxis {...chartAxis} width={64} tickFormatter={moneyTick} />
                  <Tooltip cursor={{ fill: "#141414" }} content={tooltipContent(true)} />
                  <Bar dataKey="pipeline" name="Pipeline aberto" fill="#2a2a2a" radius={[4, 4, 0, 0]} barSize={24} />
                  <Bar dataKey="valor" name="Ganho" fill="var(--primary)" radius={[4, 4, 0, 0]} barSize={24} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <EmptyState compact title="Nenhum negócio ganho no período" className="h-full border-0" />
            )}
          </ChartCard>
          <Panel title="Desempenho por responsável">
            <ReportTable
              rows={team}
              getKey={(r) => r.id}
              columns={[
                { key: "nome", label: "Responsável", render: (r) => <span className="inline-flex items-center gap-2"><InitialsAvatar name={r.name} id={r.id} />{r.name}</span> },
                { key: "leads", label: "Leads", align: "right", mono: true, render: (r) => r.leads },
                { key: "won", label: "Ganhos", align: "right", mono: true, render: (r) => r.won },
                { key: "valor", label: "Valor ganho", align: "right", mono: true, render: (r) => <span className="text-primary">{formatMoney(r.wonValue)}</span> },
                { key: "conv", label: "Conversão", align: "right", mono: true, render: (r) => formatPercent(r.conversion) },
                { key: "ticket", label: "Ticket médio", align: "right", mono: true, render: (r) => formatMoney(r.ticket) },
                { key: "pipe", label: "Pipeline aberto", align: "right", mono: true, render: (r) => formatMoney(r.pipeline) },
                { key: "dias", label: "Fechamento", align: "right", mono: true, render: (r) => (r.closeDays == null ? "—" : formatDays(r.closeDays)) },
              ]}
            />
          </Panel>
        </TabsContent>

        <TabsContent value="cpl" className="space-y-4">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <StatCard label="Investimento em anúncios" value={formatMoney(cpl.amount)} hint={range.label} />
            <StatCard label="Leads de mídia paga" value={formatNumber(cpl.leadsTotal)} />
            <StatCard label="Custo por lead" value={cpl.cpl == null ? "—" : formatMoney(cpl.cpl)} highlight />
            <StatCard label="Custo por venda (CAC)" value={cpl.cac == null ? "—" : formatMoney(cpl.cac)} />
          </div>
          <Panel title="Custo por lead por origem" description="Informe quanto foi investido em anúncio em cada origem no período. Os valores são salvos automaticamente.">
            <ReportTable
              rows={[...cpl.rows].sort((a, b) => Number(PAID_SOURCES.includes(b.source)) - Number(PAID_SOURCES.includes(a.source)))}
              getKey={(r) => r.source}
              columns={[
                { key: "origem", label: "Origem", render: (r) => r.label },
                {
                  key: "invest",
                  label: "Investimento",
                  render: (r) => (
                    <div className="w-full min-w-32 md:max-w-44">
                      <MoneyInput value={r.amount} onChange={(v) => setSpend(r.source, v)} aria-label={`Investimento em ${r.label}`} />
                    </div>
                  ),
                },
                { key: "leads", label: "Leads", align: "right", mono: true, render: (r) => r.leads },
                { key: "cpl", label: "CPL", align: "right", mono: true, render: (r) => (r.cpl == null ? "—" : formatMoney(r.cpl)) },
                { key: "won", label: "Ganhos", align: "right", mono: true, render: (r) => r.won },
                { key: "cac", label: "CAC", align: "right", mono: true, render: (r) => (r.cac == null ? "—" : formatMoney(r.cac)) },
                { key: "roi", label: "Retorno", align: "right", render: (r) => <Delta value={r.roi} /> },
              ]}
            />
            <p className="mt-3 text-xs text-muted-foreground">Origens orgânicas (Indicação, Site, WhatsApp, Manual) normalmente ficam com investimento zero.</p>
          </Panel>
        </TabsContent>
      </Tabs>
    </div>
  )
}
