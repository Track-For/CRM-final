"use client"

import { useMemo, useState } from "react"
import { Controller, useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { buildFormSchema } from "@/lib/forms/validation"
import { CheckCircle2, MessageCircle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Logo } from "@/components/layout/logo"
import { FormField } from "@/components/shared/form-field"
import { MaskedInput } from "@/components/shared/money-input"
import { OptionSelect } from "@/components/shared/option-select"
import { maskPhone, whatsappLink } from "@/lib/format"
import { cn } from "@/lib/utils"
import type { PublicForm } from "@/types"

export type FormValues = Record<string, string>

export { buildFormSchema } from "@/lib/forms/validation"

export function callMessage(form: PublicForm, name?: string) {
  const first = name?.trim().split(" ")[0]
  return `Olá! ${first ? `Sou ${first}, ` : ""}acabei de preencher o formulário "${form.title}" e gostaria de marcar uma call.`
}

interface FormRendererProps {
  form: PublicForm
  /** Em preview, envio não cria lead. */
  onSubmit?: (values: FormValues) => Promise<void> | void
  /** Força a tela final (usado no preview do editor). */
  showSuccess?: boolean
  compact?: boolean
  className?: string
}

/** Visual único do formulário público (página /f/[slug] e preview do editor). */
export function FormRenderer({ form, onSubmit, showSuccess, compact, className }: FormRendererProps) {
  const [submitError, setSubmitError] = useState("")
  const [submittedName, setSubmittedName] = useState<string | null>(null)
  const schema = useMemo(() => buildFormSchema(form.fields), [form.fields])
  const defaults = useMemo(() => Object.fromEntries(form.fields.map((f) => [f.key, ""])), [form.fields])
  const { register, control, handleSubmit, formState } = useForm<FormValues>({ resolver: zodResolver(schema), defaultValues: defaults })
  const errors = formState.errors

  const done = showSuccess || submittedName !== null

  const submit = handleSubmit(async (values) => {
    setSubmitError("")
    try { await onSubmit?.(values); setSubmittedName(values.name ?? "") }
    catch (error) { setSubmitError(error instanceof Error ? error.message : "Não foi possível enviar. Tente novamente.") }
  })

  return (
    <div className={cn("w-full rounded-2xl border bg-card", compact ? "p-5" : "p-6 sm:p-8", className)}>
      <Logo className="mb-6" />
      {done ? (
        <div className="space-y-5 py-4 text-center">
          <div className="mx-auto flex size-12 items-center justify-center rounded-full border border-[#16391f] bg-success-soft">
            <CheckCircle2 className="size-6 text-success" />
          </div>
          <div className="space-y-2">
            <h1 className="text-xl font-semibold tracking-tight">{form.successTitle || "Recebemos seus dados"}</h1>
            <p className="text-sm text-muted-foreground">{form.successMessage}</p>
          </div>
          <Button asChild size="lg" className="w-full font-semibold">
            <a href={whatsappLink(form.whatsappNumber, callMessage(form, submittedName ?? undefined))} target="_blank" rel="noopener noreferrer">
              <MessageCircle />
              {form.ctaLabel || "Gostaria de marcar uma call"}
            </a>
          </Button>
        </div>
      ) : (
        <form onSubmit={submit} noValidate className="space-y-5">
          <div className="space-y-2">
            <h1 className={cn("font-semibold tracking-tight", compact ? "text-lg" : "text-2xl")}>{form.title || "Título do formulário"}</h1>
            {form.description && <p className="text-sm text-muted-foreground">{form.description}</p>}
          </div>
          <div className="space-y-4">
            {form.fields.map((f) => {
              const error = errors[f.key]?.message
              return (
                <FormField key={f.id} label={f.label || "Campo sem rótulo"} required={f.required} error={error} htmlFor={`f-${f.id}`}>
                  {f.type === "select" ? (
                    <Controller
                      control={control}
                      name={f.key}
                      render={({ field }) => (
                        <OptionSelect
                          id={`f-${f.id}`}
                          value={field.value}
                          onChange={field.onChange}
                          invalid={!!error}
                          placeholder={f.placeholder || "Selecione"}
                          options={(f.options ?? []).filter(Boolean).map((o) => ({ value: o, label: o }))}
                        />
                      )}
                    />
                  ) : f.type === "tel" ? (
                    <Controller
                      control={control}
                      name={f.key}
                      render={({ field }) => <MaskedInput id={`f-${f.id}`} mask={maskPhone} value={field.value} onChange={field.onChange} placeholder={f.placeholder} aria-invalid={!!error} />}
                    />
                  ) : f.type === "textarea" ? (
                    <Textarea id={`f-${f.id}`} rows={3} placeholder={f.placeholder} aria-invalid={!!error} {...register(f.key)} />
                  ) : (
                    <Input id={`f-${f.id}`} type={f.type === "email" ? "email" : "text"} placeholder={f.placeholder} aria-invalid={!!error} {...register(f.key)} />
                  )}
                </FormField>
              )
            })}
          </div>
          {submitError && <p role="alert" className="text-sm text-destructive">{submitError}</p>}
          <Button type="submit" size="lg" className="w-full font-semibold" disabled={formState.isSubmitting}>
            {formState.isSubmitting ? "Enviando..." : form.submitLabel || "Enviar"}
          </Button>
          <p className="text-center text-[11px] text-muted-foreground">Seus dados são usados apenas para retornarmos o contato pelo WhatsApp.</p>
        </form>
      )}
    </div>
  )
}
