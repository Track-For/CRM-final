"use client"

import { Building2, Clock } from "lucide-react"
import { UserAvatar } from "@/components/shared/user-avatar"
import { PROJECT_TYPE_LABEL, STALE_DEAL_DAYS } from "@/lib/constants"
import { dealIdleDays, isOpenDeal } from "@/lib/data/selectors"
import { formatMoney } from "@/lib/format"
import { cn } from "@/lib/utils"
import type { Deal, Lead } from "@/types"

interface DealCardProps {
  deal: Deal
  lead?: Lead
  /** Cliente vinculado ao negócio, quando houver. */
  clientName?: string
  overlay?: boolean
  onOpen?: () => void
}

export function DealCard({ deal, lead, clientName, overlay, onOpen }: DealCardProps) {
  const idle = dealIdleDays(deal)
  const stale = isOpenDeal(deal) && idle > STALE_DEAL_DAYS
  return (
    <div
      onClick={onOpen}
      className={cn(
        "cursor-grab space-y-2.5 rounded-lg border bg-surface p-3 text-left transition-colors hover:border-[#80ace9]",
        overlay && "border-primary/35 shadow-lg",
        stale && "border-l-2 border-l-danger",
      )}
    >
      <div className="min-w-0">
        <p className="truncate text-sm font-medium">{lead?.name ?? deal.title}</p>
        <p className="truncate text-xs text-muted-foreground">{lead?.company || deal.title}</p>
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="inline-flex rounded-md border bg-card px-1.5 py-0.5 text-[11px] text-muted-foreground">{PROJECT_TYPE_LABEL[deal.projectType]}</span>
        {clientName && (
          <span className="inline-flex min-w-0 max-w-full items-center gap-1 rounded-md border border-primary/35 bg-card px-1.5 py-0.5 text-[11px] text-primary" title="Cliente vinculado">
            <Building2 className="size-3 shrink-0" />
            <span className="truncate">{clientName}</span>
          </span>
        )}
      </div>
      <div className="flex items-baseline justify-between gap-2">
        <span className="num text-sm font-semibold text-primary">{formatMoney(deal.value)}</span>
        {deal.monthlyFee > 0 && <span className="num text-[11px] text-muted-foreground">+ {formatMoney(deal.monthlyFee)}/mês</span>}
      </div>
      <div className="flex items-center justify-between gap-2 border-t pt-2">
        <UserAvatar userId={deal.ownerId} size="xs" showName className="[&>span:last-child]:text-xs" />
        {isOpenDeal(deal) && (
          <span className={cn("num inline-flex items-center gap-1 text-[11px]", stale ? "font-semibold text-danger" : "text-muted-foreground")} title="Dias sem mudar de etapa">
            <Clock className="size-3" />
            {idle} {idle === 1 ? "dia" : "dias"} parado
          </span>
        )}
      </div>
    </div>
  )
}
