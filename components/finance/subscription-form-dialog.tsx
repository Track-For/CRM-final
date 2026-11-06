"use client"

import { useEffect } from "react"
import { Controller, useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { addMonths, format, setDate } from "date-fns"
import { toast } from "sonner"
import { Input } from "@/components/ui/input"
import { FormDialog } from "@/components/forms/form-dialog"
import { EntityCombobox } from "@/components/shared/entity-combobox"
import { FormField, FormGrid } from "@/components/shared/form-field"
import { MoneyInput } from "@/components/shared/money-input"
import { OptionSelect } from "@/components/shared/option-select"
import { PAYMENT_METHOD_LABEL, toOptions } from "@/lib/constants"
import { newId, useCrm, useHostingPlans } from "@/lib/data"
import { useEntityOptions } from "@/lib/data/options"
import { v } from "@/lib/validation"
import type { Subscription } from "@/types"

const schema = z.object({
  clientId: v.required("Cliente"),
  description: v.required("Descrição"),
  amount: v.money("Valor mensal"),
  method: v.select(["boleto", "pix", "cartao", "asaas"], "a forma de pagamento"),
  billingDay: z.string(),
  startDate: v.date("Início"),
})
type Values = z.infer<typeof schema>

export function SubscriptionFormDialog({ open, onOpenChange, clientId }: { open: boolean; onOpenChange: (o: boolean) => void; clientId?: string }) {
  const add = useCrm((s) => s.add)
  const plans = useHostingPlans()
  const { clientOptions } = useEntityOptions()
  const initial = (): Values => ({ clientId: clientId ?? "", description: "", amount: 0, method: "pix", billingDay: "10", startDate: format(new Date(), "yyyy-MM-dd") })
  const { register, control, handleSubmit, reset, setValue, formState } = useForm<Values>({ resolver: zodResolver(schema), defaultValues: initial() })
  const errors = formState.errors

  useEffect(() => {
    if (open) reset(initial())
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, clientId])

  const onSubmit = handleSubmit((val) => {
    const start = new Date(`${val.startDate}T12:00:00`)
    const day = Number(val.billingDay)
    const firstDue = setDate(start, day) >= start ? setDate(start, day) : setDate(addMonths(start, 1), day)
    const sub: Subscription = {
      id: newId("sub"),
      clientId: val.clientId,
      description: val.description,
      amount: val.amount,
      method: val.method,
      billingDay: day,
      status: "ativa",
      startDate: start.toISOString(),
      nextBillingDate: firstDue.toISOString(),
    }
    add("subscriptions", sub)
    toast.success("Mensalidade criada", { description: `Primeira cobrança em ${format(firstDue, "dd/MM/yyyy")}` })
    onOpenChange(false)
  })

  return (
    <FormDialog open={open} onOpenChange={onOpenChange} title="Nova mensalidade" description="Recorrência de hospedagem, manutenção ou tráfego." onSubmit={onSubmit} submitLabel="Criar mensalidade">
      <FormGrid>
        <FormField label="Cliente" required error={errors.clientId?.message} className="sm:col-span-2">
          <Controller control={control} name="clientId" render={({ field }) => <EntityCombobox options={clientOptions} value={field.value} onChange={(id) => field.onChange(id ?? "")} allowClear={false} invalid={!!errors.clientId} placeholder="Selecione o cliente" />} />
        </FormField>
        <FormField label="Plano (atalho)" className="sm:col-span-2">
          <OptionSelect
            value=""
            placeholder="Preencher a partir de um plano"
            options={plans.filter((p) => p.monthly > 0).map((p) => ({ value: p.id, label: `${p.name} — R$ ${p.monthly}/mês` }))}
            onChange={(id) => {
              const plan = plans.find((p) => p.id === id)
              if (!plan) return
              setValue("description", `Hospedagem ${plan.name}`, { shouldValidate: true })
              setValue("amount", plan.monthly, { shouldValidate: true })
            }}
          />
        </FormField>
        <FormField label="Descrição" required error={errors.description?.message} className="sm:col-span-2">
          <Input {...register("description")} placeholder="Ex.: Hospedagem Profissional" aria-invalid={!!errors.description} />
        </FormField>
        <FormField label="Valor mensal" required error={errors.amount?.message}>
          <Controller control={control} name="amount" render={({ field }) => <MoneyInput value={field.value} onChange={field.onChange} aria-invalid={!!errors.amount} />} />
        </FormField>
        <FormField label="Forma de pagamento" required>
          <Controller control={control} name="method" render={({ field }) => <OptionSelect value={field.value} onChange={field.onChange} options={toOptions(PAYMENT_METHOD_LABEL)} />} />
        </FormField>
        <FormField label="Dia de cobrança">
          <Controller control={control} name="billingDay" render={({ field }) => <OptionSelect value={field.value} onChange={field.onChange} options={Array.from({ length: 28 }, (_, i) => ({ value: String(i + 1), label: `Dia ${i + 1}` }))} />} />
        </FormField>
        <FormField label="Início" required error={errors.startDate?.message}>
          <Input type="date" {...register("startDate")} />
        </FormField>
      </FormGrid>
    </FormDialog>
  )
}
