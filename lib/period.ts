import {
  differenceInCalendarDays,
  endOfDay,
  endOfMonth,
  endOfYear,
  startOfDay,
  startOfMonth,
  startOfQuarter,
  startOfYear,
  subDays,
  subMonths,
  subYears,
} from "date-fns"

export type PeriodPreset = "hoje" | "7d" | "30d" | "mes" | "mes_anterior" | "trimestre" | "ano"

export const PERIOD_LABEL: Record<PeriodPreset, string> = {
  hoje: "Hoje",
  "7d": "Últimos 7 dias",
  "30d": "Últimos 30 dias",
  mes: "Este mês",
  mes_anterior: "Mês anterior",
  trimestre: "Este trimestre",
  ano: "Este ano",
}

export interface PeriodRange {
  from: Date
  to: Date
  previousFrom: Date
  previousTo: Date
  label: string
}

export function getPeriodRange(preset: PeriodPreset, now: Date = new Date()): PeriodRange {
  let from: Date
  let to: Date = endOfDay(now)
  switch (preset) {
    case "hoje":
      from = startOfDay(now)
      break
    case "7d":
      from = startOfDay(subDays(now, 6))
      break
    case "30d":
      from = startOfDay(subDays(now, 29))
      break
    case "mes":
      from = startOfMonth(now)
      to = endOfMonth(now)
      break
    case "mes_anterior":
      from = startOfMonth(subMonths(now, 1))
      to = endOfMonth(subMonths(now, 1))
      break
    case "trimestre":
      from = startOfQuarter(now)
      break
    case "ano":
      from = startOfYear(now)
      to = endOfYear(now)
      break
  }
  let previousFrom: Date
  let previousTo: Date
  if (preset === "mes" || preset === "mes_anterior") {
    previousFrom = startOfMonth(subMonths(from, 1))
    previousTo = endOfMonth(subMonths(from, 1))
  } else if (preset === "ano") {
    previousFrom = startOfYear(subYears(from, 1))
    previousTo = endOfYear(subYears(from, 1))
  } else {
    const span = differenceInCalendarDays(to, from) + 1
    previousTo = endOfDay(subDays(from, 1))
    previousFrom = startOfDay(subDays(from, span))
  }
  return { from, to, previousFrom, previousTo, label: PERIOD_LABEL[preset] }
}

export function inRange(value: string | undefined | null, from: Date, to: Date): boolean {
  if (!value) return false
  const t = new Date(value).getTime()
  return t >= from.getTime() && t <= to.getTime()
}

/** Variação relativa entre período atual e anterior (fração). */
export function delta(current: number, previous: number): number | null {
  if (!previous) return current ? null : 0
  return (current - previous) / Math.abs(previous)
}
