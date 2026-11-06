"use client"

import { useState } from "react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { OptionSelect } from "@/components/shared/option-select"
import { PAYMENT_METHOD_LABEL, toOptions } from "@/lib/constants"
import { useCompany, useCrm } from "@/lib/data"
import { saveRecord } from "@/lib/data/records-actions"
import { formatDate, formatMoney } from "@/lib/format"
import type { PaymentMethod, Subscription } from "@/types"

export function MonthlyBilling({ subscription, onOpenCharge }: { subscription: Subscription; onOpenCharge: (id: string) => void }) {
  const [method, setMethod] = useState<PaymentMethod>(subscription.method)
  const company = useCompany()
  const pixKey = company.pixKey || ""
  const managedByAsaas = subscription.method === "asaas" && !!subscription.asaasSubscriptionId
  const [saving, setSaving] = useState(false)
  const charges = useCrm(state => state.charges)
  const current = charges.filter(charge => !charge.deletedAt && charge.subscriptionId === subscription.id && charge.status !== "cancelado" && !charge.awaitingProjectPayment).sort((a, b) => b.dueDate.localeCompare(a.dueDate))[0]
  const save = async () => {
    if (method === "pix" && !pixKey.trim()) return void toast.error("Cadastre a chave Pix em Configurações → Empresa")
    setSaving(true)
    try {
      const patch = { method, pixKey: method === "pix" ? pixKey.trim() : "" }
      await saveRecord("subscriptions", subscription.id, patch)
      const state = useCrm.getState()
      const initialCharge = state.charges.find(charge => charge.id === `chg_first_${subscription.id}` && charge.status !== "pago" && charge.status !== "cancelado" && !charge.gatewayId)
      if (initialCharge) {
        await saveRecord("charges", initialCharge.id, patch)
        state.replace("charges", state.charges.map(charge => charge.id === initialCharge.id ? { ...charge, ...patch } : charge))
      }
      state.replace("subscriptions", state.subscriptions.map(item => item.id === subscription.id ? { ...item, ...patch } : item))
      toast.success("Forma de pagamento da mensalidade salva")
    } catch { toast.error("Não foi possível salvar") }
    finally { setSaving(false) }
  }
  return <div className="space-y-3 rounded-lg border p-3">
    <p className="font-medium">{subscription.description} · {formatMoney(subscription.amount)}/mês</p>
    <p className="text-sm text-muted-foreground">{!subscription.startDate ? "Início: 3 dias após a quitação do projeto" : <>Todo dia {subscription.billingDay} · próxima cobrança {formatDate(subscription.nextBillingDate)}{subscription.billingDay > 28 && " · em meses mais curtos, no último dia"}</>}</p>
    {managedByAsaas && <p className="text-sm text-muted-foreground">Mensalidade gerenciada pelo Asaas. Valores e vencimentos são sincronizados da plataforma.</p>}
    <div className="grid gap-2 sm:grid-cols-2">
      <label className="space-y-1 text-sm">Forma de pagamento<OptionSelect value={method} onChange={setMethod} options={toOptions(PAYMENT_METHOD_LABEL)} disabled={saving || managedByAsaas} /></label>
      {method === "pix" && <label className="space-y-1 text-sm">Chave Pix<Input value={pixKey} readOnly aria-label="Chave Pix da empresa" /></label>}
    </div>
    <div className="flex flex-wrap gap-2">
      {!managedByAsaas && <Button size="sm" variant="outline" onClick={() => void save()} disabled={saving}>Salvar forma de pagamento</Button>}
      <Button size="sm" disabled={saving || !current} onClick={() => current && onOpenCharge(current.id)}>Abrir cobrança mensal</Button>
    </div>
  </div>
}
