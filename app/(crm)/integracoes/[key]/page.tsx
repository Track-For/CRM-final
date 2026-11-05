"use client"

import { useParams } from "next/navigation"
import { IntegrationDetail } from "@/components/integrations/integration-detail"

export default function IntegracaoPage() {
  const { key } = useParams<{ key: string }>()
  return <IntegrationDetail key={key} integrationKey={key} />
}
