"use client"

import { useEffect } from "react"
import { Controller, useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { Textarea } from "@/components/ui/textarea"
import { FormDialog } from "@/components/forms/form-dialog"
import { FormField } from "@/components/shared/form-field"
import { OptionSelect } from "@/components/shared/option-select"
import { useLostReasons } from "@/lib/data"
import { v } from "@/lib/validation"

const schema = z.object({
  lostReasonId: v.required("Motivo da perda"),
  lostNote: z.string().trim().max(500, "Máximo de 500 caracteres").optional(),
})
type Values = z.infer<typeof schema>

interface LostReasonDialogProps {
  open: boolean
  dealTitle?: string
  onCancel: () => void
  onConfirm: (values: { lostReasonId: string; lostNote?: string }) => void
}

/** Modal obrigatório ao mover um negócio para "Perdido". */
export function LostReasonDialog({ open, dealTitle, onCancel, onConfirm }: LostReasonDialogProps) {
  const reasons = useLostReasons()
  const { control, register, handleSubmit, reset, formState } = useForm<Values>({ resolver: zodResolver(schema), defaultValues: { lostReasonId: "", lostNote: "" } })

  useEffect(() => {
    if (open) reset({ lostReasonId: "", lostNote: "" })
  }, [open, reset])

  const onSubmit = handleSubmit((values) => onConfirm({ lostReasonId: values.lostReasonId, lostNote: values.lostNote || undefined }))

  return (
    <FormDialog
      open={open}
      onOpenChange={(o) => {
        if (!o) onCancel()
      }}
      title="Marcar como perdido"
      description={dealTitle ? `Informe por que "${dealTitle}" foi perdido.` : "Informe o motivo da perda."}
      onSubmit={onSubmit}
      submitLabel="Confirmar perda"
      size="md"
    >
      <FormField label="Motivo da perda" required error={formState.errors.lostReasonId?.message}>
        <Controller
          control={control}
          name="lostReasonId"
          render={({ field }) => (
            <OptionSelect value={field.value} onChange={field.onChange} options={reasons.map((r) => ({ value: r.id, label: r.label }))} placeholder="Selecione o motivo" invalid={!!formState.errors.lostReasonId} />
          )}
        />
      </FormField>
      <FormField label="Observação" error={formState.errors.lostNote?.message}>
        <Textarea {...register("lostNote")} rows={3} placeholder="Detalhes que ajudam a entender a perda" />
      </FormField>
    </FormDialog>
  )
}
