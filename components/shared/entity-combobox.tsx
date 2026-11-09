"use client"

import * as React from "react"
import { Check, ChevronsUpDown } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { useFieldAccessibility } from "./field-accessibility"
import { cn } from "@/lib/utils"

export interface ComboOption {
  value: string
  label: string
  hint?: string
  group?: string
}

interface EntityComboboxProps {
  options: ComboOption[]
  value: string | undefined
  onChange: (value: string | undefined) => void
  placeholder?: string
  searchPlaceholder?: string
  emptyLabel?: string
  allowClear?: boolean
  className?: string
  invalid?: boolean
  disabled?: boolean
}

/** Select pesquisável para vincular lead, cliente, negócio etc. */
export function EntityCombobox({
  options,
  value,
  onChange,
  placeholder = "Selecione",
  searchPlaceholder = "Buscar...",
  emptyLabel = "Nenhum resultado",
  allowClear = true,
  className,
  invalid,
  disabled,
}: EntityComboboxProps) {
  const field = useFieldAccessibility()
  const [open, setOpen] = React.useState(false)
  const selected = options.find((o) => o.value === value)
  const groups = React.useMemo(() => {
    const map = new Map<string, ComboOption[]>()
    for (const o of options) {
      const g = o.group ?? ""
      map.set(g, [...(map.get(g) ?? []), o])
    }
    return [...map.entries()]
  }, [options])

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button type="button" variant="outline" role="combobox" disabled={disabled} id={field?.id} aria-labelledby={field?.labelId} aria-describedby={field?.descriptionId} aria-required={field?.required} aria-expanded={open} aria-invalid={invalid || field?.invalid} className={cn("w-full justify-between font-normal", !selected && "text-muted-foreground", className)}>
          <span className="truncate">{selected ? selected.label : placeholder}</span>
          <ChevronsUpDown className="opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-(--radix-popover-trigger-width) min-w-64 p-0" align="start">
        <Command>
          <CommandInput placeholder={searchPlaceholder} />
          <CommandList>
            <CommandEmpty>{emptyLabel}</CommandEmpty>
            {allowClear && value && (
              <CommandGroup>
                <CommandItem
                  value="__clear"
                  onSelect={() => {
                    onChange(undefined)
                    setOpen(false)
                  }}
                  className="text-muted-foreground"
                >
                  Remover seleção
                </CommandItem>
              </CommandGroup>
            )}
            {groups.map(([group, list]) => (
              <CommandGroup key={group || "default"} heading={group || undefined}>
                {list.map((o) => (
                  <CommandItem
                    key={o.value}
                    value={`${o.label} ${o.hint ?? ""} ${o.value}`}
                    onSelect={() => {
                      onChange(o.value)
                      setOpen(false)
                    }}
                  >
                    <Check className={cn("size-4", value === o.value ? "opacity-100 text-primary" : "opacity-0")} />
                    <span className="truncate">{o.label}</span>
                    {o.hint && <span className="ml-auto truncate text-xs text-muted-foreground">{o.hint}</span>}
                  </CommandItem>
                ))}
              </CommandGroup>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
