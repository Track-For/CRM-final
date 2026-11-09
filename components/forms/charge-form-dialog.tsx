"use client"

import { useEffect, useRef, useState } from "react"
import Link from "next/link"
import { Controller, useForm, useWatch } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { addDays, addMonths, format } from "date-fns"
import { AlertTriangle, FlaskConical } from "lucide-react"
import { toast } from "@/lib/store/save-feedback"
import { Input } from "@/components/ui/input"
import { insertIssuedBoleto } from "@/components/finance/finance-actions"
import { FormDialog } from "@/components/forms/form-dialog"
import { lookupCep } from "@/components/invoices/fiscal-meta"
import { EntityCombobox } from "@/components/shared/entity-combobox"
import { FormField, FormGrid } from "@/components/shared/form-field"
import { MoneyInput } from "@/components/shared/money-input"
import { useCardTerms } from "@/components/finance/use-card-terms"
import { ASAAS_METHOD_OPTIONS, BILLING_CHANNEL_OPTIONS, MAX_INSTALLMENTS } from "@/lib/finance/payment-options"
import { OptionSelect } from "@/components/shared/option-select"
import { getBillingSettings, issueBoletoAction, type BoletoPayer, type BoletoResult } from "@/lib/boleto/actions"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { createDirectPixCharge, getChargeWhatsappStatus, sendChargeWhatsapp } from "@/lib/finance/charge-actions"
import { calculateChargeTerms, chargeMessage, type ChargeTerms } from "@/lib/finance/charge-plan"
import { newId, useById, useCharges, useCompany, useCrm } from "@/lib/data"
import { nextMonthlyBilling } from "@/lib/data/deal-subscription"
import { useEntityOptions } from "@/lib/data/options"
import { formatMoney, maskCep, maskDocument, maskPhone, onlyDigits } from "@/lib/format"
import { v } from "@/lib/validation"
import type { Charge, Client, FinancialEntry } from "@/types"

const today = () => format(new Date(), "yyyy-MM-dd")

const schema = z
  .object({
    clientId: v.required("Cliente"),
    description: v.required("Descrição"),
    amount: v.money("Valor"),
    method: v.select(["boleto", "pix", "cartao", "asaas"], "a forma de pagamento"),
    installments: z.string().regex(/^(?:[1-9]|1[0-2])$/),
    channel: z.enum(["pix", "asaas"]),
    cardFeeMode: z.enum(["none", "asaas"]),
    dueDate: v.date("Vencimento"),
    payerName: z.string().trim(),
    payerDocument: z.string().trim(),
    payerEmail: v.emailOptional(),
    payerPhone: z.string().trim(),
    payerCep: z.string().trim(),
    payerStreet: z.string().trim(),
    payerNumber: z.string().trim(),
    payerComplement: z.string().trim(),
    payerDistrict: z.string().trim(),
  })
  .superRefine((val, ctx) => {
    if (val.channel !== "asaas") return
    const issue = (path: string, message: string) => ctx.addIssue({ code: "custom", path: [path], message })
    if (!val.payerName) issue("payerName", "Nome do pagador é obrigatório")
    if (![11, 14].includes(onlyDigits(val.payerDocument).length)) issue("payerDocument", "Informe um CPF com 11 dígitos ou um CNPJ com 14")
    if (val.payerPhone && onlyDigits(val.payerPhone).length < 10) issue("payerPhone", "WhatsApp inválido")
    if (val.payerCep && onlyDigits(val.payerCep).length !== 8) issue("payerCep", "CEP incompleto")
    if (val.dueDate && val.dueDate < today()) issue("dueDate", "O vencimento não pode estar no passado")
  })
type Values = z.infer<typeof schema>

const payerFromClient = (client: Client | undefined) => ({
  payerName: client?.legalName || client?.name || "",
  payerDocument: maskDocument(client?.document ?? ""),
  payerEmail: client?.email ?? "",
  payerPhone: maskPhone(client?.whatsapp ?? ""),
  payerCep: maskCep(client?.address.zip ?? ""),
  payerStreet: client?.address.street ?? "",
  payerNumber: client?.address.number ?? "",
  payerComplement: client?.address.complement ?? "",
  payerDistrict: client?.address.district ?? "",
})

const toPayer = (values: Values): BoletoPayer => ({
  name: values.payerName,
  cpfCnpj: onlyDigits(values.payerDocument),
  email: values.payerEmail || undefined,
  phone: onlyDigits(values.payerPhone) || undefined,
  cep: onlyDigits(values.payerCep) || undefined,
  street: values.payerStreet || undefined,
  number: values.payerNumber || undefined,
  complement: values.payerComplement || undefined,
  district: values.payerDistrict || undefined,
})

/** Lote de boletos a emitir. Os ids ficam fixos entre tentativas: é o que permite ao servidor reconciliar e não duplicar. */
interface BoletoPlan {
  signature: string
  items: { charge: Charge; entry: FinancialEntry; issued: boolean }[]
}

type BillingCheck = { kind: "connected"; environment: "sandbox" | "producao" } | { kind: "disconnected" } | { kind: "unavailable" }

interface IssueFailure {
  issued: number
  total: number
  parcel: number
  message: string
}

/** Emite em sequência o que falta no lote e para na primeira falha. As parcelas emitidas ficam marcadas e já estão no store. */
async function runBoletoPlan(plan: BoletoPlan, payer: BoletoPayer, installmentPlan: ChargeTerms): Promise<IssueFailure | null> {
  const item = plan.items[0]
  let res: BoletoResult
  try { res = await issueBoletoAction({ charge: item.charge, entry: item.entry, payer, installmentPlan }) }
  catch { res = { ok: false, error: "Não foi possível falar com o servidor. Tente novamente com os mesmos dados." } }
  if (!res.ok || !res.charge) return { issued: 0, total: plan.items.length, parcel: 1, message: res.error || "Não foi possível criar a cobrança." }
  const list = res.charges || [res.charge]
  plan.items = list.map((charge, i) => ({ charge, entry: res.entries?.[i] || item.entry, issued: true }))
  for (const entry of plan.items) insertIssuedBoleto(entry.charge, entry.entry)
  return null
}

interface ChargeFormDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  defaults?: { chargeId?: string; clientId?: string; dealId?: string; amount?: string; description?: string; pixKey?: string; milestoneId?: string; subscriptionId?: string; method?: string; dueDate?: string }
}

export function ChargeFormDialog({ open, onOpenChange, defaults }: ChargeFormDialogProps) {
  const company = useCompany()
  const charges = useCharges()
  const clients = useById("clients")
  const { clientOptions } = useEntityOptions()

  const [billing, setBilling] = useState<BillingCheck | null>(null)
  const [progress, setProgress] = useState<{ current: number; total: number } | null>(null)
  const [failure, setFailure] = useState<IssueFailure | null>(null)
  const [cepStatus, setCepStatus] = useState<"idle" | "loading" | "notfound">("idle")
  const planRef = useRef<BoletoPlan | null>(null)
  const directId = useRef<string | null>(null)
  const [ready, setReady] = useState<Charge[] | null>(null)
  const [whatsappConnected, setWhatsappConnected] = useState(false)
  const [messageEdit, setMessageEdit] = useState<{ source: string; text: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const [sendError, setSendError] = useState("")

  const initial = (): Values => {
    const existing = charges.find(charge => charge.id === defaults?.chargeId)
    return {
      clientId: defaults?.clientId ?? "",
      description: defaults?.description ?? "",
      amount: existing?.paymentTerms?.baseAmount ?? (defaults?.amount ? Number(defaults.amount) : 0),
      method: defaults?.method === "boleto" || defaults?.method === "cartao" || defaults?.method === "asaas" ? defaults.method : "pix",
      installments: String(existing?.paymentTerms?.count || 1),
      channel: existing?.paymentChannel || (defaults?.method && defaults.method !== "pix" ? "asaas" : "pix"),
      cardFeeMode: existing?.paymentTerms?.cardFeeMode || "none",
      dueDate: defaults?.dueDate?.slice(0, 10) || format(addDays(new Date(), 5), "yyyy-MM-dd"),
      ...payerFromClient(defaults?.clientId ? clients.get(defaults.clientId) : undefined),
    }
  }
  const { register, control, handleSubmit, reset, setValue, getValues, formState } = useForm<Values>({ resolver: zodResolver(schema), defaultValues: initial() })
  const errors = formState.errors

  // Reinicia o aviso de falha a cada abertura, durante a renderização, para não piscar o estado anterior.
  const [wasOpen, setWasOpen] = useState(open)
  if (open !== wasOpen) {
    setWasOpen(open)
    if (open) {
      setFailure(null)
      setCepStatus("idle")
      setReady(null)
      setSendError("")
      setMessageEdit(null)
      setWhatsappConnected(false)
    }
  }

  useEffect(() => {
    if (open) {
      reset(initial())
      getChargeWhatsappStatus().then(s => setWhatsappConnected(s.connected)).catch(() => setWhatsappConnected(false))
      return
    }
    // Ao fechar: com parcelas já emitidas o usuário foi avisado e o lote acaba aqui. Sem nenhuma, os
    // ids continuam guardados para que repetir os mesmos dados depois de um timeout não duplique.
    if (planRef.current?.items.some((i) => i.issued)) planRef.current = null
    if (ready) directId.current = null
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const amount = useWatch({ control, name: "amount" })
  const selectedInstallments = Number(useWatch({ control, name: "installments" }))
  const channel = useWatch({ control, name: "channel" })
  const method = useWatch({ control, name: "method" })
  const cardFeeMode = useWatch({ control, name: "cardFeeMode" })
  const clientId = useWatch({ control, name: "clientId" })
  const description = useWatch({ control, name: "description" })
  const dueDate = useWatch({ control, name: "dueDate" })
  const usesAsaas = channel === "asaas"
  const installments = usesAsaas ? selectedInstallments : 1
  const creditCard = usesAsaas && method === "cartao"
  const cardQuote = useCardTerms(amount, installments, cardFeeMode, creditCard)
  const issuing = progress !== null || busy
  const locked = Boolean(ready) || Boolean(failure)
  const terms: ChargeTerms = creditCard && cardQuote.terms && amount > 0 ? cardQuote.terms : { baseAmount: amount > 0 ? amount : 0.01, surchargePercent: 0, count: installments || 1 }
  let calculation = { total: 0, surcharge: 0, amounts: [0] }
  try { calculation = calculateChargeTerms(terms) } catch { /* Validation appears on submission. */ }
  const client = clients.get(clientId)
  const generatedMessage = calculation.total > 0 ? chargeMessage({ name: client?.contactName || client?.name || "", company: company.name || "nossa empresa", description, dueDate, terms: { ...terms, count: calculation.amounts.length }, pixKey: company.pixKey, asaas: usesAsaas }) : "Preencha o valor para preparar a mensagem."
  const message = messageEdit?.source === generatedMessage ? messageEdit.text : generatedMessage
  const canSend = whatsappConnected && onlyDigits(client?.whatsapp || "").length >= 10

  useEffect(() => {
    if (!open || !usesAsaas) return
    let alive = true
    getBillingSettings()
      .then((s) => {
        if (alive) setBilling(s.connected ? { kind: "connected", environment: s.environment } : { kind: "disconnected" })
      })
      .catch(() => {
        if (alive) setBilling({ kind: "unavailable" })
      })
    return () => {
      alive = false
    }
  }, [open, usesAsaas])

  const changeOpen = (next: boolean) => {
    if (!issuing) onOpenChange(next)
  }

  const fillPayer = (clientId: string | undefined) => {
    const payer = payerFromClient(clientId ? clients.get(clientId) : undefined)
    for (const [key, value] of Object.entries(payer)) setValue(key as keyof typeof payer, value, { shouldValidate: formState.isSubmitted })
    setCepStatus("idle")
  }

  const changeCep = async (raw: string) => {
    const masked = maskCep(raw)
    setValue("payerCep", masked)
    const digits = onlyDigits(masked)
    if (digits.length !== 8) {
      setCepStatus("idle")
      return
    }
    setCepStatus("loading")
    const found = await lookupCep(digits)
    // O CEP pode ter mudado enquanto a busca respondia.
    if (onlyDigits(getValues("payerCep")) !== digits) return
    setCepStatus(found ? "idle" : "notfound")
    if (found) {
      setValue("payerStreet", found.street)
      setValue("payerDistrict", found.district)
    }
  }

  const buildCharges = (values: Values): Charge[] => {
    const n = Number(values.installments)
    const amounts = calculateChargeTerms({ ...terms, baseAmount: values.amount, count: n }).amounts
    const seq = Math.max(...charges.map((c) => Number(c.number.replace(/\D/g, "")) || 0), 1200) + 1
    return Array.from({ length: n }, (_, i) => ({
      id: defaults?.chargeId && i === 0 ? defaults.chargeId : newId("chg"),
      number: `COB-${seq + i}`,
      clientId: values.clientId,
      dealId: defaults?.dealId,
      pixKey: values.method === "pix" ? company.pixKey : undefined,
      milestoneId: defaults?.milestoneId,
      subscriptionId: defaults?.subscriptionId,
      description: n > 1 ? `${values.description} (${i + 1}/${n})` : values.description,
      amount: amounts[i],
      method: values.channel === "pix" ? "pix" : values.method,
      paymentChannel: values.channel,
      installment: i + 1,
      installments: n,
      dueDate: addMonths(new Date(`${values.dueDate}T12:00:00`), i).toISOString(),
      status: "pendente",
      // Linha e código do boleto só vêm do Asaas, depois do registro.
      digitableLine: "",
      barcode: "",
      pixCode: "",
      createdAt: new Date().toISOString(),
    }))
  }

  const buildEntry = (charge: Charge): FinancialEntry => ({
    id: useCrm.getState().entries.find(entry => entry.chargeId === charge.id)?.id || newId("ent"),
    type: "receita",
    description: charge.description,
    categoryId: charge.subscriptionId ? "fc_mensalidades" : "fc_projetos",
    amount: charge.amount,
    competenceDate: charge.dueDate,
    dueDate: charge.dueDate,
    status: "pendente",
    clientId: charge.clientId,
    chargeId: charge.id,
  })

  const advanceMonthlyBilling = () => {
    const state = useCrm.getState()
    const subscription = state.subscriptions.find(item => item.id === defaults?.subscriptionId)
    if (subscription) state.update("subscriptions", subscription.id, { nextBillingDate: nextMonthlyBilling(subscription, state.charges) })
  }

  const issueBoletos = async (values: Values) => {
    if (billing?.kind !== "connected") return
    const signature = JSON.stringify([values.clientId, values.description, values.amount, values.installments, values.dueDate, values.method, defaults?.dealId, defaults?.chargeId])
    // Lote com parcela já emitida continua igual, mesmo que algo tenha mudado no formulário.
    const pending = planRef.current
    const plan: BoletoPlan =
      pending
        ? pending
        : { signature, items: buildCharges(values).map((charge) => ({ charge, entry: buildEntry(charge), issued: false })) }
    planRef.current = plan

    const total = plan.items.length
    setFailure(null)
    setProgress({ current: 1, total })
    const failed = await runBoletoPlan(plan, toPayer(values), { ...terms, baseAmount: values.amount, count: Number(values.installments) })
    setProgress(null)
    if (failed) {
      setFailure(failed)
      toast.error(failed.issued ? `${failed.issued} de ${total} cobranças criadas. A emissão parou.` : "Cobrança não emitida", { description: failed.message })
      return null
    }
    planRef.current = null
    advanceMonthlyBilling()
    toast.success(total > 1 ? `${total} cobranças criadas no Asaas` : "Cobrança criada no Asaas", {
      description: billing.environment === "sandbox" ? "Sandbox (teste, sem valor)" : "Envio pelo Asaas habilitado por e-mail ou SMS.",
    })
    return plan.items.map(item => item.charge)
  }

  const submit = async (values: Values, send = false) => {
    if (creditCard && !ready && !cardQuote.terms) { toast.error(cardQuote.error || "Aguarde a consulta das taxas do Asaas"); return }
    setBusy(true)
    setSendError("")
    try {
      let list = ready
      if (!list) {
        if (values.channel === "asaas") list = await issueBoletos(values) || null
        else {
          directId.current ||= defaults?.chargeId || newId("chg")
          const result = await createDirectPixCharge({ id: directId.current, clientId: values.clientId, description: values.description, dueDate: values.dueDate, terms: { baseAmount: values.amount, surchargePercent: 0, count: 1 }, dealId: defaults?.dealId, milestoneId: defaults?.milestoneId, subscriptionId: defaults?.subscriptionId })
          list = result.charges
          for (const charge of list) insertIssuedBoleto(charge, result.entries.find(entry => entry.chargeId === charge.id))
          advanceMonthlyBilling()
          toast.success("Cobrança Pix gerada")
        }
        if (!list) return
        setReady(list)
      }
      if (send) {
        const result = await sendChargeWhatsapp(list[0].id, message)
        if (!result.ok) { setSendError(result.error || "Não foi possível enviar."); toast.error("Cobrança salva; envio não confirmado"); return }
        toast.success("Cobrança enviada pelo WhatsApp")
      }
      directId.current = null
      onOpenChange(false)
    } catch (error) {
      const detail = error instanceof Error ? error.message : "Não foi possível concluir. Tente novamente."
      setSendError(detail)
      toast.error(detail)
    } finally { setBusy(false) }
  }

  const boletoBlocked = usesAsaas && billing?.kind !== "connected"
  const submitLabel = issuing ? "Gerando cobrança..." : ready ? "Concluir sem enviar" : "Gerar cobrança"

  return (
    <FormDialog
      open={open}
      onOpenChange={changeOpen}
      title="Nova cobrança"
      description="Escolha Pix direto ou Asaas. Revise a mensagem e envie a cobrança pelo WhatsApp conectado ao CRM."
      onSubmit={(e) => void handleSubmit(values => submit(values))(e)}
      submitLabel={submitLabel}
      submitting={issuing || (boletoBlocked && !ready)}
      extraFooter={<Button type="button" variant="outline" disabled={issuing || !canSend || (boletoBlocked && !ready)} onClick={() => void handleSubmit(values => submit(values, true))()}>{ready ? "Enviar pelo WhatsApp" : "Gerar e enviar"}</Button>}
    >
      {usesAsaas && <p className="rounded-lg border p-3 text-sm">O Asaas enviará o aviso de cobrança para o e-mail do cliente ou, na ausência dele, por SMS. O envio segue as configurações e tarifas do Asaas.</p>}
      <fieldset disabled={locked || issuing} className="min-w-0 disabled:opacity-70">
        {channel === "pix" && company.pixKey && <p className="mb-3 break-all text-sm">Chave Pix: {company.pixKey}</p>}
        <legend className="sr-only">Dados da cobrança</legend>
        <FormGrid>
          <FormField label="Cliente" required error={errors.clientId?.message} className="sm:col-span-2">
            <Controller
              control={control}
              name="clientId"
              render={({ field }) => (
                <EntityCombobox
                  options={clientOptions}
                  value={field.value}
                  onChange={(id) => {
                    field.onChange(id ?? "")
                    fillPayer(id ?? undefined)
                  }}
                  invalid={!!errors.clientId}
                  allowClear={false}
                  placeholder="Selecione o cliente"
                />
              )}
            />
          </FormField>
          <FormField label="Descrição" required error={errors.description?.message} className="sm:col-span-2">
            <Input {...register("description")} placeholder="Ex.: Entrada 50% — Site institucional" aria-invalid={!!errors.description} />
          </FormField>
          <FormField label="Valor total" required error={errors.amount?.message}>
            <Controller control={control} name="amount" render={({ field }) => <MoneyInput value={field.value} onChange={field.onChange} aria-invalid={!!errors.amount} />} />
          </FormField>
          <FormField label="Cobrar por" required>
            <Controller control={control} name="channel" render={({ field }) => <OptionSelect value={field.value} onChange={value => { field.onChange(value); setValue("method", value === "asaas" ? "asaas" : "pix"); if (value === "pix") setValue("installments", "1") }} options={BILLING_CHANNEL_OPTIONS} />} />
          </FormField>
          {usesAsaas && <>
            <FormField label="Forma de pagamento no Asaas" required>
              <Controller control={control} name="method" render={({ field }) => <OptionSelect value={field.value} onChange={field.onChange} options={ASAAS_METHOD_OPTIONS} />} />
            </FormField>
          </>}
          {usesAsaas && <FormField label="Parcelas" hint={installments > 1 ? `${installments}x de ${formatMoney(calculation.amounts[0])}` : undefined}>
            <Controller
              control={control}
              name="installments"
              render={({ field }) => <OptionSelect value={field.value} onChange={field.onChange} disabled={!!defaults?.chargeId} options={Array.from({ length: MAX_INSTALLMENTS }, (_, i) => ({ value: String(i + 1), label: i ? `${i + 1}x` : "À vista" }))} />}
            />
          </FormField>}
          {creditCard && installments > 1 && <FormField label="Condição do parcelamento"><Controller control={control} name="cardFeeMode" render={({ field }) => <OptionSelect value={field.value} onChange={field.onChange} options={[{ value: "none", label: "Sem juros para o cliente" }, { value: "asaas", label: "Repassar taxas do Asaas ao cliente" }]} />} /></FormField>}
          <FormField label="Vencimento" required error={errors.dueDate?.message} hint={installments > 1 ? "Demais parcelas vencem a cada mês" : undefined}>
            <Input type="date" min={usesAsaas ? today() : undefined} {...register("dueDate")} aria-invalid={!!errors.dueDate} />
          </FormField>
        </FormGrid>
      </fieldset>

      <div className="space-y-2 rounded-xl border p-4 text-sm">
        <p>Valor original: <strong>{formatMoney(amount || 0)}</strong></p>
        {creditCard && calculation.surcharge > 0 && <p>Taxas repassadas do Asaas: <strong>{formatMoney(calculation.surcharge)}</strong></p>}
        {creditCard && cardQuote.loading && <p role="status">Consultando taxas do Asaas…</p>}
        {creditCard && cardQuote.error && <p role="alert" className="text-danger">{cardQuote.error}</p>}
        <p>Total a cobrar: <strong>{formatMoney(calculation.total)}</strong></p>
        <p>{installments > 1 ? `${installments} parcelas; última de ${formatMoney(calculation.amounts.at(-1) || 0)}` : "À vista"}</p>
        {usesAsaas && <p className="text-xs text-muted-foreground">As taxas de parcelamento seguem as condições da sua conta Asaas. Multa e juros por atraso seguem as configurações da integração. No cartão, o cliente informa os dados na página do Asaas.</p>}
      </div>
      <FormField label="Mensagem para o WhatsApp" hint={`Destinatário: ${client?.whatsapp || "cliente sem WhatsApp cadastrado"}`}>
        <Textarea rows={8} value={message} disabled={issuing} onChange={event => setMessageEdit({ source: generatedMessage, text: event.target.value })} />
        {usesAsaas && !ready && <p className="text-xs text-muted-foreground">O marcador de link será substituído pelo link real do Asaas após gerar a cobrança.</p>}
        {!whatsappConnected && <p className="text-xs text-muted-foreground">WhatsApp desconectado. Você pode gerar sem enviar e reconectar em WhatsApp.</p>}
        {ready && <p className="text-sm text-success">Cobrança já salva. Uma nova tentativa enviará apenas a mensagem.</p>}
        {sendError && <p role="alert" className="text-sm text-danger">{sendError}</p>}
      </FormField>
      {usesAsaas && billing === null && <p className="rounded-lg border bg-surface p-3 text-xs text-muted-foreground">Verificando a conexão com o Asaas...</p>}

      {usesAsaas && billing?.kind === "disconnected" && (
        <div role="alert" className="flex items-start gap-3 rounded-lg border border-[#4a330b] bg-warning-soft p-3 text-sm">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden />
          <div className="min-w-0">
            <p className="font-medium text-warning">Asaas desconectado</p>
            <p className="text-xs text-muted-foreground">
              Para emitir cobranças,{" "}
              <Link href="/integracoes/asaas" className="text-primary hover:underline" onClick={() => onOpenChange(false)}>
                conecte o Asaas em Integrações
              </Link>
              . Só administradores e o financeiro emitem cobranças e configuram a conexão.
            </p>
          </div>
        </div>
      )}

      {usesAsaas && billing?.kind === "unavailable" && (
        <div role="alert" className="flex items-start gap-3 rounded-lg border border-[#4a1818] bg-danger-soft p-3 text-sm">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-danger" aria-hidden />
          <div className="min-w-0">
            <p className="font-medium text-danger">Não foi possível verificar o Asaas</p>
            <p className="text-xs text-muted-foreground">A emissão fica bloqueada até a conexão ser confirmada. Feche esta janela e abra de novo.</p>
          </div>
        </div>
      )}

      {usesAsaas && billing?.kind === "connected" && billing.environment === "sandbox" && (
        <p className="flex items-start gap-2 rounded-lg border border-[#4a330b] bg-warning-soft p-3 text-xs text-warning">
          <FlaskConical className="mt-0.5 size-3.5 shrink-0" aria-hidden />
          Sandbox (teste, sem valor): as cobranças são criadas no ambiente de testes do Asaas.
        </p>
      )}

      {failure && (
        <div role="alert" className="flex items-start gap-3 rounded-lg border border-[#4a1818] bg-danger-soft p-3 text-sm">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-danger" aria-hidden />
          <div className="min-w-0">
            <p className="font-medium text-danger">
              {failure.total > 1 ? `Parcela ${failure.parcel} de ${failure.total} não saiu: ${failure.issued} ${failure.issued === 1 ? "cobrança criada" : "cobranças criadas"}` : "Cobrança não emitida"}
            </p>
            <p className="text-xs break-words text-muted-foreground">{failure.message}</p>
            {locked && <p className="mt-1 text-xs text-muted-foreground">Os já emitidos estão em Cobranças e valem. Só os dados do pagador podem mudar até terminar o lote.</p>}
          </div>
        </div>
      )}

      {usesAsaas && (
        <fieldset disabled={issuing} className="min-w-0 space-y-3 rounded-xl border p-4 disabled:opacity-70">
          <legend className="px-1 text-sm font-semibold">Dados do pagador</legend>
          <FormGrid>
            <FormField label="Nome ou razão social" required htmlFor="payer-name" error={errors.payerName?.message} className="sm:col-span-2">
              <Input id="payer-name" {...register("payerName")} autoComplete="off" aria-invalid={!!errors.payerName} />
            </FormField>
            <FormField label="CPF ou CNPJ" required htmlFor="payer-document" error={errors.payerDocument?.message}>
              <Input
                id="payer-document"
                className="num"
                inputMode="numeric"
                autoComplete="off"
                aria-invalid={!!errors.payerDocument}
                {...register("payerDocument", { onChange: (e) => setValue("payerDocument", maskDocument(e.target.value)) })}
              />
            </FormField>
            <FormField label="WhatsApp" htmlFor="payer-phone" error={errors.payerPhone?.message}>
              <Input
                id="payer-phone"
                className="num"
                inputMode="tel"
                autoComplete="off"
                aria-invalid={!!errors.payerPhone}
                {...register("payerPhone", { onChange: (e) => setValue("payerPhone", maskPhone(e.target.value)) })}
              />
            </FormField>
            <FormField label="E-mail" htmlFor="payer-email" error={errors.payerEmail?.message} hint="O Asaas usará este e-mail para enviar o aviso da cobrança. Sem e-mail, o envio será por SMS." className="sm:col-span-2">
              <Input id="payer-email" type="email" autoComplete="off" aria-invalid={!!errors.payerEmail} {...register("payerEmail")} />
            </FormField>
            <FormField
              label="CEP"
              htmlFor="payer-cep"
              error={errors.payerCep?.message ?? (cepStatus === "notfound" ? "CEP não encontrado. Preencha o endereço à mão." : undefined)}
              hint={cepStatus === "loading" ? "Buscando endereço..." : undefined}
            >
              <Input
                id="payer-cep"
                className="num"
                inputMode="numeric"
                autoComplete="off"
                aria-invalid={!!errors.payerCep}
                {...register("payerCep", { onChange: (e) => void changeCep(e.target.value) })}
              />
            </FormField>
            <FormField label="Rua" htmlFor="payer-street">
              <Input id="payer-street" autoComplete="off" {...register("payerStreet")} />
            </FormField>
            <FormField label="Número" htmlFor="payer-number">
              <Input id="payer-number" autoComplete="off" {...register("payerNumber")} />
            </FormField>
            <FormField label="Complemento" htmlFor="payer-complement">
              <Input id="payer-complement" autoComplete="off" {...register("payerComplement")} />
            </FormField>
            <FormField label="Bairro" htmlFor="payer-district" className="sm:col-span-2">
              <Input id="payer-district" autoComplete="off" {...register("payerDistrict")} />
            </FormField>
          </FormGrid>
        </fieldset>
      )}
    </FormDialog>
  )
}
