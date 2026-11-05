"use client"

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { cn } from "@/lib/utils"
import type { Option } from "@/lib/constants"

interface OptionSelectProps<T extends string> {
  value: T | "" | undefined
  onChange: (value: T) => void
  options: Option<T>[]
  placeholder?: string
  className?: string
  disabled?: boolean
  id?: string
  invalid?: boolean
}

export function OptionSelect<T extends string>({ value, onChange, options, placeholder = "Selecione", className, disabled, id, invalid }: OptionSelectProps<T>) {
  return (
    <Select value={value || undefined} onValueChange={(v) => onChange(v as T)} disabled={disabled}>
      <SelectTrigger id={id} className={cn("w-full", className)} aria-invalid={invalid || undefined}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
