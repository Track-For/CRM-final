"use client"

import type { LucideIcon } from "lucide-react"
import { cn } from "@/lib/utils"

interface SegmentedProps<T extends string> {
  value: T
  onChange: (value: T) => void
  options: { value: T; label: string; icon?: LucideIcon }[]
  className?: string
  "aria-label"?: string
}

/** Controle segmentado simples (troca de visão). */
export function Segmented<T extends string>({ value, onChange, options, className, ...rest }: SegmentedProps<T>) {
  return (
    <div role="group" aria-label={rest["aria-label"]} className={cn("inline-flex h-9 max-w-full items-center overflow-x-auto rounded-lg bg-surface p-1", className)}>
      {options.map((o) => {
        const active = o.value === value
        return (
          <button
            key={o.value}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(o.value)}
            className={cn(
              "inline-flex h-full items-center gap-1.5 rounded-md px-2.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground",
              active && "bg-card text-primary shadow-sm hover:text-primary",
            )}
          >
            {o.icon && <o.icon className="size-3.5" />}
            {o.label}
          </button>
        )
      })}
    </div>
  )
}
