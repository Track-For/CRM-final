"use client"

import { CalendarClock, MessageSquare, Paperclip, SquareCheck } from "lucide-react"
import { EnumBadge } from "@/components/shared/status-badge"
import { UserAvatar } from "@/components/shared/user-avatar"
import { checklistProgress, isTaskOverdue } from "@/components/tasks/task-utils"
import { TASK_PRIORITY_LABEL, TASK_PRIORITY_TONE } from "@/lib/constants"
import { formatDate } from "@/lib/format"
import { cn } from "@/lib/utils"
import type { Task } from "@/types"

interface TaskCardProps {
  task: Task
  clientName?: string
  now: Date
  onOpen?: (task: Task) => void
  overlay?: boolean
}

export function TaskCard({ task, clientName, now, onOpen, overlay }: TaskCardProps) {
  const overdue = isTaskOverdue(task, now)
  const progress = checklistProgress(task)
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onOpen?.(task)}
      onKeyDown={(e) => e.key === "Enter" && onOpen?.(task)}
      className={cn(
        "flex cursor-grab flex-col gap-2.5 rounded-lg border bg-surface p-3 text-left transition-colors hover:border-[#3a3a3a]",
        overlay && "border-primary/35",
        task.status === "done" && "opacity-70",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <p className={cn("text-sm leading-snug font-medium", task.status === "done" && "text-muted-foreground line-through")}>{task.title}</p>
        <EnumBadge value={task.priority} labels={TASK_PRIORITY_LABEL} tones={TASK_PRIORITY_TONE} />
      </div>
      {(clientName || task.projectName) && <p className="truncate text-xs text-muted-foreground">{task.projectName ?? clientName}</p>}

      {progress.total > 0 && (
        <div className="space-y-1">
          <div className="flex items-center justify-between text-[11px] text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <SquareCheck className="size-3" />
              Checklist
            </span>
            <span className="num">
              {progress.done}/{progress.total}
            </span>
          </div>
          <div className="h-1 overflow-hidden rounded-full bg-muted">
            <div className={cn("h-full rounded-full", progress.pct === 100 ? "bg-success" : "bg-primary")} style={{ width: `${progress.pct}%` }} />
          </div>
        </div>
      )}

      <div className="flex items-center justify-between gap-2">
        <span className={cn("num inline-flex items-center gap-1 text-[11px]", overdue ? "font-medium text-danger" : "text-muted-foreground")}>
          <CalendarClock className="size-3" />
          {formatDate(task.dueDate)}
          {overdue && " · atrasada"}
        </span>
        <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
          {task.comments.length > 0 && (
            <span className="num inline-flex items-center gap-0.5">
              <MessageSquare className="size-3" />
              {task.comments.length}
            </span>
          )}
          {task.attachments.length > 0 && (
            <span className="num inline-flex items-center gap-0.5">
              <Paperclip className="size-3" />
              {task.attachments.length}
            </span>
          )}
          <UserAvatar userId={task.assigneeId} size="xs" />
        </div>
      </div>
    </div>
  )
}
