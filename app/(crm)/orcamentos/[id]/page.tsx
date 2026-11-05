"use client"

import Link from "next/link"
import { useParams } from "next/navigation"
import { FileText } from "lucide-react"
import { Button } from "@/components/ui/button"
import { EmptyState } from "@/components/shared/empty-state"
import { QuoteWizard } from "@/components/quotes/quote-wizard"
import { useQuote } from "@/lib/data"

export default function OrcamentoPage() {
  const { id } = useParams<{ id: string }>()
  const quote = useQuote(id)
  if (!quote) {
    return (
      <EmptyState
        icon={FileText}
        title="Orçamento não encontrado"
        description="Ele pode ter sido removido ou o link está incorreto."
        action={
          <Button asChild size="sm" variant="outline">
            <Link href="/orcamentos">Voltar para orçamentos</Link>
          </Button>
        }
        className="mt-10"
      />
    )
  }
  return <QuoteWizard key={quote.id} quote={quote} />
}
