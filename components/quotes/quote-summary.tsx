"use client"

import { AlertTriangle } from "lucide-react"
import { formatDays, formatMoney } from "@/lib/format"
import type { QuoteCalculation } from "@/lib/pricing"
import { cn } from "@/lib/utils"
import type { PaymentCondition, PricingRules } from "@/types"
import { paymentDescription } from "./quote-utils"

interface QuoteSummaryProps {
  calc: QuoteCalculation
  rules: PricingRules
  payment: PaymentCondition
  hasItem: boolean
  priceFrom?: boolean
  partyName?: string
  actions?: React.ReactNode
  className?: string
}

export function BelowMinimumAlert({ rules, total }: { rules: PricingRules; total: number }) {
  return (
    <div className="flex gap-2 rounded-lg border border-[#4a1818] bg-danger-soft p-3 text-xs text-danger">
      <AlertTriangle className="mt-0.5 size-4 shrink-0" />
      <div>
        <p className="font-medium">Abaixo do preço mínimo</p>
        <p className="mt-0.5 text-danger/90">
          O total de <span className="num">{formatMoney(total)}</span> está abaixo do mínimo configurado de <span className="num">{formatMoney(rules.minPrice)}</span>. Revise descontos ou escopo.
        </p>
      </div>
    </div>
  )
}

/** Resumo de preço que recalcula em tempo real ao lado do formulário. */
export function QuoteSummary({ calc, rules, payment, hasItem, priceFrom, partyName, actions, className }: QuoteSummaryProps) {
  return (
    <div className={cn("flex flex-col gap-4 rounded-xl border bg-card p-4", className)}>
      <div>
        <p className="text-xs font-medium text-muted-foreground">Resumo do orçamento</p>
        {partyName && <p className="mt-0.5 truncate text-sm">{partyName}</p>}
      </div>

      {!hasItem ? (
        <p className="rounded-lg border border-dashed p-4 text-center text-xs text-muted-foreground">Escolha o tipo de projeto para ver o preço.</p>
      ) : (
        <>
          <div className="space-y-1.5">
            {calc.lines.map((l) => (
              <div key={l.label} className="flex items-start justify-between gap-3 text-sm">
                <span className="min-w-0 text-muted-foreground">{l.label}</span>
                <span className={cn("num shrink-0", l.value < 0 && "text-success")}>{l.value < 0 ? `- ${formatMoney(-l.value)}` : formatMoney(l.value)}</span>
              </div>
            ))}
          </div>
          <div className="border-t pt-3">
            <div className="flex items-end justify-between gap-2">
              <span className="text-sm text-muted-foreground">{priceFrom ? "Total (a partir de)" : "Total"}</span>
              <span className={cn("num text-2xl font-semibold", calc.belowMinimum ? "text-danger" : "text-primary")}>{formatMoney(calc.total)}</span>
            </div>
            <p className="mt-1 text-right text-xs text-muted-foreground">{paymentDescription(payment, calc)}</p>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-lg border bg-surface p-2.5">
              <p className="text-[11px] text-muted-foreground">Prazo</p>
              <p className="num text-sm font-medium">{formatDays(calc.deadlineDays)}</p>
            </div>
            <div className="rounded-lg border bg-surface p-2.5">
              <p className="text-[11px] text-muted-foreground">Mensalidade</p>
              <p className="num text-sm font-medium">{calc.monthlyFee ? `${formatMoney(calc.monthlyFee)}/mês` : "—"}</p>
            </div>
          </div>
          {calc.belowMinimum && <BelowMinimumAlert rules={rules} total={calc.total} />}
        </>
      )}
      {actions && <div className="flex flex-col gap-2">{actions}</div>}
    </div>
  )
}
