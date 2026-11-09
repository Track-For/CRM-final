"use client"
import { useState } from "react"
import { CalendarDays, CheckCircle2 } from "lucide-react"
import { toast } from "@/lib/store/save-feedback"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { FormDialog } from "@/components/forms/form-dialog"
import { FormField } from "@/components/shared/form-field"
import { saveChargePaymentDate } from "@/lib/finance/payment-actions"
import { localDay } from "@/lib/commercial/metrics"
import { useCrm } from "@/lib/data"
import { getDatabase } from "@/lib/data/api"
import { useUiStore } from "@/lib/store/ui-store"
import type { Charge } from "@/types"

export function PaymentDateButton({ charge }: { charge: Charge }) {
  const role = useUiStore(s => s.role)
  const [open, setOpen] = useState(false), [date, setDate] = useState("")
  const [busy, setBusy] = useState(false), [error, setError] = useState("")
  if (!["admin", "financeiro"].includes(role) || charge.status === "cancelado" || charge.gatewayId || charge.importedFromAsaas) return null
  const paid = charge.status === "pago"
  const today = localDay(new Date().toISOString())
  async function save() {
    setBusy(true); setError("")
    try {
      const result = await saveChargePaymentDate(charge.id, date, charge.paidAt || null)
      const state = useCrm.getState()
      state.replace("charges", state.charges.map(c => c.id === charge.id ? result.charge : c))
      state.replace("entries", state.entries.map(e => result.entries.find(r => r.id === e.id) || e))
      const fresh = await getDatabase().catch(() => null)
      if (fresh) useCrm.setState(fresh)
      setOpen(false); toast.success(paid ? "Data do pagamento corrigida" : "Pagamento registrado")
    } catch (e) { setError(e instanceof Error ? e.message : "Não foi possível registrar o pagamento.") }
    finally { setBusy(false) }
  }
  return <>
    <Button variant="outline" size="sm" onClick={() => { setDate(localDay(charge.paidAt) || ""); setError(""); setOpen(true) }}>{paid ? <CalendarDays /> : <CheckCircle2 />}{paid ? "Corrigir data do pagamento" : "Marcar como pago"}</Button>
    <FormDialog open={open} onOpenChange={value => !busy && setOpen(value)} title={paid ? "Corrigir data do pagamento" : "Registrar pagamento"} description="Informe quando o dinheiro foi realmente recebido. Essa data define o mês da receita e inclui mensalidades. O vencimento será mantido." size="md" submitting={busy} submitLabel="Salvar pagamento" onSubmit={e => { e.preventDefault(); if (!busy) void save() }}>
      <p className="text-sm">{charge.description}</p>
      <FormField label="Data em que o pagamento foi recebido" required error={error}><Input type="date" min="1900-01-01" max={today} value={date} onChange={e => setDate(e.target.value)} disabled={busy} aria-invalid={!!error} /></FormField>
    </FormDialog>
  </>
}
