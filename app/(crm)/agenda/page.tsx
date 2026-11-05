import type { Metadata } from "next"
import { AgendaView } from "@/components/agenda/agenda-view"

export const metadata: Metadata = { title: "Agenda" }

export default async function AgendaPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams
  return <AgendaView googleNotice={typeof params.google === "string" ? params.google : undefined} />
}
