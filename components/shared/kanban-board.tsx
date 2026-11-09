"use client"

import * as React from "react"
import {
  closestCorners,
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from "@dnd-kit/core"
import { SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy, arrayMove } from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import { cn } from "@/lib/utils"

export interface KanbanColumn {
  id: string
  title: React.ReactNode
  /** Conteúdo extra no cabeçalho (total, quantidade...). */
  meta?: React.ReactNode
  /** Cor sólida da faixa superior da coluna. */
  accent?: string
}

interface KanbanBoardProps<T> {
  columns: KanbanColumn[]
  items: T[]
  getId: (item: T) => string
  getColumnId: (item: T) => string
  renderCard: (item: T, state: { overlay: boolean }) => React.ReactNode
  /** Chamado ao soltar. `orderedIds` é a ordem final da coluna de destino. */
  onMove: (itemId: string, toColumnId: string, orderedIds: string[]) => void
  emptyLabel?: string
  columnClassName?: string
  className?: string
}

type Board = Record<string, string[]>

function buildBoard<T>(columns: KanbanColumn[], items: T[], getId: (i: T) => string, getColumnId: (i: T) => string): Board {
  const board: Board = Object.fromEntries(columns.map((c) => [c.id, [] as string[]]))
  for (const item of items) board[getColumnId(item)]?.push(getId(item))
  return board
}

export function KanbanBoard<T>({ columns, items, getId, getColumnId, renderCard, onMove, emptyLabel = "Arraste cards para cá", columnClassName, className }: KanbanBoardProps<T>) {
  const base = React.useMemo(() => buildBoard(columns, items, getId, getColumnId), [columns, items, getId, getColumnId])
  const [draft, setDraft] = React.useState<Board | null>(null)
  const [activeId, setActiveId] = React.useState<string | null>(null)
  const board = draft ?? base
  const byId = React.useMemo(() => new Map(items.map((i) => [getId(i), i])), [items, getId])

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  const findColumn = (id: string, b: Board) => (id in b ? id : Object.keys(b).find((col) => b[col].includes(id)))

  const handleStart = (e: DragStartEvent) => {
    setActiveId(String(e.active.id))
    setDraft(base)
  }

  const handleOver = (e: DragOverEvent) => {
    const { active, over } = e
    if (!over || !draft) return
    const from = findColumn(String(active.id), draft)
    const to = findColumn(String(over.id), draft)
    if (!from || !to || from === to) return
    setDraft((prev) => {
      if (!prev) return prev
      const fromList = prev[from].filter((id) => id !== active.id)
      const toList = [...prev[to]]
      const overIndex = toList.indexOf(String(over.id))
      toList.splice(overIndex >= 0 ? overIndex : toList.length, 0, String(active.id))
      return { ...prev, [from]: fromList, [to]: toList }
    })
  }

  const handleEnd = (e: DragEndEvent) => {
    const { active, over } = e
    const current = draft
    setActiveId(null)
    setDraft(null)
    if (!over || !current) return
    const id = String(active.id)
    const col = findColumn(id, current)
    const overCol = findColumn(String(over.id), current)
    if (!col || !overCol) return
    let list = current[col]
    if (col === overCol && over.id !== active.id && list.includes(String(over.id))) {
      list = arrayMove(list, list.indexOf(id), list.indexOf(String(over.id)))
    }
    const originalCol = getColumnId(byId.get(id)!)
    const sameOrder = originalCol === col && list.join() === base[col].join()
    if (!sameOrder) onMove(id, col, list)
  }

  const activeItem = activeId ? byId.get(activeId) : undefined

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={handleStart}
      onDragOver={handleOver}
      onDragEnd={handleEnd}
      onDragCancel={() => {
        setActiveId(null)
        setDraft(null)
      }}
    >
      <div className={cn("-mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-4 md:mx-0 md:px-0", className)}>
        {columns.map((col) => (
          <KanbanColumnView key={col.id} column={col} ids={board[col.id] ?? []} emptyLabel={emptyLabel} className={columnClassName}>
            {(board[col.id] ?? []).map((id) => {
              const item = byId.get(id)
              return item ? (
                <SortableCard key={id} id={id}>
                  {renderCard(item, { overlay: false })}
                </SortableCard>
              ) : null
            })}
          </KanbanColumnView>
        ))}
      </div>
      <DragOverlay dropAnimation={null}>{activeItem ? <div className="rotate-1 cursor-grabbing">{renderCard(activeItem, { overlay: true })}</div> : null}</DragOverlay>
    </DndContext>
  )
}

function KanbanColumnView({ column, ids, children, emptyLabel, className }: { column: KanbanColumn; ids: string[]; children: React.ReactNode; emptyLabel: string; className?: string }) {
  const { setNodeRef, isOver } = useDroppable({ id: column.id })
  return (
    <div className={cn("flex w-[290px] shrink-0 snap-start flex-col rounded-2xl border border-border/60 bg-surface/70", isOver && "border-primary/35", className)}>
      <div className="h-0.5 rounded-t-xl" style={{ backgroundColor: column.accent ?? "var(--border)" }} />
      <div className="flex items-center justify-between gap-2 px-4 pt-4 pb-3">
        <div className="min-w-0 text-sm font-semibold">{column.title}</div>
        <span className="rounded-md bg-card px-2 py-0.5 text-xs font-medium tabular-nums text-muted-foreground">{ids.length}</span>
      </div>
      {column.meta && <div className="px-3 pb-2 text-xs text-muted-foreground">{column.meta}</div>}
      <SortableContext id={column.id} items={ids} strategy={verticalListSortingStrategy}>
        <div ref={setNodeRef} className="flex min-h-24 flex-1 flex-col gap-3 p-3 pt-0">
          {children}
          {ids.length === 0 && <div className="flex flex-1 items-center justify-center rounded-lg border border-dashed p-4 text-center text-xs text-muted-foreground">{emptyLabel}</div>}
        </div>
      </SortableContext>
    </div>
  )
}

function SortableCard({ id, children }: { id: string; children: React.ReactNode }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id })
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn("touch-manipulation", isDragging && "opacity-30")}
      {...attributes}
      {...listeners}
    >
      {children}
    </div>
  )
}
