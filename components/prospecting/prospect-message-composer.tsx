"use client"

import { useState } from "react"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { useCrmStore } from "@/lib/store/crm-store"
import { ContactMessageComposer } from "@/components/messages/contact-message-composer"
import { sendProspectMessage } from "@/lib/messages/prospect-actions"
import { prospectMessageValues } from "@/lib/messages/templates"
import type { ProspectDetail } from "@/lib/prospecting/types"

export function ProspectMessageComposer({ prospect, disabled, onSent }: { prospect: ProspectDetail; disabled?: boolean; onSent: (updated: ProspectDetail) => void }) {
  const [dealId, setDealId] = useState<string | null>(null)
  return <div className="space-y-3"><ContactMessageComposer
    contact={{ name: prospect.nome, email: prospect.email || "", whatsapp: prospect.whatsapp || prospect.telefone || "" }}
    messageValues={prospectMessageValues(prospect)}
    disabled={disabled || prospect.nao_contatar}
    notice={prospect.nao_contatar ? "Esta empresa está marcada para não receber contato." : !prospect.whatsapp && prospect.telefone ? "O número disponível é o telefone cadastrado da empresa; WhatsApp ainda não confirmado. Após o envio confirmado, a empresa será cadastrada em Vendas." : "Após o envio confirmado, a empresa será cadastrada em Vendas na etapa Contato feito. Negócios existentes mantêm as etapas já avançadas."}
    sendMessage={async input => {
      const result = await sendProspectMessage({ ...input, prospectId: prospect.id })
      if (result.prospect) onSent(result.prospect)
      if (result.sales) {
        const { lead, deal } = result.sales
        useCrmStore.setState(state => ({ leads: [lead, ...state.leads.filter(item => item.id !== lead.id)], deals: [deal, ...state.deals.filter(item => item.id !== deal.id)] }))
        setDealId(deal.id)
      }
      return { activity: result.sales?.activity || null, warning: result.warning, remainingText: result.remainingText, sentCount: result.sentCount }
    }}
  />{dealId && <Button variant="outline" asChild><Link href={`/vendas/${dealId}`}>Abrir em Vendas</Link></Button>}</div>
}
