"use client"

import { Suspense } from "react"
import { useSearchParams } from "next/navigation"
import { PageSkeleton } from "@/components/shared/skeletons"
import { QuoteWizard } from "@/components/quotes/quote-wizard"

function NewQuote() {
  const params = useSearchParams()
  const initial = {
    leadId: params.get("leadId") ?? undefined,
    clientId: params.get("clientId") ?? undefined,
    dealId: params.get("dealId") ?? undefined,
  }
  return <QuoteWizard key={params.toString()} initial={initial} />
}

export default function NovoOrcamentoPage() {
  return (
    <Suspense fallback={<PageSkeleton stats={false} />}>
      <NewQuote />
    </Suspense>
  )
}
