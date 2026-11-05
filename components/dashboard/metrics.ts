/**
 * Métricas derivadas usadas pelo Dashboard e pelos Relatórios.
 * Funções puras sobre as coleções; quando a API existir podem virar
 * endpoints agregados (GET /api/metrics/...).
 */
import { differenceInCalendarDays, endOfMonth, startOfMonth } from "date-fns"
import type { Charge, Deal, Lead, StageKey, Subscription } from "@/types"
import { STAGE_ORDER } from "@/lib/constants"
import { inRange } from "@/lib/period"
import { sum } from "@/lib/data/selectors"

export interface Range {
  from: Date
  to: Date
}

export const OPEN_FUNNEL: StageKey[] = STAGE_ORDER.filter((s) => s !== "perdido")

/** Maior etapa (índice) que o negócio alcançou, ignorando "perdido". */
export function reachedIndex(deal: Deal): number {
  const indexes = deal.history.map((h) => (h.toStage && h.toStage !== "perdido" ? STAGE_ORDER.indexOf(h.toStage) : 0))
  if (deal.stage !== "perdido") indexes.push(STAGE_ORDER.indexOf(deal.stage))
  return Math.max(0, ...indexes)
}

/** Quantos negócios chegaram em cada etapa e conversão em relação à etapa anterior. */
export function funnel(deals: Deal[]) {
  const reached = deals.map(reachedIndex)
  return OPEN_FUNNEL.map((stage, i) => {
    const count = reached.filter((r) => r >= i).length
    const prev = i === 0 ? count : reached.filter((r) => r >= i - 1).length
    return { stage, count, conversion: prev ? count / prev : 0 }
  })
}

export function wonIn(deals: Deal[], r: Range) {
  return deals.filter((d) => d.stage === "ganho" && inRange(d.wonAt, r.from, r.to))
}

export function lostIn(deals: Deal[], r: Range) {
  return deals.filter((d) => d.stage === "perdido" && inRange(d.lostAt, r.from, r.to))
}

export function leadsIn(leads: Lead[], r: Range) {
  return leads.filter((l) => inRange(l.createdAt, r.from, r.to))
}

/** MRR ativo em uma data (considera início e cancelamento). */
export function mrrAt(subs: Subscription[], date: Date) {
  const t = date.getTime()
  return sum(
    subs.filter((s) => new Date(s.startDate).getTime() <= t && (!s.canceledAt || new Date(s.canceledAt).getTime() > t) && s.status !== "pausada"),
    (s) => s.amount,
  )
}

export function churnIn(subs: Subscription[], r: Range) {
  return subs.filter((s) => inRange(s.canceledAt, r.from, r.to))
}

export function avgCloseDays(deals: Deal[]) {
  const won = deals.filter((d) => d.wonAt)
  if (!won.length) return null
  return Math.round(sum(won, (d) => Math.max(0, differenceInCalendarDays(new Date(d.wonAt!), new Date(d.createdAt)))) / won.length)
}

export interface Kpis {
  leads: number
  conversion: number
  sales: number
  ticket: number
  mrr: number
  receivable: number
  overdue: number
  overdueRate: number
}

export function computeKpis(r: Range, data: { leads: Lead[]; deals: Deal[]; subscriptions: Subscription[]; charges: Charge[] }, now = new Date()): Kpis {
  const leads = leadsIn(data.leads, r).length
  const won = wonIn(data.deals, r)
  const sales = sum(won, (d) => d.value)
  const ref = r.to.getTime() < now.getTime() ? r.to : now
  const monthFrom = startOfMonth(ref)
  const monthTo = endOfMonth(ref)
  const receivable = sum(
    data.charges.filter((c) => (c.status === "pendente" || c.status === "vencido") && inRange(c.dueDate, monthFrom, monthTo)),
    (c) => c.amount,
  )
  const dueInRange = data.charges.filter((c) => c.status !== "cancelado" && inRange(c.dueDate, r.from, r.to) && new Date(c.dueDate) <= now)
  const overdue = sum(dueInRange.filter((c) => c.status === "vencido"), (c) => c.amount)
  const dueTotal = sum(dueInRange, (c) => c.amount)
  return {
    leads,
    conversion: leads ? won.length / leads : 0,
    sales,
    ticket: won.length ? sales / won.length : 0,
    mrr: mrrAt(data.subscriptions, ref),
    receivable,
    overdue,
    overdueRate: dueTotal ? overdue / dueTotal : 0,
  }
}
