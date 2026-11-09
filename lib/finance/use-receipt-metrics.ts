"use client"
import { useEffect, useState } from "react"
import { getReceiptMetrics } from "./receipt-actions"
import { useUiStore } from "@/lib/store/ui-store"
import { useCrm } from "@/lib/data"

type Metrics = Awaited<ReturnType<typeof getReceiptMetrics>>
export function useReceiptMetrics(range: { from: Date; to: Date; previousFrom: Date; previousTo: Date }, months: { from: Date; to: Date }[]) {
  const role = useUiStore(s => s.role)
  const revision = useCrm(s => JSON.stringify([s.charges, s.entries]))
  const enabled = ["admin", "comercial", "financeiro"].includes(role)
  const request = JSON.stringify({ current: { from: range.from.toISOString(), to: range.to.toISOString() }, previous: { from: range.previousFrom.toISOString(), to: range.previousTo.toISOString() }, months: months.map(m => ({ from: m.from.toISOString(), to: m.to.toISOString() })) })
  const key = `${role}:${request}:${revision}`
  const [state, setState] = useState<{ key: string; data: Metrics | null; error: string }>({ key: "", data: null, error: "" })
  useEffect(() => {
    if (!enabled) return
    let active = true
    const timer = setTimeout(() => {
      getReceiptMetrics(JSON.parse(request)).then(data => { if (active) setState({ key, data, error: "" }) }).catch(() => { if (active) setState({ key, data: null, error: "Não foi possível carregar os recebimentos. Atualize a página para tentar novamente." }) })
    }, 0)
    return () => { active = false; clearTimeout(timer) }
  }, [enabled, request, key])
  return { data: state.key === key ? state.data : null, error: enabled && state.key === key ? state.error : "", loading: enabled && state.key !== key, enabled }
}
