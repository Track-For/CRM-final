"use client"

import { useSearchParams } from "next/navigation"
import { useCallback, useMemo, useState } from "react"
import { CheckSquare, Columns3, List, Plus } from "lucide-react"
import { toast } from "@/lib/store/save-feedback"
import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
import { Label } from "@/components/ui/label"
import { DataTable, type ColumnDef } from "@/components/shared/data-table"
import { EmptyState } from "@/components/shared/empty-state"
import { ALL, FilterBar, matches } from "@/components/shared/filter-bar"
import { KanbanBoard, type KanbanColumn } from "@/components/shared/kanban-board"
import { PageHeader } from "@/components/shared/page-header"
import { EnumBadge } from "@/components/shared/status-badge"
import { UserAvatar } from "@/components/shared/user-avatar"
import { Segmented } from "@/components/agenda/segmented"
import { TaskCard } from "@/components/tasks/task-card"
import { TaskDrawer } from "@/components/tasks/task-drawer"
import { checklistProgress, isTaskOverdue } from "@/components/tasks/task-utils"
import {
  TASK_PRIORITY_LABEL,
  TASK_PRIORITY_TONE,
  TASK_STATUS_LABEL,
  TASK_STATUS_ORDER,
  TASK_STATUS_TONE,
  toOptions,
} from "@/lib/constants"
import { useById, useClients, useCrm, useTasks } from "@/lib/data"
import { useEntityOptions } from "@/lib/data/options"
import { formatDate } from "@/lib/format"
import { useUiStore } from "@/lib/store/ui-store"
import { cn } from "@/lib/utils"
import type { Task, TaskStatus } from "@/types"

const ACCENT: Record<TaskStatus, string> = {
  todo: "var(--chart-muted)",
  doing: "var(--info)",
  review: "var(--chart-4)",
  done: "var(--success)",
}

const getId = (t: Task) => t.id
const getColumnId = (t: Task) => t.status

export function TasksView() {
  const initialTask = useSearchParams().get("tarefa")
  return <TasksViewContent key={initialTask || "list"} initialTask={initialTask} />
}

function TasksViewContent({ initialTask }: { initialTask: string | null }) {
  const tasks = useTasks()
  const clients = useClients()
  const clientMap = useById("clients")
  const moveTask = useCrm((s) => s.moveTask)
  const openQuickCreate = useUiStore((s) => s.openQuickCreate)
  const { userOptions } = useEntityOptions()
  const [now] = useState(() => new Date())
  const [view, setView] = useState<"kanban" | "lista">("kanban")
  const [search, setSearch] = useState("")
  const [assignee, setAssignee] = useState(ALL)
  const [priority, setPriority] = useState(ALL)
  const [client, setClient] = useState(ALL)
  const [onlyOverdue, setOnlyOverdue] = useState(false)
  const [openId, setOpenId] = useState<string | null>(initialTask)

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return tasks
      .filter(
        (t) =>
          matches(assignee, t.assigneeId) &&
          matches(priority, t.priority) &&
          matches(client, t.clientId) &&
          (!onlyOverdue || isTaskOverdue(t, now)) &&
          (!q || `${t.title} ${t.projectName ?? ""} ${t.description}`.toLowerCase().includes(q)),
      )
      .sort((a, b) => a.order - b.order)
  }, [tasks, search, assignee, priority, client, onlyOverdue, now])

  const overdueCount = tasks.filter((t) => isTaskOverdue(t, now)).length

  const columns = useMemo<KanbanColumn[]>(
    () =>
      TASK_STATUS_ORDER.map((s) => ({
        id: s,
        title: TASK_STATUS_LABEL[s],
        accent: ACCENT[s],
        meta: (() => {
          const late = filtered.filter((t) => t.status === s && isTaskOverdue(t, now)).length
          return late ? <span className="text-danger">{late} atrasada(s)</span> : undefined
        })(),
      })),
    [filtered, now],
  )

  const openTask = tasks.find((t) => t.id === openId)
  const open = useCallback((t: Task) => setOpenId(t.id), [])

  const tableColumns = useMemo<ColumnDef<Task, unknown>[]>(
    () => [
      {
        accessorKey: "title",
        header: "Tarefa",
        cell: ({ row }) => (
          <div className="min-w-0">
            <p className="truncate font-medium">{row.original.title}</p>
            <p className="truncate text-xs text-muted-foreground">{row.original.projectName ?? clientMap.get(row.original.clientId ?? "")?.name ?? "—"}</p>
          </div>
        ),
      },
      { accessorKey: "status", header: "Status", cell: ({ row }) => <EnumBadge value={row.original.status} labels={TASK_STATUS_LABEL} tones={TASK_STATUS_TONE} /> },
      { accessorKey: "priority", header: "Prioridade", cell: ({ row }) => <EnumBadge value={row.original.priority} labels={TASK_PRIORITY_LABEL} tones={TASK_PRIORITY_TONE} /> },
      { accessorKey: "assigneeId", header: "Responsável", cell: ({ row }) => <UserAvatar userId={row.original.assigneeId} showName /> },
      {
        accessorKey: "dueDate",
        header: "Prazo",
        cell: ({ row }) => <span className={cn("num text-sm", isTaskOverdue(row.original, now) && "font-medium text-danger")}>{formatDate(row.original.dueDate)}</span>,
      },
      {
        id: "checklist",
        header: "Checklist",
        enableSorting: false,
        cell: ({ row }) => {
          const p = checklistProgress(row.original)
          return p.total ? (
            <span className="num text-xs text-muted-foreground">
              {p.done}/{p.total}
            </span>
          ) : (
            <span className="text-xs text-muted-foreground">—</span>
          )
        },
      },
    ],
    [clientMap, now],
  )

  return (
    <>
      <PageHeader
        title="Tarefas"
        description={`${tasks.filter((t) => t.status !== "done").length} abertas · ${overdueCount} atrasada(s)`}
        actions={
          <>
            <Segmented
              aria-label="Modo de visualização"
              value={view}
              onChange={setView}
              options={[
                { value: "kanban", label: "Kanban", icon: Columns3 },
                { value: "lista", label: "Lista", icon: List },
              ]}
            />
            <Button onClick={() => openQuickCreate("task")}>
              <Plus />
              Nova tarefa
            </Button>
          </>
        }
      />

      <FilterBar
        search={search}
        onSearch={setSearch}
        searchPlaceholder="Buscar tarefa ou projeto..."
        filters={[
          { key: "assignee", label: "Responsável", options: userOptions, value: assignee, onChange: setAssignee },
          { key: "priority", label: "Prioridade", options: toOptions(TASK_PRIORITY_LABEL), value: priority, onChange: setPriority },
          { key: "client", label: "Cliente", options: clients.map((c) => ({ value: c.id, label: c.name })), value: client, onChange: setClient },
        ]}
        onClear={() => {
          setSearch("")
          setAssignee(ALL)
          setPriority(ALL)
          setClient(ALL)
          setOnlyOverdue(false)
        }}
      >
        <div className="flex items-center gap-2">
          <Switch id="only-overdue" checked={onlyOverdue} onCheckedChange={setOnlyOverdue} />
          <Label htmlFor="only-overdue" className="text-sm">
            Só atrasadas
          </Label>
        </div>
      </FilterBar>

      {view === "kanban" ? (
        tasks.length === 0 ? (
          <EmptyState icon={CheckSquare} title="Nenhuma tarefa cadastrada" action={<Button size="sm" onClick={() => openQuickCreate("task")}>Criar tarefa</Button>} />
        ) : (
          <KanbanBoard
            columns={columns}
            items={filtered}
            getId={getId}
            getColumnId={getColumnId}
            emptyLabel="Nenhuma tarefa aqui"
            renderCard={(t, { overlay }) => <TaskCard task={t} now={now} clientName={clientMap.get(t.clientId ?? "")?.name} onOpen={open} overlay={overlay} />}
            onMove={(id, col, orderedIds) => {
              const task = tasks.find((t) => t.id === id)
              const status = col as TaskStatus
              moveTask(id, status, orderedIds)
              if (task && task.status !== status) toast.success(status === "done" ? "Tarefa concluída" : `Movida para ${TASK_STATUS_LABEL[status]}`)
            }}
          />
        )
      ) : (
        <DataTable
          columns={tableColumns}
          data={filtered}
          getRowId={getId}
          onRowClick={open}
          initialSorting={[{ id: "dueDate", desc: false }]}
          empty={<EmptyState icon={CheckSquare} title="Nenhuma tarefa encontrada" description="Ajuste os filtros ou crie uma nova tarefa." />}
          mobileCard={(t) => <TaskCard task={t} now={now} clientName={clientMap.get(t.clientId ?? "")?.name} />}
        />
      )}

      <TaskDrawer task={openTask} onOpenChange={(o) => !o && setOpenId(null)} now={now} />
    </>
  )
}
