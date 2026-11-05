"use client"

import { EVENT_TYPE_COLOR } from "@/lib/constants"
import { formatTime } from "@/lib/format"
import { cn } from "@/lib/utils"
import type { CalendarEvent } from "@/types"

/** Chip compacto de evento (visão mês). */
export function EventChip({ event, onClick, className }: { event: CalendarEvent; onClick: (e: CalendarEvent) => void; className?: string }) {
  return (
    <button
      type="button"
      onClick={(ev) => {
        ev.stopPropagation()
        onClick(event)
      }}
      className={cn("flex w-full min-w-0 items-center gap-1.5 rounded-md border bg-surface px-1.5 py-0.5 text-left text-[11px] hover:border-[#3a3a3a]", className)}
      title={event.google ? `Google Agenda · ${event.title}` : event.title}
    >
      <span className="size-1.5 shrink-0 rounded-full" style={{ backgroundColor: EVENT_TYPE_COLOR[event.type] }} />
      <span className="num shrink-0 text-muted-foreground">{event.allDay ? "Dia inteiro" : formatTime(event.start)}</span>
      <span className="truncate">{event.title}</span>
    </button>
  )
}

export function EventDot({ event }: { event: CalendarEvent }) {
  return <span className="size-1.5 rounded-full" style={{ backgroundColor: EVENT_TYPE_COLOR[event.type] }} />
}
