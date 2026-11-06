"use client"

import { Bar, BarChart, CartesianGrid, Cell, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis, type TooltipContentProps, type TooltipValueType } from "recharts"
import { ChartTooltip, chartAxis, chartGrid } from "@/components/shared/chart-card"
import { STAGE_LABEL, STAGE_TONE } from "@/lib/constants"
import { formatMoneyCompact, formatNumber, formatPercent } from "@/lib/format"
import type { StageKey } from "@/types"

type TooltipPayloadProp = React.ComponentProps<typeof ChartTooltip>["payload"]

/** Renderizador de tooltip compatível com Recharts usando o ChartTooltip padrão. */
export function tooltipContent(money = true) {
  function Content(props: TooltipContentProps<TooltipValueType, string | number>) {
    return <ChartTooltip active={props.active} payload={props.payload as unknown as TooltipPayloadProp} label={props.label as string | undefined} money={money} />
  }
  return Content
}

export const moneyTick = (v: number) => formatMoneyCompact(v)

export function SourceBarChart({ data, money = false }: { data: { label: string; value: number; color: string }[]; money?: boolean }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} layout="vertical" margin={{ left: 8, right: 16, top: 4, bottom: 4 }}>
        <CartesianGrid {...chartGrid} horizontal={false} vertical />
        <XAxis type="number" {...chartAxis} allowDecimals={false} tickFormatter={money ? moneyTick : (v: number) => formatNumber(v)} />
        <YAxis type="category" dataKey="label" {...chartAxis} width={92} />
        <Tooltip cursor={{ fill: "#e9f2ff" }} content={tooltipContent(money)} />
        <Bar dataKey="value" name={money ? "Valor" : "Leads"} radius={[0, 4, 4, 0]} barSize={16}>
          {data.map((d) => (
            <Cell key={d.label} fill={d.color} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}

export function RevenueChart({ data }: { data: { month: string; realizado: number; previsto: number }[] }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <ComposedChart data={data} margin={{ left: 0, right: 8, top: 8, bottom: 0 }}>
        <CartesianGrid {...chartGrid} />
        <XAxis dataKey="month" {...chartAxis} />
        <YAxis {...chartAxis} width={64} tickFormatter={moneyTick} />
        <Tooltip cursor={{ fill: "#e9f2ff" }} content={tooltipContent(true)} />
        <Bar dataKey="previsto" name="Previsto" fill="#c9ddfa" radius={[4, 4, 0, 0]} barSize={22} />
        <Bar dataKey="realizado" name="Realizado" fill="var(--primary)" radius={[4, 4, 0, 0]} barSize={22} />
        <Line dataKey="previsto" name="Previsto" stroke="var(--info)" strokeWidth={2} dot={false} legendType="none" tooltipType="none" />
      </ComposedChart>
    </ResponsiveContainer>
  )
}

const toneColor: Record<string, string> = {
  neutral: "var(--chart-muted)",
  info: "var(--info)",
  purple: "var(--chart-4)",
  brand: "var(--primary)",
  warning: "var(--warning)",
  success: "var(--success)",
  danger: "var(--danger)",
}

/** Funil em barras horizontais centralizadas, com conversão entre etapas. */
export function FunnelBars({ data }: { data: { stage: StageKey; count: number; conversion: number }[] }) {
  const max = Math.max(1, ...data.map((d) => d.count))
  return (
    <div className="flex flex-col gap-2">
      {data.map((d, i) => (
        <div key={d.stage} className="grid grid-cols-[96px_1fr_64px] items-center gap-3 text-xs sm:grid-cols-[120px_1fr_72px]">
          <span className="truncate text-muted-foreground">{STAGE_LABEL[d.stage]}</span>
          <div className="flex h-7 items-center justify-center rounded-md bg-surface">
            <div
              className="flex h-full items-center justify-center rounded-md"
              style={{ width: `${Math.max(8, (d.count / max) * 100)}%`, backgroundColor: toneColor[STAGE_TONE[d.stage]] }}
            >
              <span className="num font-semibold" style={{ color: "#ffffff" }}>
                {d.count}
              </span>
            </div>
          </div>
          <span className="num text-right text-muted-foreground">{i === 0 ? "—" : formatPercent(d.conversion)}</span>
        </div>
      ))}
    </div>
  )
}
