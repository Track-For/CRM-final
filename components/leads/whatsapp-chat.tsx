"use client"

import { WhatsappThread } from "@/components/whatsapp/thread"
import type { Lead } from "@/types"

export function WhatsappChat({ lead, className }: { lead: Lead; className?: string }) {
  return <WhatsappThread key={lead.whatsapp} phone={lead.whatsapp} name={lead.name} className={className} />
}
