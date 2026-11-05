"use client"

import { useState, useTransition } from "react"
import { toast } from "sonner"
import { Textarea } from "@/components/ui/textarea"
import { FormDialog } from "@/components/forms/form-dialog"
import { FormField } from "@/components/shared/form-field"
import { OptionSelect } from "@/components/shared/option-select"
import { CANCEL_REASONS } from "@/components/invoices/fiscal-meta"
import { cancelInvoiceAction, type InvoiceView } from "@/lib/fiscal/actions"

type Reason = "1" | "2" | "3" | "9"
const MIN = 15
const MAX = 1000

interface CancelInvoiceDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  invoice: InvoiceView
  onSaved: (invoice: InvoiceView) => void
}

/** Cancelamento da NFS-e na prefeitura: motivo (1/2/3/9) e justificativa. */
export function CancelInvoiceDialog({ open, onOpenChange, invoice, onSaved }: CancelInvoiceDialogProps) {
  const [reason, setReason] = useState<Reason>("1")
  const [justification, setJustification] = useState("")
  const [error, setError] = useState<string>()
  const [pending, startTransition] = useTransition()

  const close = (o: boolean) => {
    if (pending) return
    if (!o) {
      setReason("1")
      setJustification("")
      setError(undefined)
    }
    onOpenChange(o)
  }

  return (
    <FormDialog
      open={open}
      onOpenChange={close}
      title={`Cancelar NFS-e ${invoice.number ?? ""}`.trim()}
      description="O pedido vai para a prefeitura e não pode ser desfeito."
      size="md"
      submitLabel={pending ? "Cancelando..." : "Cancelar nota"}
      submitting={pending}
      onSubmit={(e) => {
        e.preventDefault()
        const text = justification.trim()
        if (text.length < MIN) {
          setError(`Escreva pelo menos ${MIN} caracteres`)
          return
        }
        setError(undefined)
        startTransition(async () => {
          let res: { ok: boolean; error?: string; invoice?: InvoiceView }
          try {
            res = await cancelInvoiceAction(invoice.id, Number(reason) as 1 | 2 | 3 | 9, text)
          } catch {
            res = { ok: false, error: "Não foi possível falar com o servidor. Tente de novo." }
          }
          if (res.invoice) onSaved(res.invoice)
          if (!res.ok) {
            toast.error(res.error ?? "Não foi possível cancelar a nota")
            return
          }
          if (res.invoice?.status === "cancelada") toast.success("Nota cancelada")
          else toast.info("Cancelamento enviado", { description: "Aguardando a prefeitura. O status atualiza sozinho." })
          setJustification("")
          onOpenChange(false)
        })
      }}
    >
      <FormField label="Motivo" required>
        <OptionSelect value={reason} onChange={setReason} options={CANCEL_REASONS} />
      </FormField>
      <FormField label="Justificativa" required error={error} hint={`${justification.trim().length}/${MAX} · mínimo de ${MIN} caracteres`} htmlFor="cancel-just">
        <Textarea id="cancel-just" value={justification} maxLength={MAX} onChange={(e) => setJustification(e.target.value)} rows={4} aria-invalid={!!error} placeholder="Ex.: Nota emitida com valor errado, será substituída." />
      </FormField>
    </FormDialog>
  )
}
