import type { ChargeStatus, EntryStatus } from "@/types"

const day = (value: string | Date) => {
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value
  const date = new Date(value)
  return Number.isFinite(date.getTime()) ? new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(date) : ""
}
export function paymentStatus<T extends ChargeStatus | EntryStatus>(item: { status: T; dueDate: string }, now = new Date()): T {
  if (item.status === "pago" || item.status === "cancelado") return item.status
  const due = day(item.dueDate)
  return (due && due < day(now) ? "vencido" : item.status) as T
}
