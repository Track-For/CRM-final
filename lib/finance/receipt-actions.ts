"use server"
import { z } from "zod"
import { requireUser } from "@/lib/auth/session"
import { projectPaymentsByDeal, receiptTotals, receiptsIn } from "./receipts"
import { loadReceiptData } from "./receipt-data"

const bounds = z.object({ from: z.iso.datetime(), to: z.iso.datetime() }).refine(r => r.from <= r.to, "Período inválido.")
const requestSchema = z.object({ current: bounds, previous: bounds, months: z.array(bounds).max(60) }).strict()
export async function getReceiptMetrics(input: z.infer<typeof requestSchema>) {
  const user = await requireUser()
  if (!["admin", "comercial", "financeiro"].includes(user.role)) throw Error("Sem permissão para consultar os indicadores de recebimento.")
  const request = requestSchema.parse(input)
  const { receipts, undated } = await loadReceiptData()
  const current = receiptsIn(receipts, request.current.from, request.current.to)
  const group = (key: "ownerId" | "source") => Object.fromEntries([...new Set(current.map(r => r[key]))].map(value => [value, receiptTotals(current.filter(r => r[key] === value))]))
  return { current: receiptTotals(current), previous: receiptTotals(receiptsIn(receipts, request.previous.from, request.previous.to)), months: request.months.map(m => receiptTotals(receiptsIn(receipts, m.from, m.to))), owners: group("ownerId"), sources: group("source"), projectPaidByDeal: projectPaymentsByDeal(receipts), undated }
}
