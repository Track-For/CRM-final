import { differenceInCalendarDays, format, formatDistanceToNowStrict, isValid, parseISO } from "date-fns"
import { ptBR } from "date-fns/locale"

const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" })
const brlCompact = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
  notation: "compact",
  maximumFractionDigits: 1,
})
const num = new Intl.NumberFormat("pt-BR")
const pct = new Intl.NumberFormat("pt-BR", { style: "percent", maximumFractionDigits: 1 })

export function formatMoney(value: number | null | undefined): string {
  return brl.format(value ?? 0)
}

/** Só para rótulo de eixo de gráfico, onde o tooltip mostra o valor inteiro. Em todo o resto, use formatMoney. */
export function formatMoneyCompact(value: number): string {
  return brlCompact.format(value)
}

export function formatNumber(value: number): string {
  return num.format(value)
}

/** Recebe fração (0.25) e devolve "25%". */
export function formatPercent(value: number): string {
  return pct.format(Number.isFinite(value) ? value : 0)
}

function toDate(value: string | Date): Date {
  return typeof value === "string" ? parseISO(value) : value
}

export function formatDate(value: string | Date | null | undefined): string {
  if (!value) return "—"
  const d = toDate(value)
  return isValid(d) ? format(d, "dd/MM/yyyy") : "—"
}

export function formatDateTime(value: string | Date | null | undefined): string {
  if (!value) return "—"
  const d = toDate(value)
  return isValid(d) ? format(d, "dd/MM/yyyy HH:mm") : "—"
}

export function formatTime(value: string | Date): string {
  return format(toDate(value), "HH:mm")
}

export function formatDateLong(value: string | Date): string {
  return format(toDate(value), "EEEE, dd 'de' MMMM", { locale: ptBR })
}

export function formatMonth(value: string | Date): string {
  return format(toDate(value), "MMM/yy", { locale: ptBR })
}

export function formatRelative(value: string | Date): string {
  return formatDistanceToNowStrict(toDate(value), { locale: ptBR, addSuffix: true })
}

export function daysSince(value: string | Date): number {
  return differenceInCalendarDays(new Date(), toDate(value))
}

export function daysUntil(value: string | Date): number {
  return differenceInCalendarDays(toDate(value), new Date())
}

/** Prazos sempre em "X dias". */
export function formatDays(days: number | null | undefined): string {
  if (days == null) return "A combinar"
  return `${days} ${days === 1 ? "dia" : "dias"}`
}

/* ------------------------------------------------------------------ */
/* Máscaras                                                            */
/* ------------------------------------------------------------------ */

export const onlyDigits = (value: string) => value.replace(/\D/g, "")

export function maskPhone(value: string): string {
  let d = onlyDigits(value)
  if (d.startsWith("55") && d.length > 11) d = d.slice(2)
  d = d.slice(0, 11)
  if (d.length <= 2) return d.length ? `(${d}` : ""
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`
}

export function maskCpf(value: string): string {
  const d = onlyDigits(value).slice(0, 11)
  return d
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d{1,2})$/, "$1-$2")
}

export function maskCnpj(value: string): string {
  const d = onlyDigits(value).slice(0, 14)
  return d
    .replace(/(\d{2})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d)/, "$1/$2")
    .replace(/(\d{4})(\d{1,2})$/, "$1-$2")
}

export function maskDocument(value: string): string {
  return onlyDigits(value).length > 11 ? maskCnpj(value) : maskCpf(value)
}

export function maskCep(value: string): string {
  const d = onlyDigits(value).slice(0, 8)
  return d.length > 5 ? `${d.slice(0, 5)}-${d.slice(5)}` : d
}

/** Link wa.me a partir de um telefone mascarado. */
export function whatsappLink(phone: string, text?: string): string {
  const d = onlyDigits(phone)
  const full = d.startsWith("55") ? d : `55${d}`
  return `https://wa.me/${full}${text ? `?text=${encodeURIComponent(text)}` : ""}`
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/)
  return ((parts[0]?.[0] ?? "") + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase()
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1).replace(".", ",")} MB`
}
