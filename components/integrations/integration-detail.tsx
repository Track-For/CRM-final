"use client"

import Link from "next/link"
import { AlertTriangle, PlugZap, ScrollText, Unplug } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { EmptyState } from "@/components/shared/empty-state"
import { PageHeader } from "@/components/shared/page-header"
import { EnumBadge } from "@/components/shared/status-badge"
import { GoogleCalendarIntegration } from "@/components/google-calendar/integration"
import { EvolutionConfig } from "@/components/integrations/evolution-config"
import { GenericConfig } from "@/components/integrations/generic-config"
import { LogsTable } from "@/components/integrations/logs-table"
import { CATEGORY_LABEL, INTEGRATION_ICON } from "@/components/integrations/meta"
import { N8nConfig } from "@/components/integrations/n8n-config"
import { INTEGRATION_STATUS_LABEL, INTEGRATION_STATUS_TONE } from "@/lib/constants"
import { useCrm, useIntegrations } from "@/lib/data"
import { formatRelative } from "@/lib/format"
import type { Integration } from "@/types"

export function IntegrationDetail({ integrationKey }: { integrationKey: string }) {
  const integration = useIntegrations().find((i) => i.key === integrationKey)
  const updateIntegration = useCrm((s) => s.updateIntegration)

  if (integrationKey === "google_calendar") return <GoogleCalendarIntegration />

  if (!integration) {
    return (
      <EmptyState
        title="Integração não encontrada"
        action={
          <Button asChild size="sm" variant="outline">
            <Link href="/integracoes">Voltar para integrações</Link>
          </Button>
        }
      />
    )
  }

  const Icon = INTEGRATION_ICON[integration.key]
  const connect = () => {
    const missing = Object.values(integration.config).some((v) => !v.trim())
    if (missing) {
      toast.error("Preencha e salve as credenciais antes de conectar")
      return
    }
    updateIntegration(integration.key, { status: "conectado", errorMessage: undefined, lastSyncAt: new Date().toISOString() })
    toast.success(`${integration.name} conectado`)
  }
  const disconnect = () => {
    updateIntegration(integration.key, { status: "desconectado" })
    toast.success(`${integration.name} desconectado`)
  }

  return (
    <>
      <PageHeader
        backHref="/integracoes"
        backLabel="Integrações"
        title={
          <span className="inline-flex items-center gap-3">
            <span className="flex size-9 items-center justify-center rounded-lg border bg-surface">
              <Icon className="size-4.5 text-primary" />
            </span>
            {integration.name}
          </span>
        }
        description={
          <span className="inline-flex flex-wrap items-center gap-2">
            {integration.key !== "evolution" && <EnumBadge value={integration.status} labels={INTEGRATION_STATUS_LABEL} tones={INTEGRATION_STATUS_TONE} />}
            <span>{CATEGORY_LABEL[integration.category]}</span>
            {integration.key !== "evolution" && integration.lastSyncAt && <span>· sincronizado {formatRelative(integration.lastSyncAt)}</span>}
          </span>
        }
        actions={
          <>
            <Button variant="outline" size="sm" asChild>
              <Link href="/integracoes/logs">
                <ScrollText /> Log geral
              </Link>
            </Button>
            {integration.key !== "evolution" && (integration.status === "conectado" ? (
              <Button variant="outline" size="sm" onClick={disconnect}>
                <Unplug /> Desconectar
              </Button>
            ) : (
              <Button size="sm" onClick={connect}>
                <PlugZap /> {integration.status === "erro" ? "Reconectar" : "Conectar"}
              </Button>
            ))}
          </>
        }
      />

      {integration.status === "erro" && (
        <div className="mb-6 flex items-start gap-3 rounded-xl border border-[#4a1818] bg-danger-soft p-4 text-sm">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-danger" />
          <div>
            <p className="font-medium text-danger">Falha na integração</p>
            <p className="text-muted-foreground">{integration.errorMessage ?? "Verifique as credenciais e reconecte."}</p>
          </div>
        </div>
      )}

      <IntegrationBody integration={integration} />
    </>
  )
}

function IntegrationBody({ integration }: { integration: Integration }) {
  if (integration.key === "n8n") return <N8nConfig integration={integration} />
  if (integration.key === "evolution") return <EvolutionConfig />
  return (
    <div className="space-y-6">
      <GenericConfig integration={integration} />
      <div className="space-y-3">
        <h2 className="text-sm font-semibold">Eventos recentes</h2>
        <LogsTable integration={integration.key} pageSize={8} showFilters={false} />
      </div>
    </div>
  )
}
