"use client"

import { useState } from "react"
import Link from "next/link"
import { startOfMonth, endOfMonth } from "date-fns"
import { Button } from "@/components/ui/button"
import { PageHeader } from "@/components/shared/page-header"
import { GoogleCalendarConnection } from "./connection-card"

export function GoogleCalendarIntegration() {
  const [now] = useState(() => new Date())
  return <><PageHeader title="Google Agenda" backHref="/integracoes" description="Escolha sua conta Google e a agenda que deseja sincronizar." /><GoogleCalendarConnection from={startOfMonth(now).toISOString()} to={new Date(endOfMonth(now).getTime() + 1).toISOString()} /><Button variant="outline" asChild><Link href="/agenda">Abrir agenda do CRM</Link></Button></>
}
