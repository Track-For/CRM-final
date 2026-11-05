"use client"

import { useState } from "react"
import { Copy, Eye, EyeOff, RefreshCw } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { copyToClipboard } from "@/lib/browser"
import { cn } from "@/lib/utils"

interface SecretInputProps {
  value: string
  onChange?: (value: string) => void
  onRegenerate?: () => void
  readOnly?: boolean
  placeholder?: string
  className?: string
  id?: string
}

/** Campo de segredo/token com mostrar/ocultar, copiar e regenerar. */
export function SecretInput({ value, onChange, onRegenerate, readOnly, placeholder, className, id }: SecretInputProps) {
  const [visible, setVisible] = useState(false)
  return (
    <div className={cn("flex items-center gap-1", className)}>
      <Input
        id={id}
        className="num flex-1"
        type={visible ? "text" : "password"}
        value={value}
        readOnly={readOnly}
        placeholder={placeholder}
        onChange={(e) => onChange?.(e.target.value)}
        autoComplete="off"
      />
      <Button type="button" variant="outline" size="icon" onClick={() => setVisible((v) => !v)} aria-label={visible ? "Ocultar" : "Mostrar"}>
        {visible ? <EyeOff /> : <Eye />}
      </Button>
      <Button type="button" variant="outline" size="icon" onClick={() => copyToClipboard(value, "Copiado")} aria-label="Copiar" disabled={!value}>
        <Copy />
      </Button>
      {onRegenerate && (
        <Button type="button" variant="outline" size="icon" onClick={onRegenerate} aria-label="Regenerar">
          <RefreshCw />
        </Button>
      )}
    </div>
  )
}

export function randomToken(prefix: string, length = 24) {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789"
  let out = ""
  for (let i = 0; i < length; i++) out += chars[Math.floor(Math.random() * chars.length)]
  return `${prefix}${out}`
}
