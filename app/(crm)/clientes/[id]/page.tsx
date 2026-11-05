"use client"

import { useParams } from "next/navigation"
import { ClientDetail } from "@/components/clients/client-detail"

export default function ClientePage() {
  const { id } = useParams<{ id: string }>()
  return <ClientDetail id={id} />
}
