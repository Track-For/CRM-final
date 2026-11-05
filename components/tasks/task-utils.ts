import { isBefore, parseISO } from "date-fns"
import type { Task } from "@/types"

export function isTaskOverdue(task: Task, now: Date) {
  return task.status !== "done" && isBefore(parseISO(task.dueDate), now)
}

export function checklistProgress(task: Task) {
  const total = task.checklist.length
  const done = task.checklist.filter((c) => c.done).length
  return { total, done, pct: total ? Math.round((done / total) * 100) : 0 }
}
