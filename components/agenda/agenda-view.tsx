"use client"

import { useMemo, useState } from "react"
import {
  addDays,
  addMonths,
  addWeeks,
  endOfDay,
  endOfMonth,
  endOfWeek,
  format,
  isSameMonth,
  startOfDay,
  startOfMonth,
  startOfWeek,
  subDays,
  subMonths,
  subWeeks,
} from "date-fns"
import { ptBR } from "date-fns/locale"
import { CalendarDays, CalendarRange, ChevronLeft, ChevronRight, LayoutGrid, List, Plus, Square } from "lucide-react"
import { GoogleCalendarConnection } from "@/components/google-calendar/connection-card"
import { Button } from "@/components/ui/button"
import { PageHeader } from "@/components/shared/page-header"
import { OptionSelect } from "@/components/shared/option-select"
import { EventFormDialog } from "@/components/forms/event-form-dialog"
import { EventDetailDrawer } from "@/components/agenda/event-detail-drawer"
import { ListView } from "@/components/agenda/list-view"
import { MonthView } from "@/components/agenda/month-view"
import { Segmented } from "@/components/agenda/segmented"
import { TimeGrid } from "@/components/agenda/time-grid"
import type { AgendaView as View } from "@/components/agenda/utils"
import { EVENT_TYPE_COLOR, EVENT_TYPE_LABEL } from "@/lib/constants"
import { useEvents } from "@/lib/data"
import { useEntityOptions } from "@/lib/data/options"
import { cn } from "@/lib/utils"
import type { CalendarEvent, EventType } from "@/types"

const TYPES = Object.keys(EVENT_TYPE_LABEL) as EventType[]
const ALL = "__all"

function rangeFor(view: View, cursor: Date) {
  if (view === "semana") return { from: startOfWeek(cursor, { weekStartsOn: 0 }), to: endOfWeek(cursor, { weekStartsOn: 0 }) }
  if (view === "dia") return { from: startOfDay(cursor), to: endOfDay(cursor) }
  return { from: startOfMonth(cursor), to: endOfMonth(cursor) }
}

function titleFor(view: View, cursor: Date) {
  if (view === "semana") {
    const { from, to } = rangeFor(view, cursor)
    return `${format(from, "dd MMM", { locale: ptBR })} – ${format(to, "dd MMM yyyy", { locale: ptBR })}`
  }
  if (view === "dia") return format(cursor, "EEEE, dd 'de' MMMM 'de' yyyy", { locale: ptBR })
  return format(cursor, "MMMM 'de' yyyy", { locale: ptBR })
}

export function AgendaView({ googleNotice }: { googleNotice?: string }) {
  const events = useEvents().filter(event => Boolean(event.google))
  const { userOptions } = useEntityOptions()
  const [now] = useState(() => new Date())
  const [view, setView] = useState<View>("mes")
  const [cursor, setCursor] = useState(() => new Date())
  const [selectedDay, setSelectedDay] = useState(() => startOfDay(new Date()))
  const [hiddenTypes, setHiddenTypes] = useState<EventType[]>([])
  const [owner, setOwner] = useState<string>(ALL)
  const [openId, setOpenId] = useState<string | null>(null)
  const [form, setForm] = useState<{ open: boolean; event?: CalendarEvent; date?: string }>({ open: false })

  const filtered = useMemo(
    () => events.filter((e) => !hiddenTypes.includes(e.type) && (owner === ALL || e.ownerId === owner)),
    [events, hiddenTypes, owner],
  )
  const range = rangeFor(view, cursor)
  const inView = filtered.filter((e) => new Date(e.start) <= range.to && new Date(e.end) > range.from)
  const openEvent = events.find((e) => e.id === openId)

  const move = (dir: -1 | 1) => {
    const next =
      view === "semana" ? (dir > 0 ? addWeeks(cursor, 1) : subWeeks(cursor, 1)) : view === "dia" ? (dir > 0 ? addDays(cursor, 1) : subDays(cursor, 1)) : dir > 0 ? addMonths(cursor, 1) : subMonths(cursor, 1)
    setCursor(next)
    if (view === "mes" || view === "lista") setSelectedDay(isSameMonth(next, now) ? startOfDay(now) : startOfMonth(next))
    else setSelectedDay(startOfDay(next))
  }
  const goToday = () => {
    setCursor(now)
    setSelectedDay(startOfDay(now))
  }

  const create = (date: Date) => setForm({ open: true, date: date.toISOString() })
  const toggleType = (t: EventType) => setHiddenTypes((prev) => (prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]))

  return (
    <>
      <PageHeader
        title="Agenda"
        description="Calls, reuniões, follow-ups, entregas e cobranças da equipe."
        actions={
          <Button onClick={() => create(addDays(startOfDay(now), 0))}>
            <Plus />
            Novo evento
          </Button>
        }
      />

      <GoogleCalendarConnection from={startOfWeek(range.from).toISOString()} to={new Date(endOfWeek(range.to).getTime() + 1).toISOString()} notice={googleNotice} />

      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1">
            <Button variant="outline" size="icon-sm" onClick={() => move(-1)} aria-label="Anterior">
              <ChevronLeft />
            </Button>
            <Button variant="outline" size="sm" onClick={goToday}>
              Hoje
            </Button>
            <Button variant="outline" size="icon-sm" onClick={() => move(1)} aria-label="Próximo">
              <ChevronRight />
            </Button>
          </div>
          <h2 className="text-base font-semibold capitalize">{titleFor(view, cursor)}</h2>
          <span className="num text-xs text-muted-foreground">{inView.length} evento(s)</span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <OptionSelect value={owner} onChange={setOwner} options={[{ value: ALL, label: "Todos os responsáveis" }, ...userOptions]} className="w-full sm:w-52" />
          <Segmented
            aria-label="Visão da agenda"
            value={view}
            onChange={setView}
            options={[
              { value: "mes", label: "Mês", icon: LayoutGrid },
              { value: "semana", label: "Semana", icon: CalendarRange },
              { value: "dia", label: "Dia", icon: Square },
              { value: "lista", label: "Lista", icon: List },
            ]}
          />
        </div>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        {TYPES.map((t) => {
          const off = hiddenTypes.includes(t)
          return (
            <button
              key={t}
              type="button"
              onClick={() => toggleType(t)}
              aria-pressed={!off}
              className={cn("inline-flex h-7 items-center gap-1.5 rounded-md border bg-card px-2 text-xs transition-colors hover:border-[#3a3a3a]", off && "text-muted-foreground line-through")}
            >
              <span className="size-2 rounded-sm" style={{ backgroundColor: off ? "var(--chart-muted)" : EVENT_TYPE_COLOR[t] }} />
              {EVENT_TYPE_LABEL[t]}
            </button>
          )
        })}
        {hiddenTypes.length > 0 && (
          <Button variant="ghost" size="xs" onClick={() => setHiddenTypes([])} className="text-muted-foreground">
            Mostrar todos
          </Button>
        )}
      </div>

      {view === "mes" && (
        <MonthView cursor={cursor} events={filtered} selectedDay={selectedDay} onSelectDay={setSelectedDay} onCreate={create} onOpen={(e) => setOpenId(e.id)} />
      )}
      {view === "semana" && (
        <TimeGrid
          now={now}
          days={Array.from({ length: 7 }, (_, i) => addDays(range.from, i))}
          events={filtered}
          onCreate={create}
          onOpen={(e) => setOpenId(e.id)}
        />
      )}
      {view === "dia" && <TimeGrid now={now} days={[startOfDay(cursor)]} events={filtered} onCreate={create} onOpen={(e) => setOpenId(e.id)} />}
      {view === "lista" && <ListView events={inView} onOpen={(e) => setOpenId(e.id)} />}

      {view !== "mes" && view !== "lista" && inView.length === 0 && (
        <p className="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground">
          <CalendarDays className="size-3.5" />
          Nenhum compromisso neste período. Clique em um horário para criar.
        </p>
      )}

      <EventDetailDrawer
        event={openEvent}
        onOpenChange={(o) => !o && setOpenId(null)}
        onEdit={(e) => {
          setOpenId(null)
          setForm({ open: true, event: e })
        }}
      />
      <EventFormDialog
        open={form.open}
        onOpenChange={(o) => setForm((f) => ({ ...f, open: o }))}
        event={form.event}
        defaults={form.date ? { date: form.date } : undefined}
      />
    </>
  )
}
