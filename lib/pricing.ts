import { installmentLimit } from "@/lib/finance/payment-options"
import type { CatalogItem, HostingPlan, PaymentCondition, PricingAddon, PricingRules } from "@/types"

export interface QuoteInput {
  catalogItem: CatalogItem | undefined
  pages: number
  languages: number
  addonIds: string[]
  express: boolean
  hostingPlan: HostingPlan | undefined
  payment: PaymentCondition
  installments: number
  manualDiscount: number
}

export interface QuoteLine {
  label: string
  value: number
  muted?: boolean
}

export interface QuoteCalculation {
  base: number
  extraPages: number
  extraPagesValue: number
  languagesValue: number
  addonsValue: number
  scopeSubtotal: number
  expressValue: number
  subtotal: number
  cashDiscount: number
  manualDiscount: number
  total: number
  monthlyFee: number
  deadlineDays: number
  installments: number
  installmentValue: number
  entryValue: number
  belowMinimum: boolean
  lines: QuoteLine[]
}

const round = (v: number) => Math.round(v * 100) / 100

/** Regra única de precificação, usada no formulário de orçamento e no mock. */
export function calculateQuote(input: QuoteInput, addons: PricingAddon[], rules: PricingRules): QuoteCalculation {
  const item = input.catalogItem
  const base = item ? (item.firstMonthPrice ?? item.basePrice) : 0
  const extraPages = item && item.includedPages > 0 ? Math.max(0, input.pages - item.includedPages) : 0
  const extraPagesValue = extraPages * rules.extraPagePrice
  const extraLanguages = Math.max(0, input.languages - 1)
  const languagesValue = round((base + extraPagesValue) * (rules.extraLanguagePercent / 100) * extraLanguages)
  const selectedAddons = addons.filter((a) => input.addonIds.includes(a.id))
  const addonsValue = selectedAddons.reduce((s, a) => s + a.price, 0)
  const scopeSubtotal = base + extraPagesValue + languagesValue + addonsValue
  const expressValue = input.express ? round(scopeSubtotal * (rules.expressPercent / 100)) : 0
  const subtotal = scopeSubtotal + expressValue
  const cashDiscount = input.payment === "avista" ? round(subtotal * (rules.cashDiscountPercent / 100)) : 0
  const manualDiscount = Math.max(0, input.manualDiscount || 0)
  const total = Math.max(0, round(subtotal - cashDiscount - manualDiscount))

  const isRecurring = item?.projectType === "anuncio"
  const monthlyFee = isRecurring ? (item?.monthlyFee ?? 0) : (input.hostingPlan?.monthly ?? item?.monthlyFee ?? 0)

  const baseDeadline = item?.deadlineDays ?? 30 + selectedAddons.length * 5
  const rawDeadline = baseDeadline + extraPages + extraLanguages * 2
  const deadlineDays = input.express ? Math.max(1, Math.ceil(rawDeadline * 0.6)) : rawDeadline

  const installments =
    input.payment === "parcelado" ? Math.min(Math.max(1, input.installments), installmentLimit(rules.maxInstallments)) : input.payment === "entrada" ? 2 : 1
  const installmentValue = round(total / installments)
  const entryValue = input.payment === "entrada" ? round(total / 2) : input.payment === "avista" ? total : installmentValue

  const lines: QuoteLine[] = []
  if (item) lines.push({ label: item.firstMonthPrice ? `${item.name} (1º mês)` : item.name, value: base })
  if (extraPagesValue) lines.push({ label: `${extraPages} página(s) extra(s)`, value: extraPagesValue })
  if (languagesValue) lines.push({ label: `${extraLanguages} idioma(s) adicional(is)`, value: languagesValue })
  for (const a of selectedAddons) lines.push({ label: a.name, value: a.price })
  if (expressValue) lines.push({ label: `Prazo expresso (+${rules.expressPercent}%)`, value: expressValue })
  if (cashDiscount) lines.push({ label: `Desconto à vista (${rules.cashDiscountPercent}%)`, value: -cashDiscount })
  if (manualDiscount) lines.push({ label: "Desconto manual", value: -manualDiscount })

  return {
    base,
    extraPages,
    extraPagesValue,
    languagesValue,
    addonsValue,
    scopeSubtotal,
    expressValue,
    subtotal,
    cashDiscount,
    manualDiscount,
    total,
    monthlyFee,
    deadlineDays,
    installments,
    installmentValue,
    entryValue,
    belowMinimum: Boolean(item) && total < rules.minPrice,
    lines,
  }
}
