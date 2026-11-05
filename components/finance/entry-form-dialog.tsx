"use client"

import { useEffect } from "react"
import { Controller, useForm, useWatch } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { format, parseISO } from "date-fns"
import { toast } from "sonner"
import { Input } from "@/components/ui/input"
import { FormDialog } from "@/components/forms/form-dialog"
import { EntityCombobox } from "@/components/shared/entity-combobox"
import { FormField, FormGrid } from "@/components/shared/form-field"
import { MoneyInput } from "@/components/shared/money-input"
import { OptionSelect } from "@/components/shared/option-select"
import { newId, useCrm, useFinancialCategories } from "@/lib/data"
import { useEntityOptions } from "@/lib/data/options"
import { v } from "@/lib/validation"
import type { EntryType, FinancialEntry } from "@/types"

const schema = z
  .object({
    type: v.select(["receita", "despesa"], "o tipo"),
    description: v.required("Descrição"),
    categoryId: v.required("Categoria"),
    amount: v.money("Valor"),
    competenceDate: v.date("Competência"),
    dueDate: v.date("Vencimento"),
    status: v.select(["pendente", "pago"], "o status"),
    paidAt: z.string().optional(),
    supplier: z.string().optional(),
    clientId: z.string().optional(),
  })
  .refine((val) => val.status !== "pago" || Boolean(val.paidAt), { path: ["paidAt"], message: "Data de pagamento é obrigatória" })
type Values = z.infer<typeof schema>

const toDateInput = (iso: string) => format(parseISO(iso), "yyyy-MM-dd")
const toIso = (date: string) => new Date(`${date}T12:00:00`).toISOString()

interface EntryFormDialogProps {
  open: boolean
  onOpenChange: (o: boolean) => void
  defaultType?: EntryType
  /** Com lançamento, o formulário edita em vez de criar. */
  entry?: FinancialEntry | null
}

export function EntryFormDialog({ open, onOpenChange, defaultType = "despesa", entry }: EntryFormDialogProps) {
  const add = useCrm((s) => s.add)
  const update = useCrm((s) => s.update)
  const categories = useFinancialCategories()
  const { clientOptions } = useEntityOptions()
  // Valor, vencimento e baixa de lançamento vinculado vêm da cobrança.
  const linked = Boolean(entry?.chargeId)

  const initial = (): Values => {
    const today = format(new Date(), "yyyy-MM-dd")
    if (entry) {
      return {
        type: entry.type,
        description: entry.description,
        categoryId: entry.categoryId,
        amount: entry.amount,
        competenceDate: toDateInput(entry.competenceDate),
        dueDate: toDateInput(entry.dueDate),
        status: entry.status === "pago" ? "pago" : "pendente",
        paidAt: entry.paidAt ? toDateInput(entry.paidAt) : today,
        supplier: entry.supplier ?? "",
        clientId: entry.clientId ?? undefined,
      }
    }
    return { type: defaultType, description: "", categoryId: "", amount: 0, competenceDate: today, dueDate: today, status: "pendente", paidAt: today, supplier: "", clientId: undefined }
  }
  const { register, control, handleSubmit, reset, setValue, formState } = useForm<Values>({ resolver: zodResolver(schema), defaultValues: initial() })
  const errors = formState.errors
  const type = useWatch({ control, name: "type" })
  const status = useWatch({ control, name: "status" })
  const label = type === "receita" ? "entrada" : "saída"

  useEffect(() => {
    if (open) reset(initial())
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, defaultType, entry])

  const onSubmit = handleSubmit((val) => {
    const party = { supplier: val.type === "despesa" ? val.supplier : undefined, clientId: val.type === "receita" ? val.clientId : undefined }
    const editable = { description: val.description, categoryId: val.categoryId, competenceDate: toIso(val.competenceDate), ...party }
    const today = format(new Date(), "yyyy-MM-dd")
    const financial = {
      type: val.type,
      amount: val.amount,
      dueDate: toIso(val.dueDate),
      paidAt: val.status === "pago" && val.paidAt ? toIso(val.paidAt) : undefined,
      status: val.status === "pendente" && val.dueDate < today ? ("vencido" as const) : val.status,
    }
    if (entry) {
      update("entries", entry.id, linked ? editable : { ...editable, ...financial })
      toast.success(val.type === "receita" ? "Entrada atualizada" : "Saída atualizada")
    } else {
      add("entries", { id: newId("ent"), ...editable, ...financial })
      toast.success(val.type === "receita" ? "Entrada lançada" : "Saída lançada")
    }
    onOpenChange(false)
  })

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={entry ? `Editar ${label}` : `Nova ${label}`}
      description={linked ? "Vinculada a uma cobrança: tipo, valor, vencimento, status e pagamento são alterados pela cobrança." : undefined}
      onSubmit={onSubmit}
      submitLabel={entry ? "Salvar" : "Lançar"}
    >
      <FormGrid>
        <FormField label="Tipo" required>
          <Controller
            control={control}
            name="type"
            render={({ field }) => (
              <OptionSelect
                value={field.value}
                disabled={linked}
                onChange={(t) => {
                  field.onChange(t)
                  setValue("categoryId", "")
                }}
                options={[
                  { value: "receita", label: "Entrada" },
                  { value: "despesa", label: "Saída" },
                ]}
              />
            )}
          />
        </FormField>
        <FormField label="Categoria" required error={errors.categoryId?.message}>
          <Controller
            control={control}
            name="categoryId"
            render={({ field }) => <OptionSelect value={field.value} onChange={field.onChange} invalid={!!errors.categoryId} options={categories.filter((c) => c.type === type).map((c) => ({ value: c.id, label: c.name }))} />}
          />
        </FormField>
        <FormField label="Descrição" required error={errors.description?.message} className="sm:col-span-2">
          <Input {...register("description")} aria-invalid={!!errors.description} />
        </FormField>
        {type === "despesa" ? (
          <FormField label="Fornecedor">
            <Input {...register("supplier")} placeholder="Opcional" />
          </FormField>
        ) : (
          <FormField label="Cliente">
            <Controller control={control} name="clientId" render={({ field }) => <EntityCombobox options={clientOptions} value={field.value} onChange={field.onChange} placeholder="Opcional" />} />
          </FormField>
        )}
        <FormField label="Valor" required error={errors.amount?.message}>
          <Controller control={control} name="amount" render={({ field }) => <MoneyInput value={field.value} onChange={field.onChange} disabled={linked} aria-invalid={!!errors.amount} />} />
        </FormField>
        <FormField label="Competência" required error={errors.competenceDate?.message}>
          <Input type="date" {...register("competenceDate")} />
        </FormField>
        <FormField label="Vencimento" required error={errors.dueDate?.message}>
          <Input type="date" readOnly={linked} {...register("dueDate")} />
        </FormField>
        <FormField label="Status" required>
          <Controller
            control={control}
            name="status"
            render={({ field }) => (
              <OptionSelect
                value={field.value}
                onChange={field.onChange}
                disabled={linked}
                options={[
                  { value: "pendente", label: "Pendente" },
                  { value: "pago", label: "Pago" },
                ]}
              />
            )}
          />
        </FormField>
        {status === "pago" && (
          <FormField label="Data de pagamento" required error={errors.paidAt?.message}>
            <Input type="date" readOnly={linked} {...register("paidAt")} aria-invalid={!!errors.paidAt} />
          </FormField>
        )}
      </FormGrid>
    </FormDialog>
  )
}
