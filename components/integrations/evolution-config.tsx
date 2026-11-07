"use client"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { WhatsappConnectionCard } from "@/components/whatsapp/connection-card"
import { AiProviderCard } from "@/components/whatsapp/ai-provider-card"
import { HermesAccessCard } from "@/components/whatsapp/hermes-access-card"
import { useUiStore } from "@/lib/store/ui-store"
export function EvolutionConfig() {
  const canManage = useUiStore(state => state.role === "admin")
  return <div className="space-y-5"><Button variant="outline" asChild><Link href="/whatsapp">Voltar às conversas</Link></Button><WhatsappConnectionCard canManage={canManage} />{canManage && <><AiProviderCard /><HermesAccessCard /></>}</div>
}
