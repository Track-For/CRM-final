"use client"

import { addDays, endOfMonth, endOfWeek, format, isSameDay, isSameMonth, isToday, startOfMonth, startOfWeek } from "date-fns"
import { ptBR } from "date-fns/locale"
import { Plus } from "lucide-react"
import { Button } from "@/components/ui/button"
import { EmptyState } from "@/components/shared/empty-state"
import { EventChip, EventDot } from "@/components/agenda/event-chip"
import { EventRow } from "@/components/agenda/list-view"
import { eventsOnDay } from "@/components/agenda/utils"
import { formatDateLong } from "@/lib/format"
import { cn } from "@/lib/utils"
import type { CalendarEvent } from "@/types"

const WEEKDAYS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"]

interface MonthViewProps {
  cursor: Date
  events: CalendarEvent[]
  selectedDay: Date
  onSelectDay: (day: Date) => void
  onCreate: (date: Date) => void
  onOpen: (event: CalendarEvent) => void
}

export function MonthView({ cursor, events, selectedDay, onSelectDay, onCreate, onOpen }: MonthViewProps) {
  const start = startOfWeek(startOfMonth(cursor), { weekStartsOn: 0 })
  const end = endOfWeek(endOfMonth(cursor), { weekStartsOn: 0 })
  const days: Date[] = []
  for (let d = start; d <= end; d = addDays(d, 1)) days.push(d)
  const selectedEvents = eventsOnDay(events, selectedDay)

  const handleDayClick = (day: Date) => {
    onSelectDay(day)
    if (window.matchMedia("(min-width: 768px)").matches) {
      const d = new Date(day)
      d.setHours(10, 0, 0, 0)
      onCreate(d)
    }
  }

  return (
    <div className="space-y-4">
      <div className="overflow-hidden rounded-xl border bg-card">
        <div className="grid grid-cols-7 border-b">
          {WEEKDAYS.map((w) => (
            <div key={w} className="px-2 py-2 text-center text-[11px] font-medium text-muted-foreground md:text-left">
              {w}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7">
          {days.map((day) => {
            const list = eventsOnDay(events, day)
            const inMonth = isSameMonth(day, cursor)
            const selected = isSameDay(day, selectedDay)
            return (
              <div
                key={day.toISOString()}
                role="button"
                tabIndex={0}
                onClick={() => handleDayClick(day)}
                onKeyDown={(e) => e.key === "Enter" && handleDayClick(day)}
                className={cn(
                  "group relative flex min-h-14 cursor-pointer flex-col gap-1 border-r border-b p-1 transition-colors last:border-r-0 hover:bg-accent md:min-h-28 md:p-1.5 [&:nth-child(7n)]:border-r-0",
                  !inMonth && "bg-background text-muted-foreground",
                  selected && "max-md:bg-accent",
                )}
              >
                <div className="flex items-center justify-between">
                  <span
                    className={cn(
                      "num flex size-6 items-center justify-center rounded-md text-xs",
                      isToday(day) && "bg-primary font-semibold text-primary-foreground",
                      selected && !isToday(day) && "max-md:border max-md:border-primary max-md:text-primary",
                    )}
                  >
                    {format(day, "d")}
                  </span>
                  <Plus className="hidden size-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 md:block" />
                </div>
                <div className="hidden min-w-0 flex-col gap-1 md:flex">
                  {list.slice(0, 3).map((e) => (
                    <EventChip key={e.id} event={e} onClick={onOpen} />
                  ))}
                  {list.length > 3 && (
                    <button
                      type="button"
                      className="px-1 text-left text-[11px] text-muted-foreground hover:text-foreground"
                      onClick={(ev) => {
                        ev.stopPropagation()
                        onSelectDay(day)
                      }}
                    >
                      +{list.length - 3} mais
                    </button>
                  )}
                </div>
                {list.length > 0 && (
                  <div className="flex flex-wrap justify-center gap-0.5 md:hidden">
                    {list.slice(0, 4).map((e) => (
                      <EventDot key={e.id} event={e} />
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-sm font-semibold capitalize">{formatDateLong(selectedDay)}</h3>
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              const d = new Date(selectedDay)
              d.setHours(10, 0, 0, 0)
              onCreate(d)
            }}
          >
            <Plus />
            Novo evento
          </Button>
        </div>
        {selectedEvents.length === 0 ? (
          <EmptyState compact title="Nenhum compromisso neste dia" description={`Dia ${format(selectedDay, "dd 'de' MMMM", { locale: ptBR })} livre.`} />
        ) : (
          <div className="overflow-hidden rounded-xl border bg-card">
            {selectedEvents.map((e) => (
              <EventRow key={e.id} event={e} onOpen={onOpen} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
