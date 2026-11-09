"use client"

import { useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { Controller, useForm, useWatch, type FieldPath } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { addDays } from "date-fns"
import { toast } from "@/lib/store/save-feedback"
import { Check, ChevronDown, ChevronLeft, ChevronRight, FileDown, MessageCircle, Minus, Plus, Save, Wallet, Zap } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Textarea } from "@/components/ui/textarea"
import { EntityCombobox } from "@/components/shared/entity-combobox"
import { FormField } from "@/components/shared/form-field"
import { MoneyInput } from "@/components/shared/money-input"
import { OptionSelect } from "@/components/shared/option-select"
import { PageHeader } from "@/components/shared/page-header"
import { Panel } from "@/components/shared/panel"
import { EnumBadge } from "@/components/shared/status-badge"
import { PROJECT_TYPE_LABEL, QUOTE_STATUS_LABEL, QUOTE_STATUS_TONE, toOptions } from "@/lib/constants"
import { newId, useAddons, useCatalog, useClients, useCrm, useDeals, useHostingPlans, useLeads, usePricingRules, useQuotes } from "@/lib/data"
import { useEntityOptions } from "@/lib/data/options"
import { generateQuotePdfAction } from "@/lib/quotes/actions"
import { openWhatsapp } from "@/lib/browser"
import { formatDate, formatDays, formatMoney, whatsappLink } from "@/lib/format"
import { calculateQuote } from "@/lib/pricing"
import { useUiStore } from "@/lib/store/ui-store"
import { cn } from "@/lib/utils"
import type { Quote, QuoteStatus } from "@/types"
import { BelowMinimumAlert, QuoteSummary } from "./quote-summary"
import { decodeParty, encodeParty, nextQuoteNumber, paymentDescription, schedulePhases } from "./quote-utils"

const schema = z.object({
  party: z.string().min(1, "Selecione o cliente ou lead"),
  catalogItemId: z.string().min(1, "Selecione o tipo de projeto"),
  pages: z.number().int().min(0, "Número de páginas inválido").max(100, "Máximo de 100 páginas"),
  languages: z.number().int().min(1, "Informe ao menos 1 idioma").max(5, "Máximo de 5 idiomas"),
  addonIds: z.array(z.string()),
  express: z.boolean(),
  hostingPlanId: z.string(),
  payment: z.enum(["avista", "parcelado", "entrada"], { error: "Selecione a forma de pagamento" }),
  installments: z.number().int().min(1, "Parcelas inválidas"),
  manualDiscount: z.number().min(0, "Desconto inválido"),
  notes: z.string(),
})
type Values = z.infer<typeof schema>

const STEPS: { title: string; fields: FieldPath<Values>[] }[] = [
  { title: "Cliente", fields: ["party"] },
  { title: "Projeto", fields: ["catalogItemId"] },
  { title: "Escopo", fields: ["pages", "languages", "addonIds"] },
  { title: "Prazo", fields: ["express"] },
  { title: "Mensalidade", fields: ["hostingPlanId"] },
  { title: "Pagamento", fields: ["payment", "installments", "manualDiscount"] },
  { title: "Revisão", fields: [] },
]

interface QuoteWizardProps {
  quote?: Quote
  initial?: { leadId?: string; clientId?: string; dealId?: string }
}

export function QuoteWizard({ quote, initial }: QuoteWizardProps) {
  const router = useRouter()
  const add = useCrm((s) => s.add)
  const update = useCrm((s) => s.update)
  const logActivity = useCrm((s) => s.logActivity)
  const currentUserId = useCrm((s) => s.currentUserId)
  const openQuickCreate = useUiStore((s) => s.openQuickCreate)
  const catalog = useCatalog()
  const addons = useAddons()
  const plans = useHostingPlans()
  const rules = usePricingRules()
  const quotes = useQuotes()
  const leads = useLeads()
  const clients = useClients()
  const deals = useDeals()
  const { leadOptions, clientOptions } = useEntityOptions()

  const deal = deals.find((d) => d.id === (quote?.dealId ?? initial?.dealId))
  const [savedId, setSavedId] = useState<string | undefined>(quote?.id)
  const [status, setStatus] = useState<QuoteStatus>(quote?.status ?? "rascunho")
  const [step, setStep] = useState(0)
  const [mobileOpen, setMobileOpen] = useState(false)

  const defaultValues = useMemo<Values>(() => {
    if (quote) {
      return {
        party: encodeParty(quote),
        catalogItemId: quote.catalogItemId,
        pages: quote.pages,
        languages: quote.languages,
        addonIds: quote.addonIds,
        express: quote.express,
        hostingPlanId: quote.hostingPlanId ?? "",
        payment: quote.payment,
        installments: Math.min(quote.installments, rules.maxInstallments),
        manualDiscount: quote.manualDiscount,
        notes: quote.notes,
      }
    }
    const leadId = initial?.leadId ?? deal?.leadId
    const clientId = initial?.clientId ?? deal?.clientId
    const lead = leads.find((l) => l.id === leadId)
    const suggested = lead
      ? catalog.find((c) => c.active && c.projectType === lead.projectType)
      : undefined
    return {
      party: encodeParty({ leadId, clientId }),
      catalogItemId: suggested?.id ?? "",
      pages: suggested?.includedPages ?? 1,
      languages: 1,
      addonIds: [],
      express: false,
      hostingPlanId: plans.find((p) => p.monthly === suggested?.monthlyFee)?.id ?? plans[0]?.id ?? "",
      payment: "entrada",
      installments: Math.min(3, rules.maxInstallments),
      manualDiscount: 0,
      notes: "",
    }
    // valores iniciais calculados uma vez por montagem
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const { control, handleSubmit, trigger, setValue, formState } = useForm<Values>({ resolver: zodResolver(schema), defaultValues })
  const errors = formState.errors
  const values = useWatch({ control }) as Values

  const item = catalog.find((c) => c.id === values.catalogItemId)
  const plan = plans.find((p) => p.id === values.hostingPlanId)
  const calc = calculateQuote(
    {
      catalogItem: item,
      pages: values.pages ?? 0,
      languages: values.languages ?? 1,
      addonIds: values.addonIds ?? [],
      express: Boolean(values.express),
      hostingPlan: plan,
      payment: values.payment ?? "entrada",
      installments: values.installments ?? 1,
      manualDiscount: values.manualDiscount ?? 0,
    },
    addons,
    rules,
  )
  const normalDeadline = calculateQuote(
    { catalogItem: item, pages: values.pages ?? 0, languages: values.languages ?? 1, addonIds: values.addonIds ?? [], express: false, hostingPlan: plan, payment: "entrada", installments: 1, manualDiscount: 0 },
    addons,
    rules,
  ).deadlineDays

  const party = decodeParty(values.party ?? "")
  const partyClient = clients.find((c) => c.id === party.clientId)
  const partyLead = leads.find((l) => l.id === (party.leadId ?? partyClient?.leadId))
  const partyName = partyClient?.name ?? (partyLead ? `${partyLead.name}${partyLead.company ? ` — ${partyLead.company}` : ""}` : undefined)
  const partyPhone = partyClient?.whatsapp ?? partyLead?.whatsapp
  const isRecurring = item?.projectType === "anuncio"

  const goTo = async (target: number) => {
    if (target <= step) {
      setStep(target)
      return
    }
    const fields = STEPS.slice(0, target).flatMap((s) => s.fields)
    const ok = await trigger(fields)
    if (!ok) {
      const firstBad = STEPS.findIndex((s) => s.fields.some((f) => getFieldError(f)))
      if (firstBad >= 0) setStep(firstBad)
      toast.error("Revise os campos destacados")
      return
    }
    setStep(target)
  }
  const getFieldError = (f: FieldPath<Values>) => Boolean((formState.errors as Record<string, unknown>)[f])

  const persist = (data: Values, nextStatus: QuoteStatus): Quote => {
    const p = decodeParty(data.party)
    const client = clients.find((c) => c.id === p.clientId)
    const now = new Date().toISOString()
    const base = {
      leadId: p.leadId ?? client?.leadId,
      clientId: p.clientId,
      dealId: quote?.dealId ?? deal?.id,
      status: nextStatus,
      catalogItemId: data.catalogItemId,
      pages: data.pages,
      languages: data.languages,
      addonIds: data.addonIds,
      express: data.express,
      hostingPlanId: data.hostingPlanId || undefined,
      payment: data.payment,
      installments: calc.installments,
      manualDiscount: data.manualDiscount,
      subtotal: calc.subtotal,
      total: calc.total,
      monthlyFee: calc.monthlyFee,
      deadlineDays: calc.deadlineDays,
      notes: data.notes,
      sentAt: nextStatus === "enviado" ? now : quote?.sentAt,
    }
    const existing = savedId ? quotes.find((q) => q.id === savedId) : undefined
    let saved: Quote
    if (existing) {
      update("quotes", existing.id, base)
      saved = { ...existing, ...base }
    } else {
      saved = {
        ...base,
        id: newId("quo"),
        number: nextQuoteNumber(quotes),
        validUntil: addDays(new Date(), rules.quoteValidityDays).toISOString(),
        ownerId: currentUserId,
        createdAt: now,
      }
      add("quotes", saved)
      setSavedId(saved.id)
      logActivity({ type: "orcamento", title: `Orçamento ${saved.number} criado`, leadId: saved.leadId, dealId: saved.dealId, clientId: saved.clientId })
    }
    setStatus(nextStatus)
    return saved
  }

  const onInvalid = () => {
    const firstBad = STEPS.findIndex((s) => s.fields.some((f) => getFieldError(f)))
    if (firstBad >= 0) setStep(firstBad)
    toast.error("Revise os campos destacados")
  }

  const saveDraft = handleSubmit((data) => {
    const saved = persist(data, status === "rascunho" ? "rascunho" : status)
    toast.success(quote || savedId ? "Orçamento salvo" : `Orçamento ${saved.number} salvo como rascunho`)
    if (!quote) router.replace(`/orcamentos/${saved.id}`)
  }, onInvalid)

  const sendWhatsapp = handleSubmit((data) => {
    if (calc.belowMinimum) toast.warning("Atenção: total abaixo do preço mínimo configurado")
    const saved = persist(data, "enviado")
    const first = (partyLead?.name ?? partyClient?.contactName ?? "").split(" ")[0]
    const text = [
      `Olá${first ? `, ${first}` : ""}! Segue a proposta ${saved.number} da Track For:`,
      "",
      `Projeto: ${item?.name ?? ""}`,
      `Investimento: ${formatMoney(calc.total)} (${paymentDescription(data.payment, calc)})`,
      `Prazo: ${formatDays(calc.deadlineDays)}`,
      calc.monthlyFee ? `Mensalidade: ${formatMoney(calc.monthlyFee)}/mês` : "",
      `Validade: ${formatDate(saved.validUntil)}`,
    ]
      .filter(Boolean)
      .join("\n")
    if (partyPhone) openWhatsapp(whatsappLink(partyPhone, text))
    logActivity({ type: "orcamento", title: `Orçamento ${saved.number} enviado pelo WhatsApp`, leadId: saved.leadId, dealId: saved.dealId, clientId: saved.clientId })
    toast.success("Proposta enviada no WhatsApp", { description: partyPhone ?? "Contato sem WhatsApp cadastrado" })
    if (!quote) router.replace(`/orcamentos/${saved.id}`)
  }, onInvalid)

  const generatePdf = handleSubmit(async () => {
    try {
      const result = await generateQuotePdfAction({ number: quote?.number || "Rascunho", company: useCrm.getState().company.name, customer: partyName || "Cliente", project: item?.name || "Projeto", pages: values.pages || 0, languages: values.languages || 1, addons: addons.filter(addon => values.addonIds?.includes(addon.id)).map(addon => addon.name), total: calc.total, monthlyFee: calc.monthlyFee, deadline: calc.deadlineDays, payment: paymentDescription(values.payment || "entrada", calc), validUntil: quote ? formatDate(quote.validUntil) : `${rules.quoteValidityDays} dias`, notes: values.notes || "" })
      const bytes = Uint8Array.from(atob(result.base64), char => char.charCodeAt(0))
      const url = URL.createObjectURL(new Blob([bytes], { type: "application/pdf" }))
      const link = document.createElement("a"); link.href = url; link.download = `proposta-${quote?.number || "rascunho"}.pdf`; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000)
    } catch { toast.error("Não foi possível gerar o PDF. Tente novamente.") }
  }, onInvalid)

  const generateCharge = () => {
    if (!item) {
      toast.error("Escolha o tipo de projeto antes de gerar a cobrança")
      return
    }
    if (!partyClient) toast.info("Lead ainda não é cliente: selecione o cliente na cobrança")
    openQuickCreate("charge", {
      clientId: partyClient?.id,
      dealId: deal?.id,
      amount: String(calc.entryValue),
      description: `${values.payment === "entrada" ? "Entrada 50%" : values.payment === "avista" ? "Pagamento à vista" : "Parcela 1"} — ${item.name}`,
    })
  }

  const markStatus = (next: QuoteStatus) => {
    if (!savedId) return
    update("quotes", savedId, { status: next, viewedAt: next === "visualizado" ? new Date().toISOString() : undefined })
    setStatus(next)
    toast.success(`Orçamento marcado como ${QUOTE_STATUS_LABEL[next].toLowerCase()}`)
  }

  const summaryActions = (
    <>
      <Button type="button" onClick={sendWhatsapp}>
        <MessageCircle />
        Enviar no WhatsApp
      </Button>
      <div className="grid grid-cols-2 gap-2">
        <Button type="button" variant="outline" onClick={generatePdf}>
          <FileDown />
          Proposta PDF
        </Button>
        <Button type="button" variant="outline" onClick={generateCharge}>
          <Wallet />
          Cobrança
        </Button>
      </div>
      <Button type="button" variant="ghost" onClick={saveDraft} className="text-muted-foreground">
        <Save />
        Salvar {status === "rascunho" ? "rascunho" : "alterações"}
      </Button>
    </>
  )

  const currentNumber = savedId ? quotes.find((q) => q.id === savedId)?.number : undefined

  return (
    <div className="pb-28 lg:pb-0">
      <PageHeader
        backHref="/orcamentos"
        backLabel="Orçamentos"
        title={currentNumber ? `Orçamento ${currentNumber}` : "Novo orçamento"}
        description={deal ? `Vinculado ao negócio ${deal.title}` : "Monte a proposta e o preço recalcula em tempo real"}
        actions={
          savedId ? (
            <div className="flex items-center gap-2">
              <EnumBadge value={status} labels={QUOTE_STATUS_LABEL} tones={QUOTE_STATUS_TONE} />
              <OptionSelect
                value={status}
                onChange={markStatus}
                options={toOptions(QUOTE_STATUS_LABEL)}
                className="w-40"
              />
            </div>
          ) : undefined
        }
      />

      <Stepper step={step} onStep={goTo} />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <form
          onSubmit={(e) => {
            e.preventDefault()
            if (step < STEPS.length - 1) void goTo(step + 1)
          }}
          noValidate
          className="min-w-0 space-y-4"
        >
          <Panel title={`${step + 1}. ${STEP_TITLES[step]}`} description={STEP_HINTS[step]}>
            {step === 0 && (
              <FormField label="Cliente ou lead" required error={errors.party?.message}>
                <Controller
                  control={control}
                  name="party"
                  render={({ field }) => (
                    <EntityCombobox
                      options={[...clientOptions.map((o) => ({ ...o, value: `client:${o.value}` })), ...leadOptions.map((o) => ({ ...o, value: `lead:${o.value}` }))]}
                      value={field.value || undefined}
                      onChange={(v) => field.onChange(v ?? "")}
                      invalid={!!errors.party}
                      placeholder="Busque por nome ou empresa"
                      searchPlaceholder="Buscar cliente ou lead"
                    />
                  )}
                />
              </FormField>
            )}
            {step === 0 && partyName && (
              <div className="mt-4 grid gap-2 rounded-lg border bg-surface p-3 text-sm sm:grid-cols-2">
                <div>
                  <p className="text-xs text-muted-foreground">{partyClient ? "Cliente" : "Lead"}</p>
                  <p className="truncate">{partyName}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">WhatsApp</p>
                  <p className="num">{partyPhone ?? "—"}</p>
                </div>
                {partyLead && (
                  <div>
                    <p className="text-xs text-muted-foreground">Interesse</p>
                    <p>{PROJECT_TYPE_LABEL[partyLead.projectType]}</p>
                  </div>
                )}
              </div>
            )}

            {step === 1 && (
              <div className="space-y-2">
                {errors.catalogItemId && <p className="text-xs text-danger">{errors.catalogItemId.message}</p>}
                <div className="grid gap-3 sm:grid-cols-2">
                  {catalog
                    .filter((c) => c.active || c.id === values.catalogItemId)
                    .map((c) => {
                      const active = c.id === values.catalogItemId
                      return (
                        <button
                          type="button"
                          key={c.id}
                          onClick={() => {
                            setValue("catalogItemId", c.id, { shouldValidate: true })
                            setValue("pages", c.includedPages > 0 ? c.includedPages : 0)
                            const matching = plans.find((p) => p.monthly === c.monthlyFee)
                            setValue("hostingPlanId", matching?.id ?? plans[0]?.id ?? "")
                          }}
                          className={cn("flex flex-col gap-2 rounded-xl border bg-surface p-3 text-left transition-colors hover:border-[#80ace9]", active && "border-primary bg-brand-soft")}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <p className="font-medium">{c.name}</p>
                            {active && <Check className="size-4 shrink-0 text-primary" />}
                          </div>
                          <p className="text-xs text-muted-foreground">{c.description}</p>
                          <div className="mt-auto flex flex-wrap items-end justify-between gap-2 pt-1">
                            <div>
                              <p className={cn("num font-semibold", active && "text-primary")}>
                                {c.priceFrom && <span className="mr-1 text-[11px] font-normal text-muted-foreground">a partir de</span>}
                                {formatMoney(c.firstMonthPrice ?? c.basePrice)}
                                {c.firstMonthPrice && <span className="ml-1 text-[11px] font-normal text-muted-foreground">no 1º mês</span>}
                              </p>
                              {c.monthlyFee > 0 && <p className="num text-xs text-muted-foreground">+ {formatMoney(c.monthlyFee)}/mês</p>}
                            </div>
                            <span className="num text-xs text-muted-foreground">{c.deadlineDays ? formatDays(c.deadlineDays) : isRecurringType(c.projectType) ? "Recorrente" : "Prazo a combinar"}</span>
                          </div>
                        </button>
                      )
                    })}
                </div>
              </div>
            )}

            {step === 2 && (
              <div className="space-y-5">
                <div className="grid gap-4 sm:grid-cols-2">
                  {item && item.includedPages > 0 ? (
                    <FormField label="Número de páginas" error={errors.pages?.message} hint={`${item.includedPages} inclusa(s); extra ${formatMoney(rules.extraPagePrice)} cada`}>
                      <Controller control={control} name="pages" render={({ field }) => <Counter value={field.value} onChange={field.onChange} min={1} max={100} />} />
                    </FormField>
                  ) : (
                    <div className="rounded-lg border border-dashed p-3 text-xs text-muted-foreground">Escopo de telas definido no diagnóstico; ajuste com os adicionais abaixo.</div>
                  )}
                  <FormField label="Idiomas" error={errors.languages?.message} hint={`Cada idioma extra: +${rules.extraLanguagePercent}%`}>
                    <Controller control={control} name="languages" render={({ field }) => <Counter value={field.value} onChange={field.onChange} min={1} max={5} />} />
                  </FormField>
                </div>
                <div>
                  <p className="mb-2 text-xs text-muted-foreground">Adicionais</p>
                  <Controller
                    control={control}
                    name="addonIds"
                    render={({ field }) => (
                      <div className="grid gap-2 sm:grid-cols-2">
                        {addons
                          .filter((a) => a.active || field.value.includes(a.id))
                          .map((a) => {
                            const checked = field.value.includes(a.id)
                            return (
                              <label key={a.id} className={cn("flex cursor-pointer items-center gap-3 rounded-lg border bg-surface px-3 py-2.5 text-sm", checked && "border-primary/35 bg-brand-soft")}>
                                <Checkbox checked={checked} onCheckedChange={(v) => field.onChange(v ? [...field.value, a.id] : field.value.filter((id) => id !== a.id))} />
                                <span className="flex-1">{a.name}</span>
                                <span className="num text-xs text-muted-foreground">+ {formatMoney(a.price)}</span>
                              </label>
                            )
                          })}
                      </div>
                    )}
                  />
                </div>
              </div>
            )}

            {step === 3 && (
              <Controller
                control={control}
                name="express"
                render={({ field }) => (
                  <div className="grid gap-3 sm:grid-cols-2">
                    <ChoiceCard active={!field.value} onClick={() => field.onChange(false)} title="Prazo normal" subtitle="Sem acréscimo" value={formatDays(normalDeadline)} />
                    <ChoiceCard
                      active={field.value}
                      onClick={() => field.onChange(true)}
                      title="Expresso"
                      subtitle={`Acréscimo de ${rules.expressPercent}% no escopo`}
                      value={formatDays(Math.max(1, Math.ceil(normalDeadline * 0.6)))}
                      icon={<Zap className="size-4 text-primary" />}
                    />
                  </div>
                )}
              />
            )}

            {step === 4 &&
              (isRecurring ? (
                <div className="rounded-lg border bg-surface p-4 text-sm">
                  <p className="font-medium">Gestão de tráfego tem mensalidade própria</p>
                  <p className="num mt-1 text-primary">{formatMoney(item?.monthlyFee ?? 0)}/mês</p>
                  <p className="mt-1 text-xs text-muted-foreground">O primeiro mês sai por {formatMoney(item?.firstMonthPrice ?? 0)}; planos de hospedagem não se aplicam.</p>
                </div>
              ) : (
                <Controller
                  control={control}
                  name="hostingPlanId"
                  render={({ field }) => (
                    <div className="grid gap-3 sm:grid-cols-2">
                      {plans.map((p) => (
                        <ChoiceCard key={p.id} active={field.value === p.id} onClick={() => field.onChange(p.id)} title={p.name} subtitle={p.description} value={p.monthly ? `${formatMoney(p.monthly)}/mês` : "R$ 0,00"} />
                      ))}
                    </div>
                  )}
                />
              ))}

            {step === 5 && (
              <div className="space-y-5">
                <Controller
                  control={control}
                  name="payment"
                  render={({ field }) => (
                    <div className="grid gap-3 md:grid-cols-3">
                      <ChoiceCard active={field.value === "avista"} onClick={() => field.onChange("avista")} title="À vista" subtitle={`${rules.cashDiscountPercent}% de desconto`} value={formatMoney(calculateQuoteTotal("avista"))} />
                      {rules.maxInstallments > 1 && <ChoiceCard active={field.value === "parcelado"} onClick={() => field.onChange("parcelado")} title="Parcelado" subtitle={`Até ${rules.maxInstallments}x sem juros`} value={
                          field.value === "parcelado"
                            ? `${calc.installments}x de ${formatMoney(calc.installmentValue)}`
                            : `${rules.maxInstallments}x de ${formatMoney(calculateQuoteTotal("parcelado") / rules.maxInstallments)}`
                        }
                      />}
                      <ChoiceCard active={field.value === "entrada"} onClick={() => field.onChange("entrada")} title="Entrada + entrega" subtitle="50% agora, 50% na entrega" value={formatMoney(calculateQuoteTotal("entrada") / 2)} />
                    </div>
                  )}
                />
                <div className="grid gap-4 sm:grid-cols-2">
                  {values.payment === "parcelado" && rules.maxInstallments > 1 && (
                    <FormField label="Parcelas" error={errors.installments?.message} hint={`${calc.installments}x de ${formatMoney(calc.installmentValue)}`}>
                      <Controller
                        control={control}
                        name="installments"
                        render={({ field }) => (
                          <OptionSelect
                            value={String(field.value)}
                            onChange={(v) => field.onChange(Number(v))}
                            options={Array.from({ length: Math.max(0, rules.maxInstallments - 1) }, (_, i) => ({ value: String(i + 2), label: `${i + 2}x sem juros` }))}
                          />
                        )}
                      />
                    </FormField>
                  )}
                  <FormField label="Desconto manual" error={errors.manualDiscount?.message} hint="Abatido do total">
                    <Controller control={control} name="manualDiscount" render={({ field }) => <MoneyInput value={field.value} onChange={field.onChange} />} />
                  </FormField>
                </div>
                {calc.belowMinimum && <BelowMinimumAlert rules={rules} total={calc.total} />}
              </div>
            )}

            {step === 6 && (
              <Review
                itemName={item?.name}
                priceFrom={item?.priceFrom}
                calc={calc}
                values={values}
                addonNames={addons.filter((a) => values.addonIds?.includes(a.id)).map((a) => a.name)}
                planName={isRecurring ? "Gestão de tráfego" : plan?.name}
                partyName={partyName}
                rules={rules}
                notes={
                  <FormField label="Observações da proposta">
                    <Controller control={control} name="notes" render={({ field }) => <Textarea value={field.value} onChange={field.onChange} rows={3} placeholder="Condições especiais, entregáveis, etc." />} />
                  </FormField>
                }
              />
            )}
          </Panel>

          <div className="flex items-center justify-between gap-2">
            <Button type="button" variant="outline" onClick={() => setStep((s) => Math.max(0, s - 1))} disabled={step === 0}>
              <ChevronLeft />
              Voltar
            </Button>
            {step < STEPS.length - 1 ? (
              <Button type="submit">
                Próximo
                <ChevronRight />
              </Button>
            ) : (
              <Button type="button" onClick={sendWhatsapp}>
                <MessageCircle />
                Enviar no WhatsApp
              </Button>
            )}
          </div>
        </form>

        <aside className="hidden lg:block">
          <div className="sticky top-20">
            <QuoteSummary calc={calc} rules={rules} payment={values.payment ?? "entrada"} hasItem={!!item} priceFrom={item?.priceFrom} partyName={partyName} actions={summaryActions} />
          </div>
        </aside>
      </div>

      {/* Barra fixa no mobile com o total; expande para o resumo completo */}
      <div className="fixed inset-x-0 bottom-0 z-30 border-t bg-background lg:hidden">
        {mobileOpen && (
          <div className="max-h-[60dvh] overflow-y-auto p-4 pb-0">
            <QuoteSummary calc={calc} rules={rules} payment={values.payment ?? "entrada"} hasItem={!!item} priceFrom={item?.priceFrom} partyName={partyName} actions={summaryActions} />
          </div>
        )}
        <button type="button" onClick={() => setMobileOpen((o) => !o)} className="flex w-full items-center justify-between gap-3 px-4 py-3">
          <div className="text-left">
            <p className="text-xs text-muted-foreground">Total {calc.monthlyFee ? `+ ${formatMoney(calc.monthlyFee)}/mês` : ""}</p>
            <p className={cn("num text-lg font-semibold", calc.belowMinimum ? "text-danger" : "text-primary")}>{formatMoney(calc.total)}</p>
          </div>
          <span className="flex items-center gap-1 text-xs text-muted-foreground">
            {mobileOpen ? "Fechar resumo" : "Ver resumo"}
            <ChevronDown className={cn("size-4 transition-transform", !mobileOpen && "rotate-180")} />
          </span>
        </button>
      </div>
    </div>
  )

  function calculateQuoteTotal(payment: Values["payment"]) {
    return calculateQuote(
      { catalogItem: item, pages: values.pages ?? 0, languages: values.languages ?? 1, addonIds: values.addonIds ?? [], express: Boolean(values.express), hostingPlan: plan, payment, installments: 1, manualDiscount: values.manualDiscount ?? 0 },
      addons,
      rules,
    ).total
  }
}

const isRecurringType = (t: string) => t === "anuncio"

const STEP_TITLES = ["Cliente ou lead", "Tipo de projeto", "Escopo", "Prazo", "Mensalidade", "Pagamento", "Revisão"]
const STEP_HINTS = [
  "Para quem é esta proposta",
  "Escolha um item do catálogo",
  "Páginas, idiomas e adicionais",
  "Normal ou expresso",
  "Hospedagem e manutenção",
  "Condição de pagamento e descontos",
  "Confira tudo antes de enviar",
]

function Stepper({ step, onStep }: { step: number; onStep: (i: number) => void }) {
  return (
    <ol className="-mx-4 mb-6 flex gap-1 overflow-x-auto px-4 pb-1 md:mx-0 md:px-0">
      {STEPS.map((s, i) => {
        const done = i < step
        const active = i === step
        return (
          <li key={s.title} className="min-w-0 flex-1">
            <button
              type="button"
              onClick={() => onStep(i)}
              className={cn(
                "flex w-full min-w-24 flex-col gap-1.5 rounded-lg border bg-card px-2.5 py-2 text-left transition-colors hover:border-[#80ace9]",
                active && "border-primary",
                done && "border-primary/35",
              )}
            >
              <span className={cn("h-0.5 w-full rounded-full", active || done ? "bg-primary" : "bg-border")} />
              <span className="flex items-center gap-1.5 text-xs">
                <span className={cn("num flex size-4 shrink-0 items-center justify-center rounded-full border text-[10px]", active && "border-primary text-primary", done && "border-primary bg-primary text-primary-foreground")}>
                  {done ? <Check className="size-2.5" /> : i + 1}
                </span>
                <span className={cn("truncate", active ? "font-medium text-foreground" : "text-muted-foreground")}>{s.title}</span>
              </span>
            </button>
          </li>
        )
      })}
    </ol>
  )
}

function Counter({ value, onChange, min, max }: { value: number; onChange: (v: number) => void; min: number; max: number }) {
  return (
    <div className="flex items-center gap-2">
      <Button type="button" variant="outline" size="icon" onClick={() => onChange(Math.max(min, value - 1))} disabled={value <= min} aria-label="Diminuir">
        <Minus />
      </Button>
      <span className="num w-10 text-center text-lg font-semibold">{value}</span>
      <Button type="button" variant="outline" size="icon" onClick={() => onChange(Math.min(max, value + 1))} disabled={value >= max} aria-label="Aumentar">
        <Plus />
      </Button>
    </div>
  )
}

function ChoiceCard({ active, onClick, title, subtitle, value, icon }: { active: boolean; onClick: () => void; title: string; subtitle: string; value: string; icon?: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn("flex flex-col gap-1 rounded-xl border bg-surface p-3 text-left transition-colors hover:border-[#80ace9]", active && "border-primary bg-brand-soft")}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-1.5 font-medium">
          {icon}
          {title}
        </span>
        <span className={cn("flex size-4 items-center justify-center rounded-full border", active && "border-primary bg-primary")}>{active && <Check className="size-2.5 text-primary-foreground" />}</span>
      </div>
      <span className="text-xs text-muted-foreground">{subtitle}</span>
      <span className={cn("num mt-1 font-semibold", active && "text-primary")}>{value}</span>
    </button>
  )
}

function Review({
  itemName,
  priceFrom,
  calc,
  values,
  addonNames,
  planName,
  partyName,
  rules,
  notes,
}: {
  itemName?: string
  priceFrom?: boolean
  calc: ReturnType<typeof calculateQuote>
  values: Values
  addonNames: string[]
  planName?: string
  partyName?: string
  rules: ReturnType<typeof usePricingRules>
  notes: React.ReactNode
}) {
  const phases = schedulePhases(calc.deadlineDays)
  return (
    <div className="space-y-5">
      {calc.belowMinimum && <BelowMinimumAlert rules={rules} total={calc.total} />}
      <div className="grid gap-4 md:grid-cols-2">
        <ReviewBlock title="Escopo">
          <p className="font-medium">{itemName ?? "—"}</p>
          <p className="text-xs text-muted-foreground">Para {partyName ?? "—"}</p>
          <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
            {values.pages > 0 && <li>{values.pages} página(s)</li>}
            <li>{values.languages} idioma(s)</li>
            {addonNames.length ? addonNames.map((a) => <li key={a}>{a}</li>) : <li>Sem adicionais</li>}
            {values.express && <li className="text-primary">Prazo expresso</li>}
          </ul>
        </ReviewBlock>
        <ReviewBlock title="Investimento">
          <p className="num text-xl font-semibold text-primary">{formatMoney(calc.total)}</p>
          {priceFrom && <p className="text-xs text-muted-foreground">Valor inicial; o escopo final é confirmado no diagnóstico.</p>}
          <p className="mt-1 text-sm text-muted-foreground">{paymentDescription(values.payment, calc)}</p>
          {(calc.cashDiscount > 0 || calc.manualDiscount > 0) && (
            <p className="num mt-1 text-xs text-success">Descontos: {formatMoney(calc.cashDiscount + calc.manualDiscount)}</p>
          )}
        </ReviewBlock>
        <ReviewBlock title="Cronograma">
          <ol className="space-y-2">
            {phases.map((p, i) => (
              <li key={p.label} className="flex items-center gap-3 text-sm">
                <span className="num flex size-5 shrink-0 items-center justify-center rounded-full border text-[10px] text-muted-foreground">{i + 1}</span>
                <span className="flex-1">{p.label}</span>
                <span className="num text-xs text-muted-foreground">{formatDays(p.days)}</span>
              </li>
            ))}
          </ol>
          <p className="mt-3 border-t pt-2 text-sm">
            Total: <span className="num font-medium">{formatDays(calc.deadlineDays)}</span>
          </p>
        </ReviewBlock>
        <ReviewBlock title="Mensalidade">
          <p className="num text-xl font-semibold">{calc.monthlyFee ? `${formatMoney(calc.monthlyFee)}/mês` : "Sem mensalidade"}</p>
          <p className="text-sm text-muted-foreground">{planName ?? "—"}</p>
        </ReviewBlock>
      </div>
      {notes}
    </div>
  )
}

function ReviewBlock({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border bg-surface p-3">
      <p className="mb-2 text-xs font-medium tracking-wide text-muted-foreground uppercase">{title}</p>
      {children}
    </div>
  )
}
