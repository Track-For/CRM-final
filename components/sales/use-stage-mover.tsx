"use client"

import { useState } from "react"
import { toast } from "sonner"
import { LostReasonDialog } from "@/components/sales/lost-reason-dialog"
import { stageName } from "@/components/sales/utils"
import { useCrm, usePipelines } from "@/lib/data"
import { useUiStore } from "@/lib/store/ui-store"
import type { Deal, StageKey } from "@/types"

/**
 * Centraliza a mudança de etapa: "Perdido" exige motivo (modal) e "Ganho"
 * oferece gerar a cobrança de entrada. Usado no Kanban e na página do negócio.
 */
export function useStageMover() {
  const moveDeal = useCrm((s) => s.moveDeal)
  const pipelines = usePipelines()
  const openQuickCreate = useUiStore((s) => s.openQuickCreate)
  const [pending, setPending] = useState<Deal | null>(null)

  const requestMove = (deal: Deal, stage: StageKey) => {
    if (deal.stage === stage) return
    if (stage === "perdido") {
      setPending(deal)
      return
    }
    moveDeal(deal.id, stage)
    if (stage === "ganho") {
      toast.success("Negócio ganho", {
        description: deal.title,
        action: {
          label: "Gerar cobrança de entrada",
          onClick: () =>
            openQuickCreate("charge", {
              clientId: deal.clientId,
              dealId: deal.id,
              amount: String(Math.round(deal.value / 2)),
              description: `Entrada 50% — ${deal.title}`,
            }),
        },
      })
    } else {
      toast.success(`Movido para ${stageName(pipelines, deal.pipelineId, stage)}`)
    }
  }

  const dialog = (
    <LostReasonDialog
      open={pending !== null}
      dealTitle={pending?.title}
      onCancel={() => setPending(null)}
      onConfirm={(values) => {
        if (pending) {
          moveDeal(pending.id, "perdido", values)
          toast.success("Negócio marcado como perdido")
        }
        setPending(null)
      }}
    />
  )

  return { requestMove, dialog }
}
