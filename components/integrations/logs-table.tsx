"use client"

import { useMemo, useState } from "react"
import { ArrowDownLeft, ArrowUpRight, RotateCw, ScrollText } from "lucide-react"
import { toast } from "@/lib/store/save-feedback"
import { Button } from "@/components/ui/button"
import { DataTable, type ColumnDef } from "@/components/shared/data-table"
import { EmptyState } from "@/components/shared/empty-state"
import { EntityDrawer } from "@/components/shared/entity-drawer"
import { ALL, FilterBar, matches } from "@/components/shared/filter-bar"
import { InfoRow } from "@/components/shared/panel"
import { StatusBadge } from "@/components/shared/status-badge"
import { INTEGRATION_NAME, LOG_STATUS_LABEL, LOG_STATUS_TONE } from "@/components/integrations/meta"
import { copyToClipboard } from "@/lib/browser"
import { retryWebhookAction } from "@/lib/integrations/actions"
import { useCrm, useIntegrationLogs } from "@/lib/data"
import { formatDateTime } from "@/lib/format"
import type { IntegrationKey, IntegrationLog } from "@/types"

function useResend() {
  return async (log: IntegrationLog) => {
    const id = toast.loading(`Reenviando ${log.event}...`)
    try {
      const result = await retryWebhookAction(log.id)
      useCrm.setState({ status: "idle" }); await useCrm.getState().bootstrap()
      if (result.status >= 200 && result.status < 300) toast.success("Evento reenviado", { id })
      else if (result.queued) toast.info("Entrega na fila de novas tentativas automáticas", { id })
      else toast.error("O destino não confirmou o recebimento", { id })
    } catch (error) { toast.error(error instanceof Error ? error.message : "Falha no reenvio", { id }) }
  }
}

function DirectionLabel({ direction }: { direction: IntegrationLog["direction"] }) {
  return direction === "entrada" ? (
    <span className="inline-flex items-center gap-1 text-xs text-info">
      <ArrowDownLeft className="size-3.5" /> Entrada
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 text-xs text-primary">
      <ArrowUpRight className="size-3.5" /> Saída
    </span>
  )
}

function pretty(json: string) {
  try {
    return JSON.stringify(JSON.parse(json), null, 2)
  } catch {
    return json
  }
}

interface LogsTableProps {
  /** Fixa a integração (esconde o filtro). */
  integration?: IntegrationKey
  pageSize?: number
  showFilters?: boolean
}

export function LogsTable({ integration, pageSize = 15, showFilters = true }: LogsTableProps) {
  const logs = useIntegrationLogs()
  const resend = useResend()
  const [search, setSearch] = useState("")
  const [integrationFilter, setIntegrationFilter] = useState(ALL)
  const [status, setStatus] = useState(ALL)
  const [direction, setDirection] = useState(ALL)
  const [openId, setOpenId] = useState<string | null>(null)
  const open = logs.find((l) => l.id === openId)

  const data = useMemo(() => {
    const q = search.trim().toLowerCase()
    return logs
      .filter((l) => (integration ? l.integration === integration : matches(integrationFilter, l.integration)))
      .filter((l) => matches(status, l.status) && matches(direction, l.direction))
      .filter((l) => !q || `${l.event} ${l.payload}`.toLowerCase().includes(q))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  }, [logs, integration, integrationFilter, status, direction, search])

  const filters = [
    ...(integration ? [] : [{ key: "integration", label: "Integração", value: integrationFilter, onChange: setIntegrationFilter, options: (Object.keys(INTEGRATION_NAME) as IntegrationKey[]).map((k) => ({ value: k, label: INTEGRATION_NAME[k] })) }]),
    { key: "status", label: "Status", value: status, onChange: setStatus, options: [{ value: "sucesso", label: "Sucesso" }, { value: "erro", label: "Erro" }, { value: "pendente", label: "Pendente" }] },
    { key: "direction", label: "Direção", value: direction, onChange: setDirection, options: [{ value: "entrada", label: "Entrada" }, { value: "saida", label: "Saída" }] },
  ]

  const resendButton = (l: IntegrationLog) => (
    <Button
      variant="outline"
      size="xs"
      onClick={(e) => {
        e.stopPropagation()
        resend(l)
      }}
    >
      <RotateCw /> Reenviar
    </Button>
  )

  const columns: ColumnDef<IntegrationLog, unknown>[] = [
    { accessorKey: "createdAt", header: "Data/hora", cell: ({ row }) => <span className="num text-xs whitespace-nowrap">{formatDateTime(row.original.createdAt)}</span> },
    ...(integration ? [] : [{ accessorKey: "integration", header: "Integração", cell: ({ row }) => <span className="text-sm">{INTEGRATION_NAME[row.original.integration]}</span> } as ColumnDef<IntegrationLog, unknown>]),
    { accessorKey: "event", header: "Evento", cell: ({ row }) => <span className="num text-xs">{row.original.event}</span> },
    { accessorKey: "direction", header: "Direção", cell: ({ row }) => <DirectionLabel direction={row.original.direction} /> },
    {
      accessorKey: "status",
      header: "Status",
      cell: ({ row }) => (
        <span className="inline-flex items-center gap-2">
          <StatusBadge tone={LOG_STATUS_TONE[row.original.status]}>{LOG_STATUS_LABEL[row.original.status]}</StatusBadge>
          {row.original.statusCode > 0 && <span className="num text-xs text-muted-foreground">{row.original.statusCode}</span>}
        </span>
      ),
    },
    { accessorKey: "attempts", header: "Tentativas", cell: ({ row }) => <span className="num text-xs">{row.original.attempts}</span> },
    { id: "actions", header: "", enableSorting: false, cell: ({ row }) => (row.original.status === "erro" && row.original.integration === "n8n" && row.original.direction === "saida" ? resendButton(row.original) : null) },
  ]

  return (
    <>
      {showFilters && <FilterBar search={search} onSearch={setSearch} searchPlaceholder="Buscar evento ou payload" filters={filters} onClear={() => { setSearch(""); setIntegrationFilter(ALL); setStatus(ALL); setDirection(ALL) }} />}
      <DataTable
        columns={columns}
        data={data}
        getRowId={(l) => l.id}
        pageSize={pageSize}
        onRowClick={(l) => setOpenId(l.id)}
        empty={<EmptyState icon={ScrollText} title="Nenhum evento registrado" description="Os envios e recebimentos das integrações aparecem aqui." compact />}
        mobileCard={(l) => (
          <div className="space-y-1.5">
            <div className="flex items-center justify-between gap-2">
              <span className="num truncate text-xs">{l.event}</span>
              <StatusBadge tone={LOG_STATUS_TONE[l.status]}>{LOG_STATUS_LABEL[l.status]}</StatusBadge>
            </div>
            <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
              <span>{INTEGRATION_NAME[l.integration]}</span>
              <span className="num">{formatDateTime(l.createdAt)}</span>
            </div>
            <div className="flex items-center justify-between">
              <DirectionLabel direction={l.direction} />
              {l.status === "erro" && l.integration === "n8n" && l.direction === "saida" && resendButton(l)}
            </div>
          </div>
        )}
      />
      <EntityDrawer
        open={!!open}
        onOpenChange={(o) => !o && setOpenId(null)}
        title={<span className="num">{open?.event}</span>}
        badge={open && <StatusBadge tone={LOG_STATUS_TONE[open.status]}>{LOG_STATUS_LABEL[open.status]}</StatusBadge>}
        description={open ? `${INTEGRATION_NAME[open.integration]} · ${formatDateTime(open.createdAt)}` : undefined}
        footer={
          open && (
            <>
              <Button variant="outline" onClick={() => copyToClipboard(open.payload, "Payload copiado")}>
                Copiar payload
              </Button>
              <Button disabled={open.integration !== "n8n" || open.direction !== "saida" || open.status !== "erro"} onClick={() => resend(open)}>
                <RotateCw /> Reenviar
              </Button>
            </>
          )
        }
      >
        {open && (
          <div className="space-y-4">
            <div className="divide-y rounded-lg border bg-surface px-3">
              <InfoRow label="Direção">
                <DirectionLabel direction={open.direction} />
              </InfoRow>
              <InfoRow label="Código HTTP" mono>
                {open.statusCode || "—"}
              </InfoRow>
              <InfoRow label="Tentativas" mono>
                {open.attempts}
              </InfoRow>
              <InfoRow label="Próxima tentativa">{open.queueState === "processing" ? "Em processamento" : open.nextAttemptAt ? formatDateTime(open.nextAttemptAt) : open.queueState === "failed" ? "Revisão e reenvio manual necessários" : "—"}</InfoRow>
              <InfoRow label="ID" mono>
                {open.id}
              </InfoRow>
            </div>
            <div className="space-y-1.5">
              <p className="text-xs font-medium text-muted-foreground">Payload</p>
              <pre className="num max-h-72 overflow-auto rounded-lg border bg-surface p-3 text-xs leading-relaxed">{pretty(open.payload)}</pre>
            </div>
            <div className="space-y-1.5">
              <p className="text-xs font-medium text-muted-foreground">Resposta</p>
              <pre className={`num max-h-48 overflow-auto rounded-lg border bg-surface p-3 text-xs leading-relaxed ${open.status === "erro" ? "text-danger" : ""}`}>{pretty(open.response)}</pre>
            </div>
          </div>
        )}
      </EntityDrawer>
    </>
  )
}
