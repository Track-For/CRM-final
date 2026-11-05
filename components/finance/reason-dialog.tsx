"use client"

import { useState } from "react"
import { Textarea } from "@/components/ui/textarea"
import { FormDialog } from "@/components/forms/form-dialog"
import { FormField } from "@/components/shared/form-field"

interface ReasonDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description?: string
  label?: string
  confirmLabel?: string
  requireReason?: boolean
  onConfirm: (reason: string) => void
}

/** Confirmação com motivo (cancelamentos). */
export function ReasonDialog({ open, onOpenChange, title, description, label = "Motivo", confirmLabel = "Confirmar", requireReason = true, onConfirm }: ReasonDialogProps) {
  const [reason, setReason] = useState("")
  const [error, setError] = useState<string>()
  const close = (o: boolean) => {
    if (!o) {
      setReason("")
      setError(undefined)
    }
    onOpenChange(o)
  }
  return (
    <FormDialog
      open={open}
      onOpenChange={close}
      title={title}
      description={description}
      size="md"
      submitLabel={confirmLabel}
      onSubmit={(e) => {
        e.preventDefault()
        if (requireReason && reason.trim().length < 3) {
          setError(`${label} é obrigatório`)
          return
        }
        onConfirm(reason.trim())
        close(false)
      }}
    >
      <FormField label={label} required={requireReason} error={error}>
        <Textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3} aria-invalid={!!error} />
      </FormField>
    </FormDialog>
  )
}
