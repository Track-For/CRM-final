"use client"

import Link from "next/link"
import { Button } from "@/components/ui/button"
import { WhatsappConnectionCard } from "@/components/whatsapp/connection-card"

export function EvolutionConfig() {
  return <div className="space-y-4"><WhatsappConnectionCard /><Button variant="outline" asChild><Link href="/whatsapp">Abrir conversas do WhatsApp</Link></Button></div>
}
