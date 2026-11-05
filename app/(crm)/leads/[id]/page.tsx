"use client"

import { useParams } from "next/navigation"
import { LeadDetail } from "@/components/leads/lead-detail"

export default function LeadPage() {
  const { id } = useParams<{ id: string }>()
  return <LeadDetail id={id} />
}
