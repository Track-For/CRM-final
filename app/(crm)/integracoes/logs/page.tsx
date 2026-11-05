"use client"

import { PageHeader } from "@/components/shared/page-header"
import { LogsTable } from "@/components/integrations/logs-table"

export default function IntegracoesLogsPage() {
  return (
    <>
      <PageHeader backHref="/integracoes" backLabel="Integrações" title="Log de eventos" description="Tudo que entrou e saiu pelas integrações. Eventos com falha podem ser reenviados." />
      <LogsTable />
    </>
  )
}
