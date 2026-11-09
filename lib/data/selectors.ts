/**
 * Cálculos derivados puros, compartilhados entre Dashboard, Vendas, Funil,
 * Financeiro e Relatórios. Quando a API existir, vários destes podem virar
 * endpoints agregados (ex.: GET /api/metrics/mrr).
 */
import { addMonths, differenceInCalendarMonths, endOfMonth, format, startOfMonth, subMonths } from "date-fns"
import { ptBR } from "date-fns/locale"
import type { Charge, Deal, EntryStatus, EntryType, FinancialEntry, Subscription } from "@/types"
import { STALE_DEAL_DAYS } from "@/lib/constants"
import { daysSince } from "@/lib/format"
import { inRange } from "@/lib/period"
import { paymentStatus } from "@/lib/finance/payment-status"
import { recurringRevenueAt } from "@/lib/finance/recurring"

export const isOpenDeal = (d: Deal) => d.stage !== "ganho" && d.stage !== "perdido"

export const dealIdleDays = (d: Deal) => daysSince(d.stageChangedAt)

export const isStaleDeal = (d: Deal) => isOpenDeal(d) && dealIdleDays(d) > STALE_DEAL_DAYS

export { weightedProject as weightedValue } from "./deal-forecast"

export function mrr(subscriptions: Subscription[]): number {
  return recurringRevenueAt(subscriptions, new Date())
}

export function sum<T>(list: T[], pick: (item: T) => number): number {
  return list.reduce((s, item) => s + pick(item), 0)
}

export function overdueCharges(charges: Charge[]): Charge[] {
  return charges.filter((c) => paymentStatus(c) === "vencido")
}

export interface MonthBucket {
  key: string
  label: string
  from: Date
  to: Date
}

/** Meses de `start` (offset negativo) até `end` em relação a hoje. */
export function monthBuckets(startOffset: number, endOffset = 0, now = new Date()): MonthBucket[] {
  const out: MonthBucket[] = []
  for (let i = startOffset; i <= endOffset; i++) {
    const ref = i < 0 ? subMonths(now, -i) : addMonths(now, i)
    const from = startOfMonth(ref)
    out.push({ key: format(from, "yyyy-MM"), label: format(from, "MMM/yy", { locale: ptBR }), from, to: endOfMonth(ref) })
  }
  return out
}

/** Recebido pela data de pagamento x previsto pelo vencimento. */
export function revenueByMonth(entries: FinancialEntry[], buckets: MonthBucket[]) {
  return buckets.map((b) => {
    const visible = entries.filter(e => e.type === "receita" && !e.deletedAt && !e.conversionReverted && !e.awaitingProjectPayment)
    const monthEntries = visible.filter(e => inRange(e.dueDate, b.from, b.to))
    return {
      month: b.label,
      realizado: sumAmount(visible.filter(e => e.status === "pago" && inRange(e.paidAt, b.from, b.to))),
      previsto: sum(monthEntries, (e) => e.amount),
    }
  })
}

/* ------------------------------------------------------------------ */
/* Entradas e saídas                                                   */
/*                                                                     */
/* Regra única, usada pelo dashboard e pela tela de entradas e saídas: */
/* - pago conta na data do pagamento; em aberto, no vencimento;        */
/* - vencido é tudo em aberto com vencimento antes de hoje, mesmo que  */
/*   o status gravado ainda diga "pendente";                           */
/* - vencido é acumulado até o fim do período, para dívida antiga não  */
/*   sumir ao trocar o período.                                        */
/* ------------------------------------------------------------------ */

type PeriodBounds = { from: Date; to: Date }

/** Soma em centavos, para não aparecer -R$ 0,00 por ruído de ponto flutuante. */
export function sumAmount(entries: FinancialEntry[]): number {
  return entries.reduce((total, e) => total + Math.round(e.amount * 100), 0) / 100
}

const subtractMoney = (a: number, b: number) => (Math.round(a * 100) - Math.round(b * 100)) / 100

export const isEntryOverdue = (e: FinancialEntry, now = new Date()) =>
  paymentStatus(e, now) === "vencido"

export const entryStatusNow = (e: FinancialEntry, now = new Date()): EntryStatus => (isEntryOverdue(e, now) ? "vencido" : e.status)

/** Data em que o lançamento conta no caixa. */
export const entryCashDate = (e: FinancialEntry) => (e.status === "pago" ? e.paidAt || "" : e.dueDate || e.competenceDate)

export type EntryView = "todos" | "receita" | "despesa" | "a_receber" | "a_pagar" | "vencidos"

export function entriesForView(entries: FinancialEntry[], view: EntryView, range: PeriodBounds, now = new Date()): FinancialEntry[] {
  const inPeriod = (e: FinancialEntry) => inRange(entryCashDate(e), range.from, range.to)
  const isOpen = (e: FinancialEntry) => e.status !== "pago" && !isEntryOverdue(e, now)
  return entries.filter((e) => {
    switch (view) {
      case "todos":
        return inPeriod(e)
      case "receita":
      case "despesa":
        return e.type === view && inPeriod(e)
      case "a_receber":
        return e.type === "receita" && isOpen(e) && inPeriod(e)
      case "a_pagar":
        return e.type === "despesa" && isOpen(e) && inPeriod(e)
      case "vencidos":
        return isEntryOverdue(e, now) && new Date(e.dueDate).getTime() <= range.to.getTime()
    }
  })
}

/** Totais de uma lista já filtrada. */
export function entryTotals(entries: FinancialEntry[]) {
  const entradas = sumAmount(entries.filter((e) => e.type === "receita"))
  const saidas = sumAmount(entries.filter((e) => e.type === "despesa"))
  return { entradas, saidas, resultado: subtractMoney(entradas, saidas) }
}

export function financeSummary(entries: FinancialEntry[], range: PeriodBounds, now = new Date()) {
  const inPeriod = entriesForView(entries, "todos", range, now)
  const paid = entryTotals(inPeriod.filter((e) => e.status === "pago"))
  const overdue = entriesForView(entries, "vencidos", range, now)
  const overdueIn = overdue.filter((e) => e.type === "receita")
  const overdueOut = overdue.filter((e) => e.type === "despesa")
  const toReceive = entriesForView(entries, "a_receber", range, now)
  const toPay = entriesForView(entries, "a_pagar", range, now)
  return {
    saldo: paid.resultado,
    entradasRecebidas: paid.entradas,
    saidasPagas: paid.saidas,
    resultadoPrevisto: entryTotals(inPeriod).resultado,
    aReceber: sumAmount(toReceive),
    aReceberCount: toReceive.length,
    aPagar: sumAmount(toPay),
    aPagarCount: toPay.length,
    vencidoReceber: sumAmount(overdueIn),
    vencidoReceberCount: overdueIn.length,
    vencidoPagar: sumAmount(overdueOut),
    vencidoPagarCount: overdueOut.length,
  }
}

/** Meses que cobrem o período, com um mínimo de meses para o gráfico ter contexto. */
export function periodMonthBuckets(range: PeriodBounds, minMonths = 6): MonthBucket[] {
  const months = Math.max(minMonths, differenceInCalendarMonths(range.to, range.from) + 1)
  return monthBuckets(-(months - 1), 0, range.to)
}

/** Fluxo mensal. O saldo acumulado parte de todo o histórico pago e para no mês atual. */
export function cashFlowMonthly(entries: FinancialEntry[], buckets: MonthBucket[], now = new Date()) {
  const paid = entries.filter((e) => e.status === "pago")
  return buckets.map((b) => {
    const month = entries.filter((e) => inRange(entryCashDate(e), b.from, b.to))
    const paidInMonth = entryTotals(month.filter((e) => e.status === "pago"))
    const openInMonth = entryTotals(month.filter((e) => e.status !== "pago"))
    const paidUntil = paid.filter((e) => new Date(entryCashDate(e)).getTime() <= b.to.getTime())
    return {
      month: b.label,
      entradasPagas: paidInMonth.entradas,
      entradasAbertas: openInMonth.entradas,
      saidasPagas: paidInMonth.saidas,
      saidasAbertas: openInMonth.saidas,
      saldo: b.from.getTime() > now.getTime() ? null : entryTotals(paidUntil).resultado,
    }
  })
}

export function entriesByCategory(entries: FinancialEntry[], type: EntryType) {
  const list = entries.filter((e) => e.type === type)
  const total = sumAmount(list)
  return [...new Set(list.map((e) => e.categoryId))]
    .map((categoryId) => {
      const value = sumAmount(list.filter((e) => e.categoryId === categoryId))
      return { categoryId, value, share: total ? value / total : 0 }
    })
    .sort((a, b) => b.value - a.value)
}

/** Em aberto e ainda no prazo, do mais próximo ao mais distante. Olha para a frente, sem depender do período. */
export function upcomingEntries(entries: FinancialEntry[], now = new Date()): FinancialEntry[] {
  return entries.filter((e) => e.status !== "pago" && !isEntryOverdue(e, now)).sort((a, b) => a.dueDate.localeCompare(b.dueDate))
}
