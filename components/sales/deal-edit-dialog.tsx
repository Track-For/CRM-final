"use client"

import { useEffect } from "react"
import Link from "next/link"
import { Controller, useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { ExternalLink } from "lucide-react"
import { toast } from "@/lib/store/save-feedback"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { FormDialog } from "@/components/forms/form-dialog"
import { EntityCombobox } from "@/components/shared/entity-combobox"
import { FormField, FormGrid } from "@/components/shared/form-field"
import { MoneyInput } from "@/components/shared/money-input"
import { OptionSelect } from "@/components/shared/option-select"
import { orderedStages } from "@/components/sales/utils"
import { PROJECT_TYPE_LABEL, toOptions } from "@/lib/constants"
import { newId, useCrm, useLeads, usePipelines } from "@/lib/data"
import { useEntityOptions } from "@/lib/data/options"
import { v } from "@/lib/validation"
import { dealValuesSchema } from "@/lib/data/deal-values"
import { dealDateInput, dealDateSchema, dealDateToIso } from "@/lib/data/deal-dates"
import type { Deal, DealHistoryEntry, StageKey } from "@/types"

const schema = z.object({
  title: v.required("Título"),
  clientId: z.string(),
  stage: v.required("Etapa"),
  projectType: v.select(["app", "sistema", "site", "anuncio", "outros"], "o tipo de projeto"),
  value: dealValuesSchema.shape.value,
  monthlyFee: dealValuesSchema.shape.monthlyFee,
  startDate: dealDateSchema.or(z.literal("")),
  expectedCloseDate: dealDateSchema.or(z.literal("")),
  ownerId: v.required("Responsável"),
})
type Values = z.infer<typeof schema>

interface DealEditDialogProps {
  deal: Deal | null
  onOpenChange: (open: boolean) => void
  /** Troca de etapa passa pelo mesmo fluxo do arraste (motivo de perda, cobrança de entrada). */
  onStageChange: (deal: Deal, stage: StageKey) => void
}

const toValues = (deal: Deal): Values => ({
  title: deal.title,
  clientId: deal.clientId ?? "",
  stage: deal.stage,
  projectType: deal.projectType,
  value: deal.value,
  monthlyFee: deal.monthlyFee,
  startDate: dealDateInput(deal.startDate),
  expectedCloseDate: dealDateInput(deal.expectedCloseDate),
  ownerId: deal.ownerId,
})

export function DealEditDialog({ deal, onOpenChange, onStageChange }: DealEditDialogProps) {
  const update = useCrm((s) => s.update)
  const currentUserId = useCrm((s) => s.currentUserId)
  const pipelines = usePipelines()
  const leads = useLeads()
  const { clientOptions, userOptions } = useEntityOptions()

  const { register, control, handleSubmit, reset, formState } = useForm<Values>({ resolver: zodResolver(schema), defaultValues: deal ? toValues(deal) : undefined })
  const errors = formState.errors

  useEffect(() => {
    if (deal) reset(toValues(deal))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deal?.id])

  if (!deal) return null
  const lead = leads.find((l) => l.id === deal.leadId)
  const stageOptions = orderedStages(pipelines.find((p) => p.id === deal.pipelineId)).map((s) => ({ value: s.key, label: s.name }))

  const onSubmit = handleSubmit((values) => {
    const changed: string[] = []
    if (values.clientId !== (deal.clientId ?? "")) changed.push("cliente")
    if (values.value !== deal.value || values.monthlyFee !== deal.monthlyFee) changed.push("valores")
    if (values.ownerId !== deal.ownerId) changed.push("responsável")
    const history: DealHistoryEntry[] = changed.length
      ? [...deal.history, { id: newId("dh"), type: changed.includes("valores") ? "value" : changed.includes("responsável") ? "owner" : "note", description: `Editado: ${changed.join(", ")}`, authorId: currentUserId, createdAt: new Date().toISOString() }]
      : deal.history
    update("deals", deal.id, {
      title: values.title,
      clientId: values.clientId || undefined,
      projectType: values.projectType,
      value: values.value,
      monthlyFee: values.monthlyFee,
      startDate: values.startDate ? dealDateToIso(values.startDate) : "",
      expectedCloseDate: values.expectedCloseDate ? dealDateToIso(values.expectedCloseDate) : "",
      ownerId: values.ownerId,
      history,
    })
    const stageChanged = values.stage !== deal.stage
    onOpenChange(false)
    if (stageChanged) onStageChange({ ...deal, ...values, clientId: values.clientId || undefined } as Deal, values.stage as StageKey)
    else toast.success("Negócio atualizado")
  })

  return (
    <FormDialog
      open
      onOpenChange={onOpenChange}
      title="Editar negócio"
      description={lead ? `Lead: ${lead.name}${lead.company ? ` · ${lead.company}` : ""}` : undefined}
      onSubmit={onSubmit}
      submitLabel="Salvar alterações"
      extraFooter={
        <Button variant="ghost" asChild className="sm:mr-auto">
          <Link href={`/vendas/${deal.id}`}>
            <ExternalLink />
            Abrir ficha completa
          </Link>
        </Button>
      }
    >
      <FormGrid>
        <FormField label="Título" required error={errors.title?.message} className="sm:col-span-2">
          <Input {...register("title")} aria-invalid={!!errors.title} />
        </FormField>
        <FormField label="Cliente" hint="Vincula o negócio a um cliente cadastrado" className="sm:col-span-2">
          <Controller
            control={control}
            name="clientId"
            render={({ field }) => <EntityCombobox options={clientOptions} value={field.value || undefined} onChange={(id) => field.onChange(id ?? "")} placeholder="Sem cliente" />}
          />
        </FormField>
        <FormField label="Etapa" required>
          <Controller control={control} name="stage" render={({ field }) => <OptionSelect value={field.value} onChange={field.onChange} options={stageOptions} />} />
        </FormField>
        <FormField label="Tipo de projeto" required>
          <Controller control={control} name="projectType" render={({ field }) => <OptionSelect value={field.value} onChange={field.onChange} options={toOptions(PROJECT_TYPE_LABEL)} />} />
        </FormField>
        <FormField label="Valor do projeto" required error={errors.value?.message}>
          <Controller control={control} name="value" render={({ field }) => <MoneyInput value={field.value} onChange={field.onChange} aria-invalid={!!errors.value} />} />
        </FormField>
        <FormField label="Mensalidade">
          <Controller control={control} name="monthlyFee" render={({ field }) => <MoneyInput value={field.value} onChange={field.onChange} />} />
        </FormField>
        <FormField label="Responsável" required>
          <Controller control={control} name="ownerId" render={({ field }) => <OptionSelect value={field.value} onChange={field.onChange} options={userOptions} />} />
        </FormField>
        <FormField label="Data de início" error={errors.startDate?.message}>
          <Input type="date" {...register("startDate")} />
        </FormField>
        <FormField label="Previsão de fechamento (opcional)" error={errors.expectedCloseDate?.message} hint="Usada na previsão comercial dos negócios em aberto.">
          <Input type="date" {...register("expectedCloseDate")} />
        </FormField>
      </FormGrid>
    </FormDialog>
  )
}
