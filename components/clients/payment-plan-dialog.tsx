"use client"

import { useState } from "react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { FormDialog } from "@/components/forms/form-dialog"
import { FormField } from "@/components/shared/form-field"
import { MoneyInput } from "@/components/shared/money-input"
import { OptionSelect } from "@/components/shared/option-select"
import { PAYMENT_METHOD_LABEL, toOptions } from "@/lib/constants"
import { newId, useCompany, useCrm } from "@/lib/data"
import { editableForecast } from "@/lib/data/project-receivables"
import { getDatabase } from "@/lib/data/api"
import { saveRecord } from "@/lib/data/records-actions"
import { formatMoney } from "@/lib/format"
import type { Deal, PaymentMethod } from "@/types"

type Stage = NonNullable<Deal["paymentPlan"]>["milestones"][number]

export function PaymentPlanDialog({ deal, onClose, onSaved, confirmingWin = false }: { deal: Deal; onClose: () => void; onSaved?: () => void | Promise<void>; confirmingWin?: boolean }) {
  const charges = useCrm(state => state.charges)
  const [method, setMethod] = useState<PaymentMethod>(deal.paymentPlan?.method || "pix")
  const company = useCompany()
  const pixKey = company.pixKey || ""
  const [mode, setMode] = useState<"percent" | "amount">("percent")
  const [stages, setStages] = useState<Stage[]>(deal.paymentPlan?.milestones || [{ id: newId("etapa"), label: "", percent: 0, amount: 0 }])
  const [saving, setSaving] = useState(false)
  const locked = (id: string) => charges.some(charge => charge.dealId === deal.id && charge.milestoneId === id && charge.status !== "cancelado" && !editableForecast(charge))
  const hasCharges = stages.some(stage => locked(stage.id))
  const change = (id: string, patch: Partial<Stage>) => setStages(rows => rows.map(row => row.id === id ? { ...row, ...patch } : row))
  const total = Math.round(stages.reduce((sum, stage) => sum + stage.amount, 0) * 100)
  const save = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!stages.length || stages.some(stage => !stage.label.trim() || !Number.isFinite(stage.amount) || stage.amount <= 0 || !Number.isFinite(stage.percent) || stage.percent <= 0)) return void toast.error("Preencha o nome e um valor positivo para cada etapa")
    if (total !== Math.round(deal.value * 100)) return void toast.error("A soma das etapas deve ser igual ao valor do projeto")
    if (method === "pix" && !pixKey.trim()) return void toast.error("Cadastre a chave Pix em Configurações → Empresa")
    const paymentPlan = { method, pixKey: method === "pix" ? pixKey.trim() : "", milestones: stages.map(stage => ({ ...stage, label: stage.label.trim() })) }
    setSaving(true)
    try {
      await saveRecord("deals", deal.id, { paymentPlan })
      const data = await getDatabase()
      const state = useCrm.getState()
      state.replace("deals", data.deals)
      state.replace("charges", data.charges)
      state.replace("entries", data.entries)
      if (onSaved) await onSaved()
      else { toast.success("Plano de cobrança salvo"); onClose() }
    } catch { toast.error("Não foi possível salvar o plano. Tente novamente.") }
    finally { setSaving(false) }
  }
  return <FormDialog open onOpenChange={open => !open && !saving && onClose()} title={confirmingWin ? "2 de 2 · Pagamento do projeto" : "Personalizar cobrança"} submitLabel={confirmingWin ? "Confirmar ganho e cobranças" : "Salvar"} description={`${deal.title} · Total ${formatMoney(deal.value)}`} onSubmit={save} submitting={saving} size="xl">
    <FormField label="Forma de pagamento"><OptionSelect value={method} onChange={setMethod} options={toOptions(PAYMENT_METHOD_LABEL)} disabled={hasCharges} /></FormField>
    {method === "pix" && <FormField label="Chave Pix"><Input value={pixKey} readOnly aria-label="Chave Pix da empresa" /></FormField>}
    {!hasCharges && <div className="flex flex-wrap gap-2">
      <Button type="button" variant="outline" onClick={() => setStages([{ id: newId("etapa"), label: "À vista", percent: 100, amount: deal.value }])}>À vista</Button>
      <Button type="button" variant="outline" onClick={() => { const first = Math.round(deal.value * 50) / 100; setStages([{ id: newId("etapa"), label: "Início do projeto", percent: 50, amount: first }, { id: newId("etapa"), label: "Entrega do projeto", percent: 50, amount: Math.round((deal.value - first) * 100) / 100 }]) }}>50% / 50%</Button>
      <Button type="button" variant="outline" onClick={() => { const first = Math.round(deal.value * 20) / 100; const second = Math.round(deal.value * 30) / 100; setStages([{ id: newId("etapa"), label: "Início do projeto", percent: 20, amount: first }, { id: newId("etapa"), label: "Metade do projeto", percent: 30, amount: second }, { id: newId("etapa"), label: "Entrega do projeto", percent: 50, amount: Math.round((deal.value - first - second) * 100) / 100 }]) }}>20% / 30% / 50%</Button>
    </div>}
    <FormField label="Dividir por"><OptionSelect value={mode} onChange={setMode} options={[{ value: "percent", label: "Percentuais" }, { value: "amount", label: "Valores em reais" }]} /></FormField>
    {hasCharges && <p className="text-sm text-muted-foreground">Etapas com cobranças emitidas ficam preservadas. Você pode ajustar as etapas restantes.</p>}
    {stages.map((stage, index) => <fieldset key={stage.id} disabled={saving || locked(stage.id)} className="grid gap-3 rounded-lg border p-3 sm:grid-cols-2 disabled:opacity-60">
      <FormField label={`Etapa ${index + 1}`}><Input value={stage.label} onChange={event => change(stage.id, { label: event.target.value })} /></FormField>
      <FormField label={mode === "percent" ? "Percentual (%)" : "Valor"} hint={formatMoney(stage.amount)}>
        {mode === "percent" ? <Input type="number" min="0" max="100" step="0.01" value={stage.percent} onChange={event => { const percent = Number(event.target.value); change(stage.id, { percent, amount: Math.round(deal.value * percent) / 100 }) }} /> : <MoneyInput value={stage.amount} onChange={amount => change(stage.id, { amount, percent: deal.value ? amount / deal.value * 100 : 0 })} />}
      </FormField>
      <FormField label="Vencimento (opcional)"><Input type="date" value={stage.dueDate?.slice(0, 10) || ""} onChange={event => change(stage.id, { dueDate: event.target.value || undefined })} /></FormField>
      <Button type="button" variant="outline" className="self-end" onClick={() => setStages(rows => rows.filter(row => row.id !== stage.id))}>Remover etapa</Button>
    </fieldset>)}
    <Button type="button" variant="outline" disabled={saving} onClick={() => setStages(rows => [...rows, { id: newId("etapa"), label: "", percent: 0, amount: 0 }])}>Adicionar etapa</Button>
    <p className="text-sm">Total das etapas: {formatMoney(total / 100)} de {formatMoney(deal.value)} · restante: {formatMoney((Math.round(deal.value * 100) - total) / 100)}</p>
  </FormDialog>
}
