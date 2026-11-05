"use client"

import { useMemo } from "react"
import Link from "next/link"
import { AlertTriangle, ChevronRight, Plug, ScrollText } from "lucide-react"
import { Button } from "@/components/ui/button"
import { PageHeader } from "@/components/shared/page-header"
import { StatCard, StatGrid } from "@/components/shared/stat-card"
import { EnumBadge } from "@/components/shared/status-badge"
import { CATEGORY_LABEL, INTEGRATION_ICON } from "@/components/integrations/meta"
import { INTEGRATION_STATUS_LABEL, INTEGRATION_STATUS_TONE } from "@/lib/constants"
import { useIntegrationLogs, useIntegrations } from "@/lib/data"
import { formatRelative } from "@/lib/format"
import { cn } from "@/lib/utils"
import type { Integration } from "@/types"

type RealStatus = { connected: boolean; updatedAt: string | null }

const withRealStatus = (integration: Integration, real: RealStatus): Integration => ({
  ...integration,
  status: real.connected ? "conectado" : "desconectado",
  errorMessage: undefined,
  lastSyncAt: real.updatedAt ?? undefined,
})

/**
 * `fiscal`: status real do Brasil NFe vindo do banco (sobrepõe o mock quando informado).
 * `asaas`: status real do Asaas. O mock diz "conectado" com uma chave falsa, então ele nunca
 * é usado aqui: sem informação do banco, o card aparece desconectado.
 */
export function IntegrationsOverview({ fiscal, asaas, evolution, googleCalendar }: { fiscal?: RealStatus; asaas?: RealStatus; evolution?: RealStatus; googleCalendar?: RealStatus }) {
  const mockIntegrations = useIntegrations()
  const integrations = useMemo(
    () =>
      mockIntegrations.map((i) => {
        if (i.key === "google_calendar") return { ...withRealStatus(i, googleCalendar ?? { connected: false, updatedAt: null }), description: "Sua conta Google e seus eventos sincronizados na agenda do CRM." }
        if (i.key === "evolution") return { ...withRealStatus(i, evolution ?? { connected: false, updatedAt: null }), description: "Conexão real do WhatsApp por QR Code e recebimento de mensagens." }
        if (i.key === "asaas") return { ...withRealStatus(i, asaas ?? { connected: false, updatedAt: null }), description: "Emissão de boleto registrado, com baixa automática." }
        if (i.key === "brasil_nfe" && fiscal) return withRealStatus(i, fiscal)
        return i
      }),
    [mockIntegrations, fiscal, asaas, evolution, googleCalendar],
  )
  const logs = useIntegrationLogs()
  const connected = integrations.filter((i) => i.status === "conectado").length
  const errors = integrations.filter((i) => i.status === "erro").length
  const failedLogs = logs.filter((l) => l.status === "erro").length

  return (
    <>
      <PageHeader
        title="Integrações"
        description="Conecte automações, WhatsApp, anúncios, agenda, pagamentos e emissão fiscal."
        actions={
          <Button variant="outline" asChild>
            <Link href="/integracoes/logs">
              <ScrollText /> Log de eventos
            </Link>
          </Button>
        }
      />
      <StatGrid className="mb-6">
        <StatCard label="Conectadas" value={`${connected}/${integrations.length}`} icon={Plug} highlight />
        <StatCard label="Com erro" value={errors} hint={errors ? "precisam de atenção" : "tudo certo"} />
        <StatCard label="Eventos registrados" value={logs.length} hint="últimos envios e recebimentos" />
        <StatCard label="Eventos com falha" value={failedLogs} hint="podem ser reenviados" />
      </StatGrid>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {integrations.map((i) => {
          const Icon = INTEGRATION_ICON[i.key]
          return (
            <Link
              key={i.key}
              href={`/integracoes/${i.key}`}
              className={cn("group flex flex-col gap-4 rounded-xl border bg-card p-4 transition-colors hover:border-[#333]", i.status === "erro" && "border-[#4a1818]")}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="flex size-10 items-center justify-center rounded-lg border bg-surface">
                    <Icon className={cn("size-5", i.status === "conectado" ? "text-primary" : "text-muted-foreground")} />
                  </div>
                  <div>
                    <p className="font-semibold">{i.name}</p>
                    <p className="text-xs text-muted-foreground">{CATEGORY_LABEL[i.category]}</p>
                  </div>
                </div>
                <EnumBadge value={i.status} labels={INTEGRATION_STATUS_LABEL} tones={INTEGRATION_STATUS_TONE} />
              </div>
              <p className="flex-1 text-sm text-muted-foreground">{i.description}</p>
              {i.status === "erro" && i.errorMessage && (
                <p className="flex items-start gap-2 rounded-lg border border-[#4a1818] bg-danger-soft p-2 text-xs text-danger">
                  <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
                  {i.errorMessage}
                </p>
              )}
              <div className="flex items-center justify-between border-t pt-3 text-xs text-muted-foreground">
                <span>{i.lastSyncAt ? `Sincronizado ${formatRelative(i.lastSyncAt)}` : "Nunca sincronizado"}</span>
                <span className="inline-flex items-center gap-1 text-foreground group-hover:text-primary">
                  Configurar <ChevronRight className="size-3.5" />
                </span>
              </div>
            </Link>
          )
        })}
      </div>
    </>
  )
}
