"use client"

import { isValidElement, useId } from "react"
import { Label } from "@/components/ui/label"
import { FieldAccessibilityContext } from "./field-accessibility"
import { cn } from "@/lib/utils"

interface FormFieldProps {
  label: string
  htmlFor?: string
  error?: string
  hint?: string
  required?: boolean
  className?: string
  children: React.ReactNode
}

/** O contexto também associa campos aninhados em Controller, máscaras e selects. */
export function FormField({ label, htmlFor, error, hint, required, className, children }: FormFieldProps) {
  const generatedId = useId()
  const explicitId = isValidElement<{ id?: string }>(children) ? children.props.id : undefined
  const id = htmlFor || explicitId || generatedId
  const labelId = `${id}-label`
  const descriptionId = error || hint ? `${id}-description` : undefined
  return (
    <FieldAccessibilityContext value={{ id, labelId, descriptionId, invalid: error ? true : undefined, required: required || undefined }}>
      <div className={cn("flex min-w-0 flex-col gap-2", className)}>
        <Label id={labelId} htmlFor={id} className="text-[13px] leading-relaxed font-medium text-foreground">{label}{required && <><span aria-hidden="true" className="text-primary">*</span><span className="sr-only"> (obrigatório)</span></>}</Label>
        {children}
        {error ? <p id={descriptionId} role="alert" className="text-xs leading-relaxed text-danger">{error}</p> : hint ? <p id={descriptionId} className="text-xs leading-relaxed text-muted-foreground">{hint}</p> : null}
      </div>
    </FieldAccessibilityContext>
  )
}

export function FormGrid({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn("grid min-w-0 grid-cols-1 gap-5 sm:grid-cols-2", className)}>{children}</div>
}
