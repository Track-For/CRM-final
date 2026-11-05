"use client"

import { useState } from "react"
import { AlertCircle, CheckCircle2, Eye, EyeOff, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { cn } from "@/lib/utils"

/** Cabeçalho das telas de acesso: título e descrição. */
export function AuthHeading({ title, description }: { title: string; description?: React.ReactNode }) {
  return (
    <div className="mb-6 space-y-1.5">
      <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
      {description && <p className="text-sm text-muted-foreground">{description}</p>}
    </div>
  )
}

/** Aviso inline (erro ou sucesso) anunciado para leitores de tela. */
export function FormMessage({ id, tone, children, className }: { id?: string; tone: "error" | "success"; children: React.ReactNode; className?: string }) {
  const Icon = tone === "error" ? AlertCircle : CheckCircle2
  return (
    <div
      id={id}
      role={tone === "error" ? "alert" : "status"}
      className={cn(
        "flex items-start gap-2 rounded-lg border px-3 py-2.5 text-sm",
        tone === "error" ? "border-[#4a1c1c] bg-danger-soft text-[#fca5a5]" : "border-[#1c4a2c] bg-success-soft text-[#86efac]",
        className,
      )}
    >
      <Icon className="mt-0.5 size-4 shrink-0" aria-hidden />
      <span className="min-w-0">{children}</span>
    </div>
  )
}

interface FieldProps {
  id: string
  label: string
  hint?: React.ReactNode
  error?: string
  action?: React.ReactNode
  children: React.ReactNode
}

/** Campo com rótulo visível, dica e erro associados. */
export function AuthField({ id, label, hint, error, action, children }: FieldProps) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <div className="flex items-center justify-between gap-2">
        <Label htmlFor={id} className="text-xs text-muted-foreground">
          {label}
        </Label>
        {action}
      </div>
      {children}
      {error ? (
        <p id={`${id}-error`} className="text-xs text-danger">
          {error}
        </p>
      ) : hint ? (
        <div id={`${id}-hint`} className="text-xs text-muted-foreground">
          {hint}
        </div>
      ) : null}
    </div>
  )
}

export const authInputClass = "h-10 bg-surface dark:bg-surface"

/** Input de senha com botão mostrar/ocultar. */
export function PasswordInput({ className, ...props }: Omit<React.ComponentProps<"input">, "type">) {
  const [visible, setVisible] = useState(false)
  return (
    <div className="relative">
      <Input type={visible ? "text" : "password"} className={cn(authInputClass, "pr-10", className)} {...props} />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        className="absolute inset-y-0 right-0 flex w-10 items-center justify-center rounded-r-lg text-muted-foreground transition-colors outline-none hover:text-foreground focus-visible:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
        aria-label={visible ? "Ocultar senha" : "Mostrar senha"}
        aria-pressed={visible}
      >
        {visible ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
      </button>
    </div>
  )
}

/** Input de código de 6 dígitos: numérico, aceita colar (remove o que não for dígito). */
export function OtpInput({
  value,
  onValueChange,
  className,
  ...props
}: Omit<React.ComponentProps<"input">, "value" | "onChange" | "type"> & { value: string; onValueChange: (v: string) => void }) {
  return (
    <Input
      type="text"
      inputMode="numeric"
      autoComplete="one-time-code"
      pattern="[0-9]{6}"
      maxLength={6}
      placeholder="000000"
      value={value}
      onChange={(e) => onValueChange(e.target.value.replace(/\D/g, "").slice(0, 6))}
      onPaste={(e) => {
        const digits = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6)
        if (digits) {
          e.preventDefault()
          onValueChange(digits)
        }
      }}
      className={cn(authInputClass, "num h-12 text-center text-2xl tracking-[0.5em] md:text-2xl placeholder:text-[#2e2e2e]", className)}
      {...props}
    />
  )
}

/** Botão de envio com estado pendente. */
export function SubmitButton({ pending, children, pendingLabel, className, ...props }: React.ComponentProps<typeof Button> & { pending: boolean; pendingLabel?: string }) {
  return (
    <Button type="submit" size="lg" disabled={pending} aria-busy={pending} className={cn("h-10 w-full font-semibold", className)} {...props}>
      {pending && <Loader2 className="animate-spin" aria-hidden />}
      {pending ? (pendingLabel ?? children) : children}
    </Button>
  )
}
