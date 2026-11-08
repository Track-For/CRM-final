"use client"

import { useState } from "react"
import { CalendarDays } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { FormDialog } from "@/components/forms/form-dialog"
import { FormField } from "@/components/shared/form-field"
import { useCrm } from "@/lib/data"
import { changeChargeDueDateAction } from "@/lib/data/records-actions"
import type { Charge } from "@/types"

export function ChangeChargeDateButton({ charge }: { charge: Charge }) {
  const [open, setOpen] = useState(false)
  const [date, setDate] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string>()
  const save = async () => {
    setBusy(true)
    setError(undefined)
    try {
      const result = await changeChargeDueDateAction(charge.id, date)
      if (!result.ok) { setError(result.error); return }
      const state = useCrm.getState()
      state.replace("charges", state.charges.map(item => item.id === charge.id ? result.charge : item))
      state.replace("entries", state.entries.map(item => result.entries.find(entry => entry.id === item.id) || item))
      setOpen(false)
      toast.success("Data da cobrança atualizada")
    } catch { setError("Não foi possível salvar a data. Tente novamente.") }
    finally { setBusy(false) }
  }
  if (charge.status === "cancelado") return null
  if (charge.gatewayId || charge.importedFromAsaas) return <p className="text-xs text-muted-foreground">Para mudar o vencimento, altere a cobrança no Asaas e clique em Atualizar status.</p>
  return <>
    <Button variant="outline" size="sm" onClick={() => { setDate(charge.dueDate?.slice(0, 10) || ""); setError(undefined); setOpen(true) }}><CalendarDays />Alterar data</Button>
    <FormDialog open={open} onOpenChange={value => !busy && setOpen(value)} title="Alterar data da cobrança" description="Atualiza o vencimento e a competência financeira desta cobrança. O registro de pagamento será mantido." size="md" submitting={busy} submitLabel={busy ? "Salvando…" : "Salvar data"} onSubmit={event => { event.preventDefault(); if (!busy) void save() }}>
      <p className="text-sm">{charge.description}</p>
      <FormField label="Vencimento" required error={error}><Input type="date" value={date} disabled={busy} onChange={event => setDate(event.target.value)} aria-invalid={!!error} /></FormField>
    </FormDialog>
  </>
}
