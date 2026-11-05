"use client"

import { useEffect, useRef } from "react"
import { format, isToday } from "date-fns"
import { ptBR } from "date-fns/locale"
import { EVENT_TYPE_COLOR } from "@/lib/constants"
import { formatTime } from "@/lib/format"
import { cn } from "@/lib/utils"
import type { CalendarEvent } from "@/types"
import { HOUR_END, HOUR_HEIGHT, HOUR_START, eventsOnDay, layoutDay } from "@/components/agenda/utils"

interface TimeGridProps {
  days: Date[]
  events: CalendarEvent[]
  onCreate: (date: Date) => void
  onOpen: (event: CalendarEvent) => void
  now: Date
}

const HOURS = Array.from({ length: HOUR_END - HOUR_START }, (_, i) => HOUR_START + i)

/** Grade horária para as visões semana (7 colunas) e dia (1 coluna). */
export function TimeGrid({ days, events, onCreate, onOpen, now }: TimeGridProps) {
  const scrollRef = useRef<HTMLDivElement>(null)
  useEffect(() => { if (scrollRef.current) scrollRef.current.scrollTop = 7 * HOUR_HEIGHT }, [])
  const multi = days.length > 1
  const nowTop = ((now.getHours() * 60 + now.getMinutes() - HOUR_START * 60) / 60) * HOUR_HEIGHT
  return (
    <div className="overflow-hidden rounded-xl border bg-card">
      <div ref={scrollRef} className="max-h-[70vh] overflow-auto">
        <div className={cn(multi && "min-w-[720px]")}>
          <div className="sticky top-0 z-10 grid border-b bg-card" style={{ gridTemplateColumns: `52px repeat(${days.length}, minmax(0, 1fr))` }}>
            <div />
            {days.map((d) => (
              <div key={d.toISOString()} className="border-l px-2 py-2 text-center">
                <p className="text-[11px] text-muted-foreground capitalize">{format(d, "EEE", { locale: ptBR })}</p>
                <p className={cn("num mx-auto mt-0.5 flex size-7 items-center justify-center rounded-md text-sm", isToday(d) && "bg-primary font-semibold text-primary-foreground")}>{format(d, "d")}</p>
              </div>
            ))}
          </div>
          {events.some(event => event.allDay) && <div className="grid border-b bg-muted/20" style={{ gridTemplateColumns: `52px repeat(${days.length}, minmax(0, 1fr))` }}><div className="p-1 text-[10px] text-muted-foreground">Dia inteiro</div>{days.map(day => <div key={day.toISOString()} className="space-y-1 border-l p-1">{eventsOnDay(events, day).filter(event => event.allDay).map(event => <button type="button" key={event.id} onClick={() => onOpen(event)} className="block w-full truncate rounded border bg-card p-1 text-left text-[11px]">{event.title}</button>)}</div>)}</div>}
          <div className="grid" style={{ gridTemplateColumns: `52px repeat(${days.length}, minmax(0, 1fr))` }}>
            <div>
              {HOURS.map((h) => (
                <div key={h} style={{ height: HOUR_HEIGHT }} className="num pr-2 text-right text-[10px] text-muted-foreground">
                  <span className="relative -top-1.5">{String(h).padStart(2, "0")}:00</span>
                </div>
              ))}
            </div>
            {days.map((day) => {
              const positioned = layoutDay(eventsOnDay(events, day).filter(event => !event.allDay), day)
              return (
                <div key={day.toISOString()} className="relative border-l">
                  {HOURS.map((h) => (
                    <button
                      key={h}
                      type="button"
                      aria-label={`Criar evento às ${h}:00`}
                      style={{ height: HOUR_HEIGHT }}
                      className="block w-full border-b border-[#161616] hover:bg-accent"
                      onClick={() => {
                        const d = new Date(day)
                        d.setHours(h, 0, 0, 0)
                        onCreate(d)
                      }}
                    />
                  ))}
                  {isToday(day) && nowTop >= 0 && nowTop <= HOURS.length * HOUR_HEIGHT && (
                    <div className="pointer-events-none absolute right-0 left-0 z-[5] h-px bg-primary" style={{ top: nowTop }}>
                      <span className="absolute -top-1 -left-1 size-2 rounded-full bg-primary" />
                    </div>
                  )}
                  {positioned.map(({ event, top, height, lane, lanes }) => (
                    <button
                      key={event.id}
                      type="button"
                      onClick={() => onOpen(event)}
                      className="absolute z-[6] overflow-hidden rounded-md border bg-surface px-1.5 py-1 text-left text-[11px] leading-tight hover:border-[#3a3a3a]"
                      style={{
                        top,
                        height,
                        left: `calc(${(lane / lanes) * 100}% + 2px)`,
                        width: `calc(${100 / lanes}% - 4px)`,
                        borderLeft: `3px solid ${EVENT_TYPE_COLOR[event.type]}`,
                      }}
                    >
                      <p className="truncate font-medium">{event.title}</p>
                      {height > 34 && <p className="num truncate text-muted-foreground">{formatTime(event.start)} – {formatTime(event.end)}</p>}
                    </button>
                  ))}
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}
