import { z } from "zod"

export const dealDateSchema = z.iso.date({ error: "Informe uma data válida" })
export const todayDealDate = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date())
export function dealDateInput(value?: string) {
  if (!value) return ""
  if (dealDateSchema.safeParse(value).success) return value
  const date = new Date(value)
  return Number.isFinite(date.getTime()) ? new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(date) : ""
}
export function dealDateToIso(day: string) {
  return `${dealDateSchema.parse(day)}T15:00:00.000Z`
}
