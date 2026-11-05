"use client"

import { useParams } from "next/navigation"
import { DealDetail } from "@/components/sales/deal-detail"

export default function DealPage() {
  const { id } = useParams<{ id: string }>()
  return <DealDetail id={id} />
}
