"use client"

import { useEffect, useState } from "react"
import { quoteAsaasCardAction } from "@/lib/boleto/actions"
import type { ChargeTerms } from "@/lib/finance/charge-plan"

export function useCardTerms(baseAmount: number, count: number, feeMode: "none" | "asaas", enabled: boolean) {
  const key = JSON.stringify([baseAmount, count, feeMode])
  const needsQuote = enabled && count > 1 && feeMode === "asaas" && baseAmount > 0
  const [quote, setQuote] = useState<{ key: string; terms?: ChargeTerms; error?: string } | null>(null)
  useEffect(() => {
    if (!needsQuote) return
    let alive = true
    const timer = setTimeout(() => {
      quoteAsaasCardAction(baseAmount, count).then(terms => { if (alive) setQuote({ key, terms }) }).catch(error => { if (alive) setQuote({ key, error: error instanceof Error ? error.message : "Não foi possível consultar as taxas do Asaas." }) })
    }, 350)
    return () => { alive = false; clearTimeout(timer) }
  }, [key, baseAmount, count, needsQuote])
  return {
    terms: needsQuote ? quote?.key === key ? quote.terms : undefined : { baseAmount, count, surchargePercent: 0, cardFeeMode: "none" as const },
    loading: needsQuote && quote?.key !== key,
    error: needsQuote && quote?.key === key ? quote.error : undefined,
  }
}
