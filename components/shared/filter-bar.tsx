"use client"

import { useId, useState } from "react"
import { Search, SlidersHorizontal, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { cn } from "@/lib/utils"
import type { Option } from "@/lib/constants"

export const ALL = "__all"

export interface FilterDef {
  key: string
  label: string
  options: Option[]
  value: string
  onChange: (value: string) => void
}

interface FilterBarProps {
  search?: string
  onSearch?: (value: string) => void
  searchPlaceholder?: string
  filters?: FilterDef[]
  onClear?: () => void
  children?: React.ReactNode
  className?: string
}

/** Barra de busca + filtros em select. Valor `ALL` significa "sem filtro". */
export function FilterBar({ search, onSearch, searchPlaceholder = "Buscar...", filters = [], onClear, children, className }: FilterBarProps) {
  const [expanded, setExpanded] = useState(false)
  const moreId = useId()
  const primary = filters.length > 3 ? filters.slice(0, 2) : filters
  const extra = filters.length > 3 ? filters.slice(2) : []
  const hiddenActive = extra.filter(f => f.value !== ALL).length
  const activeCount = filters.filter(f => f.value !== ALL).length + (search ? 1 : 0)
  const active = activeCount > 0
  return (
    <div className={cn("mb-4 flex min-w-0 flex-col gap-3 rounded-xl border bg-card p-3 shadow-[0_1px_3px_#17243b03] lg:flex-row lg:flex-wrap lg:items-center", className)}>
      {onSearch && (
        <div className="relative lg:w-72 xl:w-80">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input aria-label={searchPlaceholder} type="search" value={search ?? ""} onChange={(e) => onSearch(e.target.value)} placeholder={searchPlaceholder} className="pl-8" />
        </div>
      )}
      {filters.length > 0 && (
        <div className="grid min-w-0 grid-cols-2 gap-2 sm:flex sm:flex-wrap">
          {primary.map((f) => (
            <Select key={f.key} value={f.value} onValueChange={f.onChange}>
              <SelectTrigger className={cn("w-full sm:w-auto sm:min-w-36", f.value !== ALL && "border-primary/35 text-primary")} aria-label={f.label}>
                <SelectValue placeholder={f.label} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>{f.label}: todos</SelectItem>
                {f.options.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ))}
        </div>
      )}
      {extra.length > 0 && <Button type="button" variant="outline" className={cn("w-fit text-xs", hiddenActive > 0 && "border-primary/30 text-primary")} aria-expanded={expanded} aria-controls={moreId} onClick={() => setExpanded(value => !value)}><SlidersHorizontal className="size-3.5" />{expanded ? "Menos filtros" : "Mais filtros"}{hiddenActive > 0 && <span className="rounded bg-brand-soft px-1.5 tabular-nums">{hiddenActive}</span>}</Button>}
      {onClear && active && (
        <Button variant="ghost" size="sm" onClick={onClear} className="w-fit text-muted-foreground">
          <X />
          Limpar filtros ({activeCount})
        </Button>
      )}
      {children && <div className="flex flex-wrap items-center gap-2 lg:ml-auto">{children}</div>}
      {extra.length > 0 && <div id={moreId} hidden={!expanded} className={cn("w-full border-t pt-3", !expanded && "hidden")}><div className="grid min-w-0 grid-cols-2 gap-2 sm:flex sm:flex-wrap">{extra.map(f => <Select key={f.key} value={f.value} onValueChange={f.onChange}><SelectTrigger className={cn("w-full sm:w-auto sm:min-w-36", f.value !== ALL && "border-primary/35 text-primary")} aria-label={f.label}><SelectValue placeholder={f.label} /></SelectTrigger><SelectContent><SelectItem value={ALL}>{f.label}: todos</SelectItem>{f.options.map(option => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}</SelectContent></Select>)}</div></div>}

    </div>
  )
}

/** Helper: `matches(filter, value)` é true quando o filtro está em "todos". */
export const matches = (filter: string, value: string | undefined) => filter === ALL || filter === value
