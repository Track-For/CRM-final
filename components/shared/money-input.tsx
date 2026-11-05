"use client"

import * as React from "react"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"

interface MoneyInputProps extends Omit<React.ComponentProps<"input">, "value" | "onChange" | "type"> {
  value: number | undefined | null
  onChange: (value: number) => void
}

const fmt = new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })

/** Campo monetário: digita só números, exibe "1.234,56" com prefixo R$. */
export function MoneyInput({ value, onChange, className, ...props }: MoneyInputProps) {
  return (
    <div className="relative">
      <span className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-xs text-muted-foreground">R$</span>
      <Input
        {...props}
        inputMode="numeric"
        className={cn("num pl-8", className)}
        value={fmt.format(value ?? 0)}
        onChange={(e) => {
          const digits = e.target.value.replace(/\D/g, "")
          onChange(digits ? Number(digits) / 100 : 0)
        }}
      />
    </div>
  )
}

/** Campo com máscara (telefone, CPF, CNPJ, CEP). */
export function MaskedInput({ mask, onChange, ...props }: Omit<React.ComponentProps<"input">, "onChange"> & { mask: (v: string) => string; onChange: (value: string) => void }) {
  return <Input {...props} inputMode="numeric" onChange={(e) => onChange(mask(e.target.value))} />
}
