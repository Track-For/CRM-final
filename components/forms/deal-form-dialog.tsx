"use client"

import { useBusinessServices } from "@/lib/saas/use-services"
import { useEffect } from "react"
import { useRouter } from "next/navigation"
import { Controller, useForm, useWatch } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { toast } from "@/lib/store/save-feedback"
import { Input } from "@/components/ui/input"
import { FormDialog } from "@/components/forms/form-dialog"
import { EntityCombobox } from "@/components/shared/entity-combobox"
import { FormField, FormGrid } from "@/components/shared/form-field"
import { MoneyInput } from "@/components/shared/money-input"
import { OptionSelect } from "@/components/shared/option-select"
import { PROJECT_TYPE_LABEL, toOptions } from "@/lib/constants"
import { newId, useCrm, useLeads, usePipelines } from "@/lib/data"
import { useEntityOptions } from "@/lib/data/options"
import { v } from "@/lib/validation"
import { dealValuesSchema } from "@/lib/data/deal-values"
import { dealDateSchema, dealDateToIso, todayDealDate } from "@/lib/data/deal-dates"
import type { Deal, ProjectType, StageKey } from "@/types"

const schema = z.object({
  serviceId: z.string().optional(),
  leadId: v.required("Lead"),
  title: v.required("Título"),
  pipelineId: v.required("Pipeline"),
  stage: v.required("Etapa"),
  projectType: v.select(["app", "sistema", "site", "anuncio", "outros"], "o tipo de projeto"),
  value: dealValuesSchema.shape.value,
  monthlyFee: dealValuesSchema.shape.monthlyFee,
  startDate: dealDateSchema,
  ownerId: v.required("Responsável"),
})
type Values = z.infer<typeof schema>

const pipelineFor = (t: ProjectType) => (t === "sistema" || t === "app" ? "pip_sistemas" : t === "anuncio" ? "pip_trafego" : "pip_sites")

interface DealFormDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  defaults?: { leadId?: string }
}

export function DealFormDialog({ open, onOpenChange, defaults }: DealFormDialogProps) {
  const { generic, options: serviceOptions } = useBusinessServices()
  const router = useRouter()
  const add = useCrm((s) => s.add)
  const logActivity = useCrm((s) => s.logActivity)
  const currentUserId = useCrm((s) => s.currentUserId)
  const pipelines = usePipelines()
  const leads = useLeads()
  const { leadOptions, userOptions } = useEntityOptions()

  const initial = (): Values => {
    const lead = leads.find((l) => l.id === defaults?.leadId)
    const projectType = lead?.projectType ?? (generic ? "outros" : "site")
    return {
      leadId: lead?.id ?? "",
      title: lead ? `Projeto — ${lead.company || lead.name}` : "",
      serviceId: lead?.serviceId || "",
      pipelineId: generic ? "pip_services" : pipelineFor(projectType),
      stage: "novo_lead",
      projectType,
      value: 0,
      monthlyFee: 0,
      startDate: todayDealDate(),
      ownerId: lead?.ownerId ?? currentUserId,
    }
  }
  const { register, control, handleSubmit, reset, setValue, formState } = useForm<Values>({ resolver: zodResolver(schema), defaultValues: initial() })
  const errors = formState.errors

  useEffect(() => {
    if (open) reset(initial())
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, defaults?.leadId])

  const pipelineId = useWatch({ control, name: "pipelineId" })
  const stageOptions = (pipelines.find((p) => p.id === pipelineId)?.stages ?? []).filter((s) => s.kind === "open").map((s) => ({ value: s.key, label: s.name }))

  const onSubmit = handleSubmit((values) => {
    const lead = leads.find((l) => l.id === values.leadId)
    const pipeline = pipelines.find((p) => p.id === values.pipelineId)
    const now = new Date().toISOString()
    const deal: Deal = {
      id: newId("deal"),
      title: values.title,
      leadId: values.leadId,
      clientId: lead?.clientId,
      pipelineId: values.pipelineId,
      stage: values.stage as StageKey,
      projectType: values.projectType,
      serviceId: values.serviceId || undefined,
      source: lead?.source ?? "manual",
      value: values.value,
      monthlyFee: values.monthlyFee,
      probability: pipeline?.stages.find((s) => s.key === values.stage)?.probability ?? 10,
      startDate: dealDateToIso(values.startDate),
      expectedCloseDate: "",
      ownerId: values.ownerId,
      stageChangedAt: now,
      createdAt: now,
      history: [{ id: newId("dh"), type: "created", description: "Negócio criado", authorId: currentUserId, createdAt: now, toStage: values.stage as StageKey }],
    }
    add("deals", deal)
    logActivity({ type: "negocio", title: `Negócio criado: ${deal.title}`, leadId: deal.leadId, dealId: deal.id })
    toast.success("Negócio criado", { action: { label: "Abrir", onClick: () => router.push(`/vendas/${deal.id}`) } })
    onOpenChange(false)
  })

  return (
    <FormDialog open={open} onOpenChange={onOpenChange} title="Novo negócio" onSubmit={onSubmit} submitLabel="Criar negócio">
      <FormGrid>
        <FormField label="Lead" required error={errors.leadId?.message} className="sm:col-span-2">
          <Controller
            control={control}
            name="leadId"
            render={({ field }) => (
              <EntityCombobox
                options={leadOptions}
                value={field.value}
                invalid={!!errors.leadId}
                allowClear={false}
                placeholder="Selecione o lead"
                onChange={(id) => {
                  field.onChange(id ?? "")
                  const lead = leads.find((l) => l.id === id)
                  if (lead) {
                    setValue("title", `Projeto — ${lead.company || lead.name}`)
                    setValue("projectType", lead.projectType)
                    setValue("pipelineId", generic ? "pip_services" : pipelineFor(lead.projectType))
                    setValue("serviceId", lead.serviceId || "")
                    setValue("ownerId", lead.ownerId)
                  }
                }}
              />
            )}
          />
        </FormField>
        <FormField label="Título" required error={errors.title?.message} className="sm:col-span-2">
          <Input {...register("title")} aria-invalid={!!errors.title} />
        </FormField>
        <FormField label="Pipeline" required>
          <Controller
            control={control}
            name="pipelineId"
            render={({ field }) => (
              <OptionSelect
                value={field.value}
                onChange={(val) => {
                  field.onChange(val)
                  setValue("stage", "novo_lead")
                }}
                options={pipelines.map((p) => ({ value: p.id, label: p.name }))}
              />
            )}
          />
        </FormField>
        <FormField label="Etapa" required>
          <Controller control={control} name="stage" render={({ field }) => <OptionSelect value={field.value} onChange={field.onChange} options={stageOptions} />} />
        </FormField>
        {generic ? <FormField label="Serviço de interesse"><Controller control={control} name="serviceId" render={({field})=><OptionSelect value={field.value} onChange={field.onChange} options={serviceOptions}/>} /></FormField> : <FormField label="Tipo de projeto" required>
          <Controller control={control} name="projectType" render={({ field }) => <OptionSelect value={field.value} onChange={field.onChange} options={toOptions(PROJECT_TYPE_LABEL)} />} />
        </FormField>}
        <FormField label="Responsável" required>
          <Controller control={control} name="ownerId" render={({ field }) => <OptionSelect value={field.value} onChange={field.onChange} options={userOptions} />} />
        </FormField>
        <FormField label="Valor do projeto" required error={errors.value?.message}>
          <Controller control={control} name="value" render={({ field }) => <MoneyInput value={field.value} onChange={field.onChange} aria-invalid={!!errors.value} />} />
        </FormField>
        <FormField label="Mensalidade">
          <Controller control={control} name="monthlyFee" render={({ field }) => <MoneyInput value={field.value} onChange={field.onChange} />} />
        </FormField>
        <FormField label="Data de início" required error={errors.startDate?.message}>
          <Input type="date" {...register("startDate")} aria-invalid={!!errors.startDate} />
        </FormField>
      </FormGrid>
    </FormDialog>
  )
}
