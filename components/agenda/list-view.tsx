"use client"

import { format, isToday, parseISO, startOfDay } from "date-fns"
import { CalendarDays, Video } from "lucide-react"
import { EmptyState } from "@/components/shared/empty-state"
import { StatusBadge } from "@/components/shared/status-badge"
import { UserAvatar } from "@/components/shared/user-avatar"
import { durationLabel } from "@/components/agenda/utils"
import { EVENT_TYPE_COLOR, EVENT_TYPE_LABEL, EVENT_TYPE_TONE } from "@/lib/constants"
import { formatDateLong, formatTime } from "@/lib/format"
import type { CalendarEvent } from "@/types"

export function EventRow({ event, onOpen }: { event: CalendarEvent; onOpen: (e: CalendarEvent) => void }) {
  return (
    <button type="button" onClick={() => onOpen(event)} className="flex w-full items-center gap-3 border-b px-3 py-2.5 text-left last:border-0 hover:bg-accent">
      <span className="h-9 w-0.5 shrink-0 rounded-full" style={{ backgroundColor: EVENT_TYPE_COLOR[event.type] }} />
      <div className="w-14 shrink-0">
        <p className="num text-sm">{event.allDay ? "Dia inteiro" : formatTime(event.start)}</p>
        <p className="num text-[11px] text-muted-foreground">{durationLabel(event)}</p>
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{event.title}</p>
        <div className="mt-0.5 flex items-center gap-2">
          <StatusBadge tone={EVENT_TYPE_TONE[event.type]}>{EVENT_TYPE_LABEL[event.type]}</StatusBadge>
          {event.meetingUrl && <Video className="size-3.5 text-muted-foreground" aria-label="Com link de reunião" />}
        </div>
      </div>
      <UserAvatar userId={event.ownerId} className="hidden sm:inline-flex" showName />
    </button>
  )
}

export function ListView({ events, onOpen }: { events: CalendarEvent[]; onOpen: (e: CalendarEvent) => void }) {
  if (events.length === 0) return <EmptyState icon={CalendarDays} title="Nenhum compromisso no período" description="Ajuste os filtros ou crie um novo evento." />
  const groups = new Map<string, CalendarEvent[]>()
  for (const e of [...events].sort((a, b) => a.start.localeCompare(b.start))) {
    const key = format(startOfDay(parseISO(e.start)), "yyyy-MM-dd")
    groups.set(key, [...(groups.get(key) ?? []), e])
  }
  return (
    <div className="space-y-4">
      {[...groups.entries()].map(([key, list]) => {
        const day = parseISO(key)
        return (
          <div key={key} className="space-y-2">
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-semibold capitalize">{formatDateLong(day)}</h3>
              {isToday(day) && <StatusBadge tone="brand">Hoje</StatusBadge>}
              <span className="num text-xs text-muted-foreground">{list.length}</span>
            </div>
            <div className="overflow-hidden rounded-xl border bg-card">
              {list.map((e) => (
                <EventRow key={e.id} event={e} onOpen={onOpen} />
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}
