"use client"

import { useMemo } from "react"
import { ArrowDown, ArrowDownRight, ArrowUpRight, Clock, Filter, Percent, Trophy, UserPlus } from "lucide-react"
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts"
import { ChartCard, ChartTooltip, chartAxis, chartGrid } from "@/components/shared/chart-card"
import { EmptyState } from "@/components/shared/empty-state"
import { Panel } from "@/components/shared/panel"
import { StatCard, StatGrid } from "@/components/shared/stat-card"
import { StatusBadge } from "@/components/shared/status-badge"
import { formatDuration, orderedStages, reachedIndex, timeInStages, TONE_COLOR } from "@/components/sales/utils"
import { STAGE_ORDER, STAGE_TONE } from "@/lib/constants"
import { useDeals, useLostReasons, usePipelines } from "@/lib/data"
import { formatNumber, formatPercent } from "@/lib/format"
import { delta, getPeriodRange, inRange } from "@/lib/period"
import { useUiStore } from "@/lib/store/ui-store"
import { cn } from "@/lib/utils"
import type { Deal, StageKey } from "@/types"

function funnelCounts(deals: Deal[], keys: StageKey[]) {
  return keys.map((key) => deals.filter((d) => reachedIndex(d) >= STAGE_ORDER.indexOf(key)).length)
}

function avgCycle(deals: Deal[]) {
  const won = deals.filter((d) => d.wonAt)
  if (!won.length) return 0
  return won.reduce((s, d) => s + (new Date(d.wonAt!).getTime() - new Date(d.createdAt).getTime()) / 86400000, 0) / won.length
}

export function FunnelAnalysis({ pipelineId }: { pipelineId: string | null }) {
  const deals = useDeals()
  const pipelines = usePipelines()
  const lostReasons = useLostReasons()
  const period = useUiStore((s) => s.period)

  const data = useMemo(() => {
    const range = getPeriodRange(period)
    const pipeline = pipelines.find((p) => p.id === pipelineId)
    const scope = deals.filter((d) => !pipelineId || d.pipelineId === pipelineId)
    const current = scope.filter((d) => inRange(d.createdAt, range.from, range.to))
    const previous = scope.filter((d) => inRange(d.createdAt, range.previousFrom, range.previousTo))
    const stages = orderedStages(pipeline).filter((s) => s.kind !== "lost")
    const keys = stages.map((s) => s.key)
    const counts = funnelCounts(current, keys)
    const prevCounts = funnelCounts(previous, keys)

    const conversions = counts.map((c, i) => (i === 0 ? null : counts[i - 1] ? c / counts[i - 1] : null))
    let bottleneck = -1
    conversions.forEach((c, i) => {
      if (c == null) return
      if (bottleneck === -1 || c < (conversions[bottleneck] ?? 1)) bottleneck = i
    })

    const durations = new Map<StageKey, number[]>()
    for (const d of current) {
      const t = timeInStages(d)
      for (const [k, days] of Object.entries(t) as [StageKey, number][]) durations.set(k, [...(durations.get(k) ?? []), days])
    }
    const avgTime = keys.map((k) => {
      const list = durations.get(k) ?? []
      return list.length ? list.reduce((a, b) => a + b, 0) / list.length : null
    })
    const slowest = avgTime.reduce<number>((best, v, i) => (v != null && (best === -1 || v > (avgTime[best] ?? 0)) ? i : best), -1)

    let lost = current.filter((d) => d.stage === "perdido")
    const lostFallback = lost.length === 0
    if (lostFallback) lost = scope.filter((d) => d.stage === "perdido")
    const lostChart = lostReasons
      .map((r) => ({ name: r.label, value: lost.filter((d) => d.lostReasonId === r.id).length }))
      .filter((r) => r.value > 0)
      .sort((a, b) => b.value - a.value)

    const entered = counts[0] ?? 0
    const won = counts[counts.length - 1] ?? 0
    const prevEntered = prevCounts[0] ?? 0
    const prevWon = prevCounts[prevCounts.length - 1] ?? 0
    const conv = entered ? won / entered : 0
    const prevConv = prevEntered ? prevWon / prevEntered : 0

    return {
      range,
      stages,
      counts,
      prevCounts,
      conversions,
      bottleneck,
      avgTime,
      slowest,
      lostChart,
      lostFallback,
      entered,
      won,
      conv,
      enteredDelta: delta(entered, prevEntered),
      wonDelta: delta(won, prevWon),
      convDelta: prevConv ? (conv - prevConv) / prevConv : null,
      cycle: avgCycle(current),
      cycleDelta: delta(avgCycle(current), avgCycle(previous)),
    }
  }, [deals, pipelines, lostReasons, period, pipelineId])

  const max = Math.max(1, ...data.counts)

  return (
    <div className="space-y-6">
      <StatGrid>
        <StatCard label="Entraram no funil" value={formatNumber(data.entered)} icon={UserPlus} delta={data.enteredDelta} hint="vs. período anterior" />
        <StatCard label="Negócios ganhos" value={formatNumber(data.won)} icon={Trophy} delta={data.wonDelta} highlight />
        <StatCard label="Conversão geral" value={formatPercent(data.conv)} icon={Percent} delta={data.convDelta} />
        <StatCard label="Ciclo médio de fechamento" value={data.cycle ? formatDuration(data.cycle) : "—"} icon={Clock} delta={data.cycleDelta} invertDelta />
      </StatGrid>

      {data.entered === 0 ? (
        <EmptyState icon={Filter} title="Nenhum negócio entrou no funil neste período" description="Troque o período no seletor do topo para ver a análise." />
      ) : (
        <div className="grid gap-6 xl:grid-cols-[1.4fr_1fr]">
          <Panel title="Funil visual" description={`Negócios criados em: ${data.range.label.toLowerCase()}`}>
            <div className="space-y-1">
              {data.stages.map((stage, i) => {
                const count = data.counts[i]
                const width = Math.max(6, (count / max) * 100)
                const isBottleneck = i === data.bottleneck
                return (
                  <div key={stage.key}>
                    {i > 0 && (
                      <div className={cn("flex items-center justify-center gap-1.5 py-1 text-[11px]", isBottleneck ? "font-semibold text-warning" : "text-muted-foreground")}>
                        <ArrowDown className="size-3" />
                        <span className="num">{data.conversions[i] == null ? "—" : formatPercent(data.conversions[i]!)}</span>
                        <span>de conversão</span>
                        {isBottleneck && <StatusBadge tone="warning">Gargalo</StatusBadge>}
                      </div>
                    )}
                    <div className="grid grid-cols-[minmax(0,7.5rem)_1fr] items-center gap-3 sm:grid-cols-[10rem_1fr]">
                      <div className="min-w-0">
                        <p className="truncate text-xs font-medium">{stage.name}</p>
                        <p className="num text-[11px] text-muted-foreground">{data.avgTime[i] != null ? `${formatDuration(data.avgTime[i]!)} em média` : "—"}</p>
                      </div>
                      <div className="flex justify-center">
                        <div
                          className={cn("flex h-9 items-center justify-center rounded-md border text-sm font-semibold transition-all", isBottleneck && "outline-2 outline-offset-2 outline-warning")}
                          style={{ width: `${width}%`, backgroundColor: TONE_COLOR[STAGE_TONE[stage.key]], color: STAGE_TONE[stage.key] === "neutral" ? "var(--foreground)" : "#000000", borderColor: "transparent" }}
                        >
                          <span className="num">{count}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </Panel>

          <div className="space-y-6">
            <Panel title="Tempo médio por etapa" description="Calculado pelo histórico de movimentações">
              <ul className="space-y-2.5">
                {data.stages
                  .filter((s) => s.kind === "open")
                  .map((s) => {
                    const i = data.stages.indexOf(s)
                    const v = data.avgTime[i]
                    const maxTime = Math.max(1, ...data.avgTime.map((t) => t ?? 0))
                    const slow = i === data.slowest
                    return (
                      <li key={s.key} className="space-y-1">
                        <div className="flex items-center justify-between gap-2 text-xs">
                          <span className={cn(slow && "font-semibold text-warning")}>
                            {s.name}
                            {slow && " · mais lenta"}
                          </span>
                          <span className="num text-muted-foreground">{v != null ? formatDuration(v) : "—"}</span>
                        </div>
                        <div className="h-1.5 rounded-full bg-muted">
                          <div className={cn("h-1.5 rounded-full", slow ? "bg-warning" : "bg-primary")} style={{ width: `${((v ?? 0) / maxTime) * 100}%` }} />
                        </div>
                      </li>
                    )
                  })}
              </ul>
            </Panel>

            <Panel title="Comparação com o período anterior" contentClassName="p-0">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-xs text-muted-foreground">
                    <th className="px-4 py-2 text-left font-normal">Etapa</th>
                    <th className="px-2 py-2 text-right font-normal">Atual</th>
                    <th className="px-2 py-2 text-right font-normal">Anterior</th>
                    <th className="px-4 py-2 text-right font-normal">Variação</th>
                  </tr>
                </thead>
                <tbody>
                  {data.stages.map((s, i) => {
                    const d = delta(data.counts[i], data.prevCounts[i])
                    return (
                      <tr key={s.key} className="border-b last:border-0">
                        <td className="px-4 py-2 text-xs">{s.name}</td>
                        <td className="num px-2 py-2 text-right">{data.counts[i]}</td>
                        <td className="num px-2 py-2 text-right text-muted-foreground">{data.prevCounts[i]}</td>
                        <td className="px-4 py-2 text-right">
                          {d == null ? (
                            <span className="text-xs text-muted-foreground">novo</span>
                          ) : (
                            <span className={cn("num inline-flex items-center gap-0.5 text-xs", d >= 0 ? "text-success" : "text-danger")}>
                              {d >= 0 ? <ArrowUpRight className="size-3" /> : <ArrowDownRight className="size-3" />}
                              {formatPercent(Math.abs(d))}
                            </span>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </Panel>
          </div>
        </div>
      )}

      <ChartCard
        title="Motivos de perda"
        description={data.lostFallback ? "Sem perdas no período — exibindo o histórico completo" : `Negócios perdidos criados em: ${data.range.label.toLowerCase()}`}
        height={Math.max(180, data.lostChart.length * 44)}
      >
        {data.lostChart.length === 0 ? (
          <EmptyState compact title="Nenhuma perda registrada" className="h-full" />
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data.lostChart} layout="vertical" margin={{ left: 8, right: 24 }}>
              <CartesianGrid {...chartGrid} horizontal={false} vertical />
              <XAxis type="number" allowDecimals={false} {...chartAxis} />
              <YAxis type="category" dataKey="name" width={150} {...chartAxis} />
              <Tooltip cursor={{ fill: "#e9f2ff" }} content={<ChartTooltip money={false} />} />
              <Bar dataKey="value" name="Negócios" radius={[0, 4, 4, 0]} barSize={18}>
                {data.lostChart.map((_, i) => (
                  <Cell key={i} fill={i === 0 ? "var(--danger)" : "var(--chart-muted)"} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </ChartCard>
    </div>
  )
}
