"use client"

import { Panel } from "@/components/shared/panel"
import { ChartSkeleton } from "@/components/shared/skeletons"
import { formatMoney, formatNumber } from "@/lib/format"
import { cn } from "@/lib/utils"

interface ChartCardProps {
  title: string
  description?: string
  actions?: React.ReactNode
  loading?: boolean
  height?: number
  className?: string
  children: React.ReactNode
}

/** Moldura padrão de gráficos (Recharts dentro de ResponsiveContainer). */
export function ChartCard({ title, description, actions, loading, height = 260, className, children }: ChartCardProps) {
  if (loading) return <ChartSkeleton className={className} />
  return (
    <Panel title={title} description={description} actions={actions} className={className}>
      <div style={{ height }} className="w-full">
        {children}
      </div>
    </Panel>
  )
}

/** Props comuns para eixos e grade dos gráficos. */
export const chartAxis = {
  stroke: "#9abcec",
  tick: { fill: "#365b87", fontSize: 11 },
  tickLine: false,
  axisLine: false,
} as const

export const chartGrid = { stroke: "#dceaff", vertical: false } as const

interface TooltipPayload {
  name?: string | number
  value?: number | string
  color?: string
  dataKey?: string | number
}

/** Tooltip sólido, sem transparência, com valores em JetBrains Mono. */
export function ChartTooltip({
  active,
  payload,
  label,
  money = true,
  className,
}: {
  active?: boolean
  payload?: TooltipPayload[]
  label?: string | number
  money?: boolean
  className?: string
}) {
  if (!active || !payload?.length) return null
  return (
    <div className={cn("min-w-36 rounded-lg border bg-popover p-2.5 text-xs shadow-md", className)}>
      {label != null && <p className="mb-1.5 font-medium capitalize">{label}</p>}
      <div className="space-y-1">
        {payload.map((p) => (
          <div key={String(p.dataKey ?? p.name)} className="flex items-center justify-between gap-3">
            <span className="flex items-center gap-1.5 text-muted-foreground">
              <span className="size-2 rounded-sm" style={{ backgroundColor: p.color }} />
              {p.name}
            </span>
            <span className="num font-medium">{typeof p.value === "number" ? (money ? formatMoney(p.value) : formatNumber(p.value)) : p.value}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

export function ChartLegend({ items }: { items: { label: string; color: string }[] }) {
  return (
    <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
      {items.map((i) => (
        <span key={i.label} className="inline-flex items-center gap-1.5">
          <span className="size-2 rounded-sm" style={{ backgroundColor: i.color }} />
          {i.label}
        </span>
      ))}
    </div>
  )
}
