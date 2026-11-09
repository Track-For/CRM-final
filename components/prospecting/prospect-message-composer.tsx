"use client"

import { ContactMessageComposer } from "@/components/messages/contact-message-composer"
import { sendProspectMessage } from "@/lib/messages/prospect-actions"
import { prospectMessageValues } from "@/lib/messages/templates"
import type { ProspectDetail } from "@/lib/prospecting/types"

export function ProspectMessageComposer({ prospect, disabled, onSent }: { prospect: ProspectDetail; disabled?: boolean; onSent: (updated: ProspectDetail) => void }) {
  return <ContactMessageComposer
    contact={{ name: prospect.nome, email: prospect.email || "", whatsapp: prospect.whatsapp || prospect.telefone || "" }}
    messageValues={prospectMessageValues(prospect)}
    disabled={disabled || prospect.nao_contatar}
    notice={prospect.nao_contatar ? "Esta empresa está marcada para não receber contato." : !prospect.whatsapp && prospect.telefone ? "O número disponível é o telefone cadastrado da empresa; WhatsApp ainda não confirmado." : undefined}
    sendMessage={async input => {
      const result = await sendProspectMessage({ ...input, prospectId: prospect.id })
      if (result.prospect) onSent(result.prospect)
      return { activity: null, warning: result.warning }
    }}
  />
}
