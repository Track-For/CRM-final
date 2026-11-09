"use client"

import { useState } from "react"
import { toast } from "@/lib/store/save-feedback"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { FormDialog } from "@/components/forms/form-dialog"
import { FormField } from "@/components/shared/form-field"
import { MoneyInput } from "@/components/shared/money-input"
import { ASAAS_METHOD_OPTIONS, BILLING_CHANNEL_OPTIONS, MAX_INSTALLMENTS } from "@/lib/finance/payment-options"
import { OptionSelect } from "@/components/shared/option-select"
import { newId, useCompany, useCrm } from "@/lib/data"
import { editableForecast } from "@/lib/data/project-receivables"
import { calculateChargeTerms } from "@/lib/finance/charge-plan"
import { dealDateSchema, todayDealDate } from "@/lib/data/deal-dates"
import { useCardTerms } from "@/components/finance/use-card-terms"
import { useUiStore } from "@/lib/store/ui-store"
import { getDatabase } from "@/lib/data/api"
import { saveRecord } from "@/lib/data/records-actions"
import { formatMoney } from "@/lib/format"
import type { Deal, PaymentMethod } from "@/types"

type Stage = NonNullable<Deal["paymentPlan"]>["milestones"][number]

export function PaymentPlanDialog({ deal, onClose, onSaved, confirmingWin = false }: { deal: Deal; onClose: () => void; onSaved?: (wonDate?: string) => void | Promise<void>; confirmingWin?: boolean }) {
  const charges = useCrm(state => state.charges)
  const canIssue = ["admin", "financeiro"].includes(useUiStore(state => state.role))
  const [method, setMethod] = useState<PaymentMethod>(deal.paymentPlan?.method || "pix")
  const [channel, setChannel] = useState<"pix" | "asaas">(deal.paymentPlan?.paymentChannel || (deal.paymentPlan?.method && deal.paymentPlan.method !== "pix" ? "asaas" : "pix"))
  const usesAsaas = channel === "asaas"
  const company = useCompany()
  const pixKey = company.pixKey || ""
  const [mode, setMode] = useState<"percent" | "amount">("percent")
  const [stages, setStages] = useState<Stage[]>(deal.paymentPlan?.milestones || [{ id: newId("etapa"), label: "", percent: 0, amount: 0 }])
  const [saving, setSaving] = useState(false)
  const [wonDate, setWonDate] = useState(todayDealDate)
  const locked = (id: string) => charges.some(charge => charge.dealId === deal.id && charge.milestoneId === id && charge.status !== "cancelado" && !editableForecast(charge))
  const hasCharges = stages.some(stage => locked(stage.id))
  const noProjectCharge = deal.value === 0 && !hasCharges
  const creditCard = usesAsaas && method === "cartao"
  const [cardCount, setCardCount] = useState(stages.length === 1 ? stages[0].installments || 1 : 1)
  const [cardDueDate, setCardDueDate] = useState(stages[0]?.dueDate?.slice(0, 10) || "")
  const [cardFeeMode, setCardFeeMode] = useState<"none" | "asaas">(stages[0]?.cardFeeMode || "none")
  const cardQuote = useCardTerms(deal.value, cardCount, cardFeeMode, creditCard && !hasCharges)
  let cardCalculation: ReturnType<typeof calculateChargeTerms> | null = null
  try {
    if (deal.value > 0 && (hasCharges || cardQuote.terms)) cardCalculation = calculateChargeTerms(hasCharges ? { baseAmount: deal.value, count: cardCount, surchargePercent: stages[0]?.asaasFeePercent || 0 } : cardQuote.terms!)
  } catch { /* O envio valida valores insuficientes para a quantidade de parcelas. */ }
  const selectedStages: Stage[] = creditCard && !hasCharges ? [{ id: stages.length === 1 ? stages[0].id : `card_${deal.id}`, label: "Pagamento no cartão", amount: deal.value, percent: 100, dueDate: cardDueDate || undefined, installments: cardCount, cardFeeMode: cardCount > 1 ? cardFeeMode : "none", asaasFeePercent: cardQuote.terms?.surchargePercent || 0 }] : stages
  const change = (id: string, patch: Partial<Stage>) => setStages(rows => rows.map(row => row.id === id ? { ...row, ...patch } : row))
  const total = Math.round(selectedStages.reduce((sum, stage) => sum + stage.amount, 0) * 100)
  const save = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (confirmingWin && !dealDateSchema.safeParse(wonDate).success) return void toast.error("Informe uma data válida para o ganho")
    if (creditCard && !hasCharges && !cardQuote.terms) return void toast.error(cardQuote.error || "Aguarde a consulta das taxas do Asaas")
    if (!noProjectCharge && (!selectedStages.length || selectedStages.some(stage => !stage.label.trim() || !Number.isFinite(stage.amount) || stage.amount <= 0 || !Number.isFinite(stage.percent) || stage.percent <= 0))) return void toast.error("Preencha o nome e um valor positivo para cada etapa")
    if (!noProjectCharge && total !== Math.round(deal.value * 100)) return void toast.error("A soma das etapas deve ser igual ao valor do projeto")
    if (!noProjectCharge && !usesAsaas && !pixKey.trim()) return void toast.error("Cadastre a chave Pix em Configurações → Empresa")
    if (!noProjectCharge && usesAsaas) {
      try { for (const stage of selectedStages) calculateChargeTerms({ baseAmount: stage.amount, surchargePercent: stage.asaasFeePercent || 0, count: stage.installments || 1 }) }
      catch { return void toast.error("Revise os valores e a quantidade de parcelas de cada etapa") }
    }
    const paymentPlan = { method: usesAsaas ? method : "pix" as const, paymentChannel: channel, pixKey: !usesAsaas ? pixKey.trim() : "", milestones: noProjectCharge ? [] : selectedStages.map(stage => ({ ...stage, label: stage.label.trim(), installments: usesAsaas ? stage.installments || 1 : 1, ...(!creditCard ? { cardFeeMode: undefined, asaasFeePercent: undefined } : {}) })) }
    setSaving(true)
    try {
      await saveRecord("deals", deal.id, { paymentPlan })
      const data = await getDatabase()
      const state = useCrm.getState()
      state.replace("deals", data.deals)
      state.replace("charges", data.charges)
      state.replace("entries", data.entries)
      if (onSaved) await onSaved(confirmingWin ? wonDate : undefined)
      else { toast.success("Plano de cobrança salvo"); onClose() }
    } catch (error) { toast.error(error instanceof Error ? error.message : "Não foi possível salvar o plano. Tente novamente.") }
    finally { setSaving(false) }
  }
  return <FormDialog open onOpenChange={open => !open && !saving && onClose()} title={confirmingWin ? "2 de 2 · Pagamento do projeto" : "Personalizar cobrança"} submitLabel={confirmingWin ? "Confirmar ganho e cobranças" : "Salvar"} description={`${deal.title} · Total ${formatMoney(deal.value)}`} onSubmit={save} submitting={saving} size="xl">
    {confirmingWin && <FormField label="Data do ganho" required hint="Preenchida com hoje. Ajuste para a data em que o contrato foi fechado."><Input type="date" required value={wonDate} onChange={event => setWonDate(event.target.value)} disabled={saving} /></FormField>}
    {noProjectCharge ? <p className="rounded-lg border bg-surface p-4 text-sm">O projeto tem valor R$ 0,00. A venda pode ser confirmada sem parcelas de projeto. A manutenção é tratada separadamente.</p> : <>
    {confirmingWin && usesAsaas && <p className="rounded-lg border p-3 text-sm">{canIssue ? "Ao confirmar o ganho, as cobranças com vencimento definido serão emitidas no Asaas, com envio habilitado ao cliente." : "Ao confirmar o ganho, o plano ficará salvo para emissão pelo Financeiro ou Admin. Seu perfil comercial não emite cobranças."} Cobranças sem data ficam no CRM até você informar o vencimento.</p>}
    <FormField label="Cobrar por" required><OptionSelect value={channel} onChange={value => { setChannel(value); setMethod(value === "asaas" ? "asaas" : "pix"); if (value === "pix") setStages(rows => rows.map(stage => ({ ...stage, installments: 1 }))) }} options={BILLING_CHANNEL_OPTIONS} disabled={hasCharges} /></FormField>
    {usesAsaas && <>
      <FormField label="Forma de pagamento no Asaas" required><OptionSelect value={method} onChange={setMethod} options={ASAAS_METHOD_OPTIONS} disabled={hasCharges} /></FormField>
      {!creditCard && <p className="text-xs text-muted-foreground">As taxas de parcelamento seguem as condições da sua conta Asaas. Cada etapa pode ser paga à vista ou parcelada mensalmente a partir do vencimento informado.</p>}
    </>}
    {!usesAsaas && <FormField label="Chave Pix"><Input value={pixKey} readOnly aria-label="Chave Pix da empresa" /></FormField>}
    {creditCard ? <fieldset disabled={hasCharges || saving} className="space-y-4 disabled:opacity-70">
      {hasCharges && <p className="text-sm text-muted-foreground">As cobranças de cartão já emitidas ficam preservadas. As condições não podem ser alteradas neste plano.</p>}
      <FormField label="Pagamento no cartão"><OptionSelect value={String(cardCount)} onChange={value => setCardCount(Number(value))} options={Array.from({ length: MAX_INSTALLMENTS }, (_, i) => ({ value: String(i + 1), label: i ? `${i + 1} vezes` : "À vista" }))} /></FormField>
      {cardCount > 1 && <FormField label="Condição do parcelamento"><OptionSelect value={cardFeeMode} onChange={setCardFeeMode} options={[{ value: "none", label: "Sem juros para o cliente" }, { value: "asaas", label: "Repassar taxas do Asaas ao cliente" }]} /></FormField>}
      <p className="text-xs text-muted-foreground">{cardCount > 1 && cardFeeMode === "asaas" ? "O acréscimo é calculado pelo simulador de taxas da sua conta Asaas e incluído no total do cliente." : "O cliente paga o valor do serviço. As taxas do Asaas são descontadas do seu recebimento."}</p>
      <FormField label={cardCount > 1 ? "Primeiro vencimento (opcional)" : "Vencimento (opcional)"}><Input type="date" value={cardDueDate} onChange={event => setCardDueDate(event.target.value)} /></FormField>
      {cardQuote.loading && <p role="status" className="text-sm text-muted-foreground">Consultando taxas do Asaas…</p>}
      {cardQuote.error && <p role="alert" className="text-sm text-danger">{cardQuote.error}</p>}
      {cardCalculation && <div className="space-y-1 rounded-lg border p-4 text-sm"><p>Valor do serviço: {formatMoney(deal.value)}</p>{cardCalculation.surcharge > 0 && <p>Taxas repassadas: {formatMoney(cardCalculation.surcharge)}</p>}<p className="font-semibold">Total do cliente: {formatMoney(cardCalculation.total)}</p><p>{cardCount === 1 ? "À vista" : `${cardCount}x de ${formatMoney(cardCalculation.amounts[0])}${cardCalculation.amounts.at(-1) !== cardCalculation.amounts[0] ? ` · última de ${formatMoney(cardCalculation.amounts.at(-1)!)}` : ""}`}</p></div>}
    </fieldset> : <>
    {!creditCard && !hasCharges && <div className="flex flex-wrap gap-2">
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
      {usesAsaas && <FormField label="Parcelas no Asaas" hint={stage.installments && stage.installments > 1 ? `Total da etapa: ${formatMoney(stage.amount)} · dividido em ${stage.installments} parcelas` : undefined}><OptionSelect value={String(stage.installments || 1)} onChange={value => change(stage.id, { installments: Number(value) })} options={Array.from({ length: MAX_INSTALLMENTS }, (_, i) => ({ value: String(i + 1), label: i ? `${i + 1}x` : "À vista" }))} /></FormField>}
      <FormField label={usesAsaas && (stage.installments || 1) > 1 ? "Primeiro vencimento (opcional)" : "Vencimento (opcional)"}><Input type="date" value={stage.dueDate?.slice(0, 10) || ""} onChange={event => change(stage.id, { dueDate: event.target.value || undefined })} /></FormField>
      <Button type="button" variant="outline" className="self-end" onClick={() => setStages(rows => rows.filter(row => row.id !== stage.id))}>Remover etapa</Button>
    </fieldset>)}
    <Button type="button" variant="outline" disabled={saving} onClick={() => setStages(rows => [...rows, { id: newId("etapa"), label: "", percent: 0, amount: 0 }])}>Adicionar etapa</Button>
    <p className="text-sm">Total das etapas: {formatMoney(total / 100)} de {formatMoney(deal.value)} · restante: {formatMoney((Math.round(deal.value * 100) - total) / 100)}</p>
    </>}
    </>}
  </FormDialog>
}
