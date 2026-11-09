"use client"
import { subscriptionActiveAt } from "@/lib/finance/recurring"

import { useMemo, useState } from "react"
import Link from "next/link"
import { Bar, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis, type TooltipContentProps, type TooltipValueType } from "recharts"
import { AlertTriangle, ArrowDownCircle, ArrowUpCircle, CalendarClock, CalendarX, Landmark, Repeat, Scale, Wallet } from "lucide-react"
import { Button } from "@/components/ui/button"
import { ChartCard, ChartLegend, ChartTooltip, chartAxis, chartGrid } from "@/components/shared/chart-card"
import { EmptyState } from "@/components/shared/empty-state"
import { Panel } from "@/components/shared/panel"
import { StatCard, StatGrid } from "@/components/shared/stat-card"
import { ChargeDrawer } from "@/components/finance/charge-drawer"
import { moneyTick } from "@/components/dashboard/charts"
import { useById, useEntries, useSubscriptions } from "@/lib/data"
import { cashFlowMonthly, entriesByCategory, entriesForView, entryTotals, financeSummary, mrr, periodMonthBuckets, upcomingEntries } from "@/lib/data/selectors"
import { daysUntil, formatDate, formatDays, formatMoney, formatPercent } from "@/lib/format"
import { getPeriodRange } from "@/lib/period"
import { useUiStore } from "@/lib/store/ui-store"
import { cn } from "@/lib/utils"
import type { FinancialEntry } from "@/types"

const LIST_LIMIT = 8
const ENTRIES_HREF = "/financeiro/lancamentos"
const OPEN_IN = "color-mix(in srgb, var(--success) 35%, var(--card))"
const OPEN_OUT = "color-mix(in srgb, var(--danger) 35%, var(--card))"

type TooltipPayloadProp = React.ComponentProps<typeof ChartTooltip>["payload"]

/** Esconde o que não tem valor no mês; o saldo aparece mesmo zerado. */
function FlowTooltip({ active, payload, label }: TooltipContentProps<TooltipValueType, string | number>) {
  const visible = payload?.filter((p) => typeof p.value === "number" && (p.value !== 0 || p.dataKey === "saldo"))
  return <ChartTooltip active={active} payload={visible as unknown as TooltipPayloadProp} label={label as string | undefined} />
}

export function FinanceOverview() {
  const entries = useEntries()
  const subscriptions = useSubscriptions()
  const categories = useById("financialCategories")
  const clients = useById("clients")
  const period = useUiStore((s) => s.period)
  const [now] = useState(() => new Date())
  const [chargeId, setChargeId] = useState<string | null>(null)

  const range = useMemo(() => getPeriodRange(period), [period])

  const data = useMemo(() => {
    const inPeriod = entriesForView(entries, "todos", range, now)
    const buckets = periodMonthBuckets(range)
    return {
      undated: entryTotals(entries.filter(e => ["pendente", "vencido"].includes(e.status) && (!e.dueDate || !Number.isFinite(new Date(e.dueDate).getTime())))),
      summary: financeSummary(entries, range, now),
      flow: cashFlowMonthly(entries, buckets, now),
      firstMonth: buckets[0].label,
      lastMonth: buckets[buckets.length - 1].label,
      totals: entryTotals(inPeriod),
      categoriesIn: entriesByCategory(inPeriod, "receita"),
      categoriesOut: entriesByCategory(inPeriod, "despesa"),
      upcoming: upcomingEntries(entries, now),
      overdue: entriesForView(entries, "vencidos", range, now).sort((a, b) => a.dueDate.localeCompare(b.dueDate)),
    }
  }, [entries, range, now])

  const { summary } = data
  const categoryName = (id: string) => categories.get(id)?.name ?? "Sem categoria"
  const partyName = (e: FinancialEntry) => e.supplier || clients.get(e.clientId ?? "")?.name
  const hasFlow = data.flow.some((m) => m.entradasPagas || m.entradasAbertas || m.saidasPagas || m.saidasAbertas)
  const activeSubscriptions = subscriptions.filter(s => subscriptionActiveAt(s, new Date())).length

  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground">
        Período: <span className="font-medium text-foreground">{range.label}</span>. Pago conta na data do pagamento; em aberto, no vencimento.
      </p>

      <StatGrid className="xl:grid-cols-5">
        <StatCard label="Saldo do período" value={formatMoney(summary.saldo)} icon={Landmark} highlight hint="Entradas pagas menos saídas pagas" className="col-span-2 md:col-span-1 xl:col-span-2" valueClassName={summary.saldo < 0 ? "text-danger" : undefined} />
        <StatCard label="Entradas recebidas" value={formatMoney(summary.entradasRecebidas)} icon={ArrowDownCircle} valueClassName="text-success" hint="Pagas no período" />
        <StatCard label="Saídas pagas" value={formatMoney(summary.saidasPagas)} icon={ArrowUpCircle} valueClassName="text-danger" hint="Pagas no período" />
        <StatCard label="Resultado previsto" value={formatMoney(summary.resultadoPrevisto)} icon={Scale} hint="Pago e em aberto do período" valueClassName={summary.resultadoPrevisto < 0 ? "text-danger" : undefined} />
        <StatCard label="A receber" value={formatMoney(summary.aReceber)} icon={Wallet} hint={`${summary.aReceberCount} no prazo, no período`} />
        <StatCard label="A pagar" value={formatMoney(summary.aPagar)} icon={CalendarClock} hint={`${summary.aPagarCount} no prazo, no período`} />
        <StatCard
          label="Vencido a receber"
          value={formatMoney(summary.vencidoReceber)}
          icon={AlertTriangle}
          hint={`${summary.vencidoReceberCount} acumulado(s) até o fim do período`}
          className={summary.vencidoReceber ? "border-[#4a1818]" : undefined}
          valueClassName={summary.vencidoReceber ? "text-danger" : undefined}
        />
        <StatCard
          label="Vencido a pagar"
          value={formatMoney(summary.vencidoPagar)}
          icon={CalendarX}
          hint={`${summary.vencidoPagarCount} acumulado(s) até o fim do período`}
          className={summary.vencidoPagar ? "border-[#4a1818]" : undefined}
          valueClassName={summary.vencidoPagar ? "text-danger" : undefined}
        />
        <StatCard label="MRR vigente" value={formatMoney(mrr(subscriptions))} icon={Repeat} hint={`${activeSubscriptions} mensalidades vigentes`} />
      </StatGrid>

      <ChartCard
        title="Fluxo de caixa"
        description={`De ${data.firstMonth} a ${data.lastMonth}. Barras: pagamentos e vencimentos. Linha: entradas menos saídas pagas de todo o histórico, sem valores em aberto.`}
        height={300}
        actions={
          <ChartLegend
            items={[
              { label: "Entradas recebidas", color: "var(--success)" },
              { label: "Entradas em aberto", color: OPEN_IN },
              { label: "Saídas pagas", color: "var(--danger)" },
              { label: "Saídas em aberto", color: OPEN_OUT },
              { label: "Saldo realizado acumulado", color: "var(--primary)" },
            ]}
          />
        }
      >
        {hasFlow ? (
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={data.flow} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid {...chartGrid} />
              <XAxis dataKey="month" {...chartAxis} />
              <YAxis {...chartAxis} width={68} tickFormatter={moneyTick} />
              <Tooltip content={FlowTooltip} cursor={{ fill: "#e9f2ff" }} />
              <Bar dataKey="entradasPagas" name="Entradas recebidas" stackId="entradas" fill="var(--success)" maxBarSize={18} />
              <Bar dataKey="entradasAbertas" name="Entradas em aberto" stackId="entradas" fill={OPEN_IN} radius={[3, 3, 0, 0]} maxBarSize={18} />
              <Bar dataKey="saidasPagas" name="Saídas pagas" stackId="saidas" fill="var(--danger)" maxBarSize={18} />
              <Bar dataKey="saidasAbertas" name="Saídas em aberto" stackId="saidas" fill={OPEN_OUT} radius={[3, 3, 0, 0]} maxBarSize={18} />
              <Line dataKey="saldo" name="Saldo realizado acumulado" stroke="var(--primary)" strokeWidth={2} dot={{ r: 4, fill: "var(--primary)", stroke: "var(--card)", strokeWidth: 2 }} />
            </ComposedChart>
          </ResponsiveContainer>
        ) : (
          <EmptyState compact title="Sem entradas e saídas nesses meses" className="h-full border-0" />
        )}
      </ChartCard>

      {(data.undated.entradas > 0 || data.undated.saidas > 0) && <div role="note" className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-warning/20 bg-warning-soft p-4 text-sm"><div><p className="font-medium">Em aberto, sem vencimento definido</p><p className="mt-1 text-xs leading-relaxed text-muted-foreground">{data.undated.entradas > 0 && <>A receber: {formatMoney(data.undated.entradas)}. </>}{data.undated.saidas > 0 && <>A pagar: {formatMoney(data.undated.saidas)}. </>}Esses valores ficam fora das barras mensais até que o vencimento seja definido.</p></div><Button asChild size="sm" variant="outline"><Link href="/financeiro/cobrancas?visao=sem-data">Revisar vencimentos</Link></Button></div>}

      <div className="grid gap-4 lg:grid-cols-2">
        <CategoryPanel title="Entradas por categoria" total={data.totals.entradas} rows={data.categoriesIn} color="var(--success)" nameOf={categoryName} emptyTitle="Nenhuma entrada no período" />
        <CategoryPanel title="Saídas por categoria" total={data.totals.saidas} rows={data.categoriesOut} color="var(--danger)" nameOf={categoryName} emptyTitle="Nenhuma saída no período" />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <DuePanel
          title="Próximos vencimentos"
          description="A receber e a pagar, a partir de hoje"
          emptyTitle="Nada a vencer"
          list={data.upcoming}
          partyName={partyName}
          onOpenCharge={setChargeId}
          detail={(e) => {
            const days = Math.max(0, daysUntil(e.dueDate))
            return <span className="text-muted-foreground">{days === 0 ? "vence hoje" : `em ${formatDays(days)}`}</span>
          }}
        />
        <DuePanel
          title="Vencidos"
          description="A receber e a pagar, do mais antigo ao mais recente"
          emptyTitle="Nada vencido"
          list={data.overdue}
          partyName={partyName}
          onOpenCharge={setChargeId}
          detail={(e) => <span className="text-danger">venceu há {formatDays(Math.max(0, -daysUntil(e.dueDate)))}</span>}
        />
      </div>

      <ChargeDrawer chargeId={chargeId} onOpenChange={(o) => !o && setChargeId(null)} />
    </div>
  )
}

function CategoryPanel({
  title,
  total,
  rows,
  color,
  nameOf,
  emptyTitle,
}: {
  title: string
  total: number
  rows: { categoryId: string; value: number; share: number }[]
  color: string
  nameOf: (id: string) => string
  emptyTitle: string
}) {
  return (
    <Panel title={title} description={`Total do período, pago e em aberto: ${formatMoney(total)}`}>
      {rows.length === 0 ? (
        <EmptyState title={emptyTitle} compact />
      ) : (
        <ul className="space-y-3">
          {rows.map((r) => (
            <li key={r.categoryId} className="space-y-1">
              <div className="flex items-baseline justify-between gap-3 text-sm">
                <span className="min-w-0">{nameOf(r.categoryId)}</span>
                <span className="flex shrink-0 items-baseline gap-2">
                  <span className="num text-xs text-muted-foreground">{formatPercent(r.share)}</span>
                  <span className="num font-medium">{formatMoney(r.value)}</span>
                </span>
              </div>
              <div className="h-1.5 rounded-full bg-surface">
                <div className="h-full rounded-full" style={{ width: `${Math.max(1, r.share * 100)}%`, backgroundColor: color }} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  )
}

function DuePanel({
  title,
  description,
  emptyTitle,
  list,
  partyName,
  onOpenCharge,
  detail,
}: {
  title: string
  description: string
  emptyTitle: string
  list: FinancialEntry[]
  partyName: (e: FinancialEntry) => string | undefined
  onOpenCharge: (id: string) => void
  detail: (e: FinancialEntry) => React.ReactNode
}) {
  const hidden = list.length - LIST_LIMIT
  return (
    <Panel
      title={title}
      description={description}
      contentClassName="p-0"
      actions={
        <Button asChild variant="ghost" size="xs">
          <Link href={ENTRIES_HREF}>{hidden > 0 ? `Ver mais ${hidden}` : "Ver todos"}</Link>
        </Button>
      }
    >
      {list.length === 0 ? (
        <EmptyState title={emptyTitle} compact className="m-4" />
      ) : (
        <ul className="divide-y">
          {list.slice(0, LIST_LIMIT).map((e) => {
            const isIn = e.type === "receita"
            const Icon = isIn ? ArrowDownCircle : ArrowUpCircle
            const content = (
              <>
                <Icon className={cn("size-4 shrink-0", isIn ? "text-success" : "text-danger")} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm">{partyName(e) ?? e.description}</p>
                  <p className="text-xs text-muted-foreground">
                    {isIn ? "Entrada" : "Saída"} · <span className="num">{formatDate(e.dueDate)}</span> · {detail(e)}
                  </p>
                </div>
                <span className={cn("num shrink-0 text-sm font-medium whitespace-nowrap", isIn ? "text-success" : "text-danger")}>
                  {isIn ? "+" : "-"} {formatMoney(e.amount)}
                </span>
              </>
            )
            const rowClass = "flex w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-accent"
            return (
              <li key={e.id}>
                {e.chargeId ? (
                  <button type="button" onClick={() => onOpenCharge(e.chargeId!)} className={rowClass}>
                    {content}
                  </button>
                ) : (
                  <Link href={ENTRIES_HREF} className={rowClass}>
                    {content}
                  </Link>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </Panel>
  )
}
