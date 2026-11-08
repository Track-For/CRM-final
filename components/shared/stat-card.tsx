import type { LucideIcon } from "lucide-react"
import { ArrowDownRight, ArrowUpRight } from "lucide-react"
import { Skeleton } from "@/components/ui/skeleton"
import { formatPercent } from "@/lib/format"
import { cn } from "@/lib/utils"

interface StatCardProps {
  label: string
  value: React.ReactNode
  hint?: React.ReactNode
  icon?: LucideIcon
  /** Variação em fração (0.12 = +12%). */
  delta?: number | null
  /** Quando true, queda é positiva (ex.: inadimplência). */
  invertDelta?: boolean
  highlight?: boolean
  loading?: boolean
  className?: string
  /** Cor do valor (ex.: text-success em entradas, text-danger em saídas). */
  valueClassName?: string
}

/** Largura de um caractere de JetBrains Mono em em (0,6), com folga para a fonte reserva. */
const MONO_CHAR_WIDTH = 0.62

/**
 * O valor nunca é cortado: a fonte encolhe só o necessário para o texto inteiro
 * caber em uma linha na largura do card (100cqi / largura do texto em em).
 */
function fitToCard(text: string) {
  const width = Math.max(1, text.length) * MONO_CHAR_WIDTH
  return { "--stat-fit": `calc(100cqi / ${width.toFixed(2)})` } as React.CSSProperties
}

export function StatCard({ label, value, hint, icon: Icon, delta, invertDelta, highlight, loading, className, valueClassName }: StatCardProps) {
  const good = delta != null && (invertDelta ? delta <= 0 : delta >= 0)
  const text = typeof value === "string" || typeof value === "number" ? String(value) : null
  return (
    <div className={cn("flex min-w-0 flex-col gap-4 rounded-xl border bg-card p-4 shadow-[0_2px_8px_#17243b04] sm:p-5", highlight && "border-primary/20 bg-gradient-to-br from-card to-brand-soft/60", className)}>
      <div className="flex items-start justify-between gap-2">
        <span className="min-w-0 text-xs font-medium text-muted-foreground">{label}</span>
        {Icon && <Icon className={cn("size-8 shrink-0 rounded-lg p-1.5", highlight ? "bg-primary/10 text-primary" : "bg-surface text-muted-foreground")} />}
      </div>
      {loading ? (
        <Skeleton className="h-7 w-28" />
      ) : (
        <div className="@container flex min-h-8 min-w-0 items-center">
          <div
            style={text === null ? undefined : fitToCard(text)}
            className={cn(
              "num min-w-0 leading-tight font-semibold",
              text === null ? "text-xl wrap-anywhere sm:text-2xl" : "whitespace-nowrap [font-size:min(1.25rem,var(--stat-fit))] sm:[font-size:min(1.5rem,var(--stat-fit))]",
              highlight && "text-primary",
              valueClassName,
            )}
          >
            {value}
          </div>
        </div>
      )}
      <div className="flex min-h-4 flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
        {delta != null && !loading && (
          <span className={cn("num inline-flex items-center gap-0.5 font-medium", good ? "text-success" : "text-danger")}>
            {delta >= 0 ? <ArrowUpRight className="size-3.5" /> : <ArrowDownRight className="size-3.5" />}
            {formatPercent(Math.abs(delta))}
          </span>
        )}
        {hint && <span className="min-w-0 wrap-anywhere">{hint}</span>}
      </div>
    </div>
  )
}

export function StatGrid({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn("grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4", className)}>{children}</div>
}
