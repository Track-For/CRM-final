import { cn } from "@/lib/utils"
import type { Tone } from "@/lib/constants"

const toneClass: Record<Tone, string> = {
  neutral: "bg-muted text-muted-foreground border-border",
  brand: "bg-brand-soft text-primary border-primary/35",
  success: "bg-success-soft text-success border-[#16391f]",
  warning: "bg-warning-soft text-warning border-[#4a330b]",
  danger: "bg-danger-soft text-danger border-[#4a1818]",
  info: "bg-info-soft text-info border-[#17305a]",
  purple: "bg-[#1d1230] text-[#c084fc] border-[#352056]",
}

const dotClass: Record<Tone, string> = {
  neutral: "bg-muted-foreground",
  brand: "bg-primary",
  success: "bg-success",
  warning: "bg-warning",
  danger: "bg-danger",
  info: "bg-info",
  purple: "bg-[#c084fc]",
}

interface StatusBadgeProps {
  tone?: Tone
  children: React.ReactNode
  dot?: boolean
  className?: string
}

export function StatusBadge({ tone = "neutral", children, dot = true, className }: StatusBadgeProps) {
  return (
    <span className={cn("inline-flex h-5 shrink-0 items-center gap-1.5 rounded-md border px-1.5 text-[11px] font-medium whitespace-nowrap", toneClass[tone], className)}>
      {dot && <span className={cn("size-1.5 rounded-full", dotClass[tone])} />}
      {children}
    </span>
  )
}

/** Atalho: <EnumBadge value={lead.status} labels={LEAD_STATUS_LABEL} tones={LEAD_STATUS_TONE} /> */
export function EnumBadge<T extends string>({ value, labels, tones, className }: { value: T; labels: Record<T, string>; tones: Record<T, Tone>; className?: string }) {
  return (
    <StatusBadge tone={tones[value]} className={className}>
      {labels[value]}
    </StatusBadge>
  )
}

export const toneTextClass: Record<Tone, string> = {
  neutral: "text-muted-foreground",
  brand: "text-primary",
  success: "text-success",
  warning: "text-warning",
  danger: "text-danger",
  info: "text-info",
  purple: "text-[#c084fc]",
}
