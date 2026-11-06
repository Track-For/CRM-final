"use client"

import { useState } from "react"
import { toast } from "sonner"
import { LostReasonDialog } from "@/components/sales/lost-reason-dialog"
import { stageName } from "@/components/sales/utils"
import { useCrm, usePipelines } from "@/lib/data"
import { issueBoletoAction } from "@/lib/boleto/actions"
import { insertIssuedBoleto } from "@/components/finance/finance-actions"
import { saveClientAndSyncAsaasAction } from "@/lib/boleto/customer-actions"
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
  const [syncWinClient, setSyncWinClient] = useState(true)
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
    {winning && winClient && winStep === "client" && <ClientFormDialog key={winning.id} open client={winClient} onOpenChange={open => { if (!open) { setWinning(null); setWinClient(null) } }} onContinue={(client, syncAsaas) => { setWinClient(client); setSyncWinClient(syncAsaas); setWinStep("payment") }} />}
    {winning && winClient && winStep === "payment" && <PaymentPlanDialog key={winning.id} deal={winning} confirmingWin onClose={() => { setWinning(null); setWinClient(null) }} onSaved={async () => {
      // Não cria cliente nem recebíveis enquanto o usuário estiver preenchendo as etapas.
      let savedClient = winClient
      if (syncWinClient) {
        const result = await saveClientAndSyncAsaasAction(winClient)
        if (!result.ok) throw new Error(result.error)
        savedClient = result.client
      } else await saveRecord("clients", winClient.id, { ...winClient, deletedAt: null, conversionReverted: false }, true)
      const state = useCrm.getState()
      state.replace("clients", [savedClient, ...state.clients.filter(item => item.id !== savedClient.id)])
      moveDeal(winning.id, "ganho")
      const charges = useCrm.getState().charges.filter(charge => charge.dealId === winning.id && !charge.subscriptionId && !charge.gatewayId && !charge.deletedAt && charge.status === "pendente" && (charge.method === "asaas" || charge.method === "boleto"))
      let issued = 0
      for (const charge of charges.filter(charge => charge.dueDate)) {
        const entry = useCrm.getState().entries.find(item => item.chargeId === charge.id)
        try {
          const result = await issueBoletoAction({ charge, entry, payer: { name: savedClient.legalName || savedClient.name, cpfCnpj: savedClient.document, email: savedClient.email || undefined, phone: savedClient.whatsapp, cep: savedClient.address.zip, street: savedClient.address.street, number: savedClient.address.number, complement: savedClient.address.complement, district: savedClient.address.district } })
          if (result.ok && result.charge) { insertIssuedBoleto(result.charge, entry); issued++ }
          else toast.error(`Cobrança salva no CRM, mas não emitida no Asaas: ${result.error || charge.description}`)
        } catch { toast.error("A emissão no Asaas não foi concluída. Abra a cobrança para tentar novamente.") }
      }
      toast.success("Negócio ganho", { description: winning.value === 0 ? "Projeto sem cobrança. A manutenção segue o valor definido no negócio." : issued ? `${issued} cobrança(s) emitida(s) no Asaas com envio habilitado.` : charges.some(charge => !charge.dueDate) ? "Defina os vencimentos para emitir as etapas pelo Asaas." : "Dados do cliente e plano confirmados. Cobranças registradas no CRM." })
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
