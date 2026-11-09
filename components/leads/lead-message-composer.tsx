"use client"

import { ContactMessageComposer } from "@/components/messages/contact-message-composer"
import { sendLeadMessage } from "@/lib/messages/actions"
import { leadMessageValues } from "@/lib/messages/templates"
import type { Lead } from "@/types"

export function LeadMessageComposer({ lead }: { lead: Lead }) {
  return <ContactMessageComposer contact={lead} messageValues={leadMessageValues(lead)} sendMessage={input => sendLeadMessage({ ...input, leadId: lead.id })} />
}
