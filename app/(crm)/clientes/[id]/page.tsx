"use client"

import { useParams, useSearchParams } from "next/navigation"
import { ClientDetail } from "@/components/clients/client-detail"

export default function ClientePage() {
  const { id } = useParams<{ id: string }>()
  const projectId = useSearchParams().get("projeto") || undefined
  return <ClientDetail key={`${id}:${projectId || ""}`} id={id} initialProjectId={projectId} />
}
