import { differenceInMinutes, parseISO, startOfDay, endOfDay } from "date-fns"
import type { CalendarEvent } from "@/types"

export type AgendaView = "mes" | "semana" | "dia" | "lista"

export const HOUR_START = 0
export const HOUR_END = 24
export const HOUR_HEIGHT = 52

export function eventsOnDay(events: CalendarEvent[], day: Date) {
  return events.filter((e) => (parseISO(e.start) <= endOfDay(day) && parseISO(e.end) > startOfDay(day))).sort((a, b) => a.start.localeCompare(b.start))
}

export interface PositionedEvent {
  event: CalendarEvent
  top: number
  height: number
  lane: number
  lanes: number
}

/** Posiciona eventos de um dia na grade horária, separando sobreposições em faixas. */
export function layoutDay(events: CalendarEvent[], day?: Date): PositionedEvent[] {
  const sorted = [...events].sort((a, b) => a.start.localeCompare(b.start))
  const laneEnds: number[] = []
  const placed: { event: CalendarEvent; start: number; end: number; lane: number }[] = []
  for (const event of sorted) {
    const s = parseISO(event.start)
    const origin = day ? startOfDay(day) : startOfDay(s)
    const start = Math.max(0, differenceInMinutes(s, origin))
    const end = Math.min(1440, Math.max(start + 20, differenceInMinutes(parseISO(event.end), origin)))
    let lane = laneEnds.findIndex((le) => le <= start)
    if (lane === -1) {
      lane = laneEnds.length
      laneEnds.push(end)
    } else laneEnds[lane] = end
    placed.push({ event, start, end, lane })
  }
  return placed.map((p) => {
    const overlapping = placed.filter((o) => o.start < p.end && o.end > p.start)
    const lanes = Math.max(...overlapping.map((o) => o.lane)) + 1
    const minFromTop = Math.max(0, p.start - HOUR_START * 60)
    return {
      event: p.event,
      top: (minFromTop / 60) * HOUR_HEIGHT,
      height: Math.max(22, ((p.end - p.start) / 60) * HOUR_HEIGHT - 2),
      lane: p.lane,
      lanes,
    }
  })
}

export function durationLabel(event: CalendarEvent) {
  if (event.allDay) return "Dia inteiro"
  const min = differenceInMinutes(parseISO(event.end), parseISO(event.start))
  if (min < 60) return `${min} min`
  const h = Math.floor(min / 60)
  const m = min % 60
  return m ? `${h}h${String(m).padStart(2, "0")}` : `${h}h`
}

export function reminderLabel(minutes?: number) {
  if (!minutes) return "Sem lembrete"
  if (minutes >= 1440) return `${Math.round(minutes / 1440)} dia(s) antes`
  if (minutes >= 60) return `${Math.round(minutes / 60)} hora(s) antes`
  return `${minutes} min antes`
}
