"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"
import { Controller, useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { toast } from "sonner"
import { Input } from "@/components/ui/input"
import { FormDialog } from "@/components/forms/form-dialog"
import { FormField, FormGrid } from "@/components/shared/form-field"
import { MaskedInput } from "@/components/shared/money-input"
import { OptionSelect } from "@/components/shared/option-select"
import { PROJECT_TYPE_LABEL, REVENUE_LABEL, SOURCE_LABEL, TEMPERATURE_LABEL, toOptions } from "@/lib/constants"
import { newId, useCrm } from "@/lib/data"
import { useEntityOptions } from "@/lib/data/options"
import { maskPhone } from "@/lib/format"
import { v } from "@/lib/validation"
import type { Lead } from "@/types"

const schema = z.object({
  name: v.required("Nome"),
  whatsapp: v.phone(),
  email: v.emailOptional(),
  company: v.optional(),
  projectType: v.select(["app", "sistema", "site", "anuncio", "outros"], "o tipo de projeto"),
  revenue: v.select(["abaixo_10k", "10k_50k", "acima_50k", "acima_100k", "sem_faturamento"], "o faturamento"),
  source: v.select(["meta_ads", "google_ads", "instagram", "indicacao", "site", "whatsapp", "manual"], "a origem"),
  temperature: v.select(["frio", "morno", "quente"], "a temperatura"),
  ownerId: v.required("Responsável"),
})

export type LeadFormValues = z.infer<typeof schema>

interface LeadFormDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Quando informado, o formulário edita o lead existente. */
  lead?: Lead
  onSaved?: (lead: Lead) => void
}

export function LeadFormDialog({ open, onOpenChange, lead, onSaved }: LeadFormDialogProps) {
  const router = useRouter()
  const add = useCrm((s) => s.add)
  const update = useCrm((s) => s.update)
  const logActivity = useCrm((s) => s.logActivity)
  const currentUserId = useCrm((s) => s.currentUserId)
  const { userOptions } = useEntityOptions()

  const defaults: LeadFormValues = {
    name: lead?.name ?? "",
    whatsapp: lead?.whatsapp ?? "",
    email: lead?.email ?? "",
    company: lead?.company ?? "",
    projectType: lead?.projectType ?? "site",
    revenue: lead?.revenue ?? "10k_50k",
    source: lead?.source ?? "manual",
    temperature: lead?.temperature ?? "morno",
    ownerId: lead?.ownerId ?? currentUserId,
  }
  const form = useForm<LeadFormValues>({ resolver: zodResolver(schema), defaultValues: defaults })
  const { register, control, handleSubmit, reset, formState } = form
  const errors = formState.errors

  useEffect(() => {
    if (open) reset(defaults)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, lead?.id])

  const onSubmit = handleSubmit((values) => {
    const now = new Date().toISOString()
    if (lead) {
      const patch = { ...values, email: values.email ?? "", company: values.company ?? "", updatedAt: now }
      update("leads", lead.id, patch)
      toast.success("Lead atualizado")
      onSaved?.({ ...lead, ...patch })
    } else {
      const created: Lead = {
        id: newId("lead"),
        ...values,
        email: values.email ?? "",
        company: values.company ?? "",
        status: "novo",
        utm: {},
        createdAt: now,
        updatedAt: now,
      }
      add("leads", created)
      logActivity({ type: "status", title: "Lead cadastrado manualmente", leadId: created.id })
      toast.success("Lead criado", { action: { label: "Abrir ficha", onClick: () => router.push(`/leads/${created.id}`) } })
      onSaved?.(created)
    }
    onOpenChange(false)
  })

  return (
    <FormDialog open={open} onOpenChange={onOpenChange} title={lead ? "Editar lead" : "Novo lead"} onSubmit={onSubmit} submitLabel={lead ? "Salvar alterações" : "Criar lead"}>
      <FormGrid>
        <FormField label="Nome" required error={errors.name?.message} className="sm:col-span-2">
          <Input {...register("name")} placeholder="Nome completo" aria-invalid={!!errors.name} />
        </FormField>
        <FormField label="WhatsApp" required error={errors.whatsapp?.message}>
          <Controller control={control} name="whatsapp" render={({ field }) => <MaskedInput mask={maskPhone} value={field.value} onChange={field.onChange} placeholder="(71) 99999-9999" aria-invalid={!!errors.whatsapp} />} />
        </FormField>
        <FormField label="E-mail" error={errors.email?.message}>
          <Input {...register("email")} type="email" placeholder="nome@empresa.com.br" aria-invalid={!!errors.email} />
        </FormField>
        <FormField label="Empresa" className="sm:col-span-2">
          <Input {...register("company")} placeholder="Nome da empresa" />
        </FormField>
        <FormField label="Tipo de projeto" required error={errors.projectType?.message}>
          <Controller control={control} name="projectType" render={({ field }) => <OptionSelect value={field.value} onChange={field.onChange} options={toOptions(PROJECT_TYPE_LABEL)} />} />
        </FormField>
        <FormField label="Faturamento" required error={errors.revenue?.message}>
          <Controller control={control} name="revenue" render={({ field }) => <OptionSelect value={field.value} onChange={field.onChange} options={toOptions(REVENUE_LABEL)} />} />
        </FormField>
        <FormField label="Origem" required>
          <Controller control={control} name="source" render={({ field }) => <OptionSelect value={field.value} onChange={field.onChange} options={toOptions(SOURCE_LABEL)} />} />
        </FormField>
        <FormField label="Temperatura" required>
          <Controller control={control} name="temperature" render={({ field }) => <OptionSelect value={field.value} onChange={field.onChange} options={toOptions(TEMPERATURE_LABEL)} />} />
        </FormField>
        <FormField label="Responsável" required error={errors.ownerId?.message} className="sm:col-span-2">
          <Controller control={control} name="ownerId" render={({ field }) => <OptionSelect value={field.value} onChange={field.onChange} options={userOptions} />} />
        </FormField>
      </FormGrid>
    </FormDialog>
  )
}
