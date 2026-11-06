"use client"

import { useState } from "react"
import { toast } from "sonner"
import { LostReasonDialog } from "@/components/sales/lost-reason-dialog"
import { stageName } from "@/components/sales/utils"
import { useCrm, usePipelines } from "@/lib/data"
import { ClientFormDialog } from "@/components/clients/client-form-dialog"
import { clientForLead } from "@/lib/data/lead-conversion"
import { saveRecord } from "@/lib/data/records-actions"
import { PaymentPlanDialog } from "@/components/clients/payment-plan-dialog"
import type { Client, Deal, StageKey } from "@/types"

/**
 * Centraliza a mudança de etapa: "Perdido" exige motivo (modal) e "Ganho"
 * exige dados fiscais e plano de pagamento antes de converter. Usado no Kanban e na página do negócio.
 */
export function useStageMover() {
  const moveDeal = useCrm((s) => s.moveDeal)
  const pipelines = usePipelines()
  const [winning, setWinning] = useState<Deal | null>(null)
  const [winClient, setWinClient] = useState<Client | null>(null)
  const [winStep, setWinStep] = useState<"client" | "payment">("client")
  const [pending, setPending] = useState<Deal | null>(null)

  const requestMove = (deal: Deal, stage: StageKey) => {
    if (deal.stage === stage) return
    if (stage === "perdido") {
      setPending(deal)
      return
    }
    if (stage === "ganho") {
      const state = useCrm.getState()
      const lead = state.leads.find(item => item.id === deal.leadId)
      if (!lead) { toast.error("Lead de origem não encontrado"); return }
      setWinClient(clientForLead(lead, state.clients))
      setWinStep("client")
      setWinning(deal)
      return
    }
    moveDeal(deal.id, stage)
    toast.success(`Movido para ${stageName(pipelines, deal.pipelineId, stage)}`)
  }

  const dialog = (
    <>
    {winning && winClient && winStep === "client" && <ClientFormDialog key={winning.id} open client={winClient} onOpenChange={open => { if (!open) { setWinning(null); setWinClient(null) } }} onContinue={client => { setWinClient(client); setWinStep("payment") }} />}
    {winning && winClient && winStep === "payment" && <PaymentPlanDialog key={winning.id} deal={winning} confirmingWin onClose={() => { setWinning(null); setWinClient(null) }} onSaved={async () => {
      // Não cria cliente nem recebíveis enquanto o usuário estiver preenchendo as etapas.
      await saveRecord("clients", winClient.id, { ...winClient, deletedAt: null, conversionReverted: false }, true)
      const state = useCrm.getState()
      state.replace("clients", [winClient, ...state.clients.filter(item => item.id !== winClient.id)])
      moveDeal(winning.id, "ganho")
      toast.success("Negócio ganho", { description: "Dados do cliente e plano confirmados. Cobranças criadas automaticamente." })
      setWinning(null)
      setWinClient(null)
    }} />}
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
    </>
  )

  return { requestMove, dialog }
}
