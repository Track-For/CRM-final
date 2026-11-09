"use client"

import { useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { Download, MessageCircle, Plus, Upload, UserRound } from "lucide-react"
import { toast } from "@/lib/store/save-feedback"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { DataTable, type ColumnDef } from "@/components/shared/data-table"
import { EmptyState } from "@/components/shared/empty-state"
import { ALL, FilterBar, matches } from "@/components/shared/filter-bar"
import { PageHeader } from "@/components/shared/page-header"
import { StatCard, StatGrid } from "@/components/shared/stat-card"
import { EnumBadge, StatusBadge } from "@/components/shared/status-badge"
import { UserAvatar } from "@/components/shared/user-avatar"
import { LeadFormDialog } from "@/components/forms/lead-form-dialog"
import { ImportCsvDialog } from "@/components/leads/import-csv-dialog"
import {
  LEAD_STATUS_LABEL,
  LEAD_STATUS_TONE,
  PROJECT_TYPE_LABEL,
  REVENUE_LABEL,
  SOURCE_LABEL,
  TEMPERATURE_LABEL,
  TEMPERATURE_TONE,
  toOptions,
} from "@/lib/constants"
import { useById, useCrm, useLeads } from "@/lib/data"
import { useEntityOptions } from "@/lib/data/options"
import { downloadCsv } from "@/lib/browser"
import { formatDate, formatNumber, formatPercent, whatsappLink } from "@/lib/format"
import { getPeriodRange, inRange, PERIOD_LABEL, type PeriodPreset } from "@/lib/period"
import { useUiStore } from "@/lib/store/ui-store"
import type { Lead, LeadStatus } from "@/types"

const PERIOD_OPTIONS = (Object.keys(PERIOD_LABEL) as PeriodPreset[]).map((p) => ({ value: p, label: PERIOD_LABEL[p] }))

export function LeadsList() {
  const router = useRouter()
  const leads = useLeads()
  const users = useById("users")
  const update = useCrm((s) => s.update)
  const { userOptions } = useEntityOptions()
  const globalPeriod = useUiStore((s) => s.period)

  const [search, setSearch] = useState("")
  const [source, setSource] = useState(ALL)
  const [projectType, setProjectType] = useState(ALL)
  const [revenue, setRevenue] = useState(ALL)
  const [temperature, setTemperature] = useState(ALL)
  const [owner, setOwner] = useState(ALL)
  const [status, setStatus] = useState(ALL)
  const [period, setPeriod] = useState(ALL)
  const [formOpen, setFormOpen] = useState(false)
  const [importOpen, setImportOpen] = useState(false)

  const clearFilters = () => {
    setSearch("")
    setSource(ALL)
    setProjectType(ALL)
    setRevenue(ALL)
    setTemperature(ALL)
    setOwner(ALL)
    setStatus(ALL)
    setPeriod(ALL)
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    const range = period !== ALL ? getPeriodRange(period as PeriodPreset) : null
    return leads
      .filter((l) => {
        if (q && !`${l.name} ${l.company} ${l.email} ${l.whatsapp}`.toLowerCase().includes(q)) return false
        if (range && !inRange(l.createdAt, range.from, range.to)) return false
        return (
          matches(source, l.source) &&
          matches(projectType, l.projectType) &&
          matches(revenue, l.revenue) &&
          matches(temperature, l.temperature) &&
          matches(owner, l.ownerId) &&
          matches(status, l.status)
        )
      })
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  }, [leads, search, source, projectType, revenue, temperature, owner, status, period])

  const kpis = useMemo(() => {
    const range = getPeriodRange(globalPeriod)
    const inPeriod = leads.filter((l) => inRange(l.createdAt, range.from, range.to))
    const converted = inPeriod.filter((l) => l.status === "convertido").length
    return {
      total: inPeriod.length,
      hot: leads.filter((l) => l.temperature === "quente" && l.status !== "convertido" && l.status !== "perdido").length,
      fresh: leads.filter((l) => l.status === "novo").length,
      conversion: inPeriod.length ? converted / inPeriod.length : 0,
      label: range.label,
    }
  }, [leads, globalPeriod])

  const columns = useMemo<ColumnDef<Lead, unknown>[]>(
    () => [
      {
        accessorKey: "name",
        header: "Lead",
        cell: ({ row }) => (
          <div className="min-w-0">
            <p className="truncate font-medium">{row.original.name}</p>
            <p className="truncate text-xs text-muted-foreground">{row.original.company || "Sem empresa"}</p>
          </div>
        ),
      },
      {
        accessorKey: "whatsapp",
        header: "WhatsApp",
        enableSorting: false,
        cell: ({ row }) => (
          <a
            href={whatsappLink(row.original.whatsapp)}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="num inline-flex items-center gap-1.5 text-xs hover:text-primary"
          >
            <MessageCircle className="size-3.5 text-success" />
            {row.original.whatsapp}
          </a>
        ),
      },
      { accessorKey: "projectType", header: "Projeto", cell: ({ row }) => <span className="text-xs">{PROJECT_TYPE_LABEL[row.original.projectType]}</span> },
      { accessorKey: "source", header: "Origem", cell: ({ row }) => <span className="text-xs">{SOURCE_LABEL[row.original.source]}</span> },
      {
        accessorKey: "temperature",
        header: "Temperatura",
        cell: ({ row }) => <EnumBadge value={row.original.temperature} labels={TEMPERATURE_LABEL} tones={TEMPERATURE_TONE} />,
      },
      { accessorKey: "status", header: "Status", cell: ({ row }) => <EnumBadge value={row.original.status} labels={LEAD_STATUS_LABEL} tones={LEAD_STATUS_TONE} /> },
      {
        id: "owner",
        accessorFn: (l) => users.get(l.ownerId)?.name ?? "",
        header: "Responsável",
        cell: ({ row }) => <UserAvatar userId={row.original.ownerId} showName />,
      },
      { accessorKey: "createdAt", header: "Entrada", cell: ({ row }) => <span className="num text-xs text-muted-foreground">{formatDate(row.original.createdAt)}</span> },
    ],
    [users],
  )

  const exportRows = (rows: Lead[]) =>
    downloadCsv(
      "leads-nexo-crm",
      rows.map((l) => ({
        Nome: l.name,
        WhatsApp: l.whatsapp,
        "E-mail": l.email,
        Empresa: l.company,
        "Tipo de projeto": PROJECT_TYPE_LABEL[l.projectType],
        Faturamento: REVENUE_LABEL[l.revenue],
        Origem: SOURCE_LABEL[l.source],
        Temperatura: TEMPERATURE_LABEL[l.temperature],
        Status: LEAD_STATUS_LABEL[l.status],
        Responsável: users.get(l.ownerId)?.name ?? "",
        "UTM source": l.utm.source ?? "",
        "UTM medium": l.utm.medium ?? "",
        "UTM campaign": l.utm.campaign ?? "",
        Entrada: formatDate(l.createdAt),
      })),
    )

  const bulkUpdate = (rows: Lead[], patch: Partial<Lead>, message: string, clear: () => void) => {
    const now = new Date().toISOString()
    rows.forEach((l) => update("leads", l.id, { ...patch, updatedAt: now }))
    toast.success(message, { description: `${rows.length} lead(s) atualizado(s)` })
    clear()
  }

  return (
    <>
      <PageHeader
        title="Leads"
        description="Todos os contatos que chegaram pelos anúncios, formulários, WhatsApp e indicações."
        actions={
          <>
            <Button variant="outline" size="sm" onClick={() => setImportOpen(true)}>
              <Upload />
              Importar CSV
            </Button>
            <Button variant="outline" size="sm" onClick={() => exportRows(filtered)}>
              <Download />
              Exportar
            </Button>
            <Button size="sm" onClick={() => setFormOpen(true)}>
              <Plus />
              Novo lead
            </Button>
          </>
        }
      />

      <StatGrid className="mb-6">
        <StatCard label={`Leads · ${kpis.label}`} value={formatNumber(kpis.total)} highlight />
        <StatCard label="Aguardando primeiro contato" value={formatNumber(kpis.fresh)} hint="status Novo" />
        <StatCard label="Leads quentes em aberto" value={formatNumber(kpis.hot)} />
        <StatCard label="Conversão no período" value={formatPercent(kpis.conversion)} />
      </StatGrid>

      <FilterBar
        search={search}
        onSearch={setSearch}
        searchPlaceholder="Buscar por nome, empresa, WhatsApp..."
        onClear={clearFilters}
        filters={[
          { key: "status", label: "Status", options: toOptions(LEAD_STATUS_LABEL), value: status, onChange: setStatus },
          { key: "source", label: "Origem", options: toOptions(SOURCE_LABEL), value: source, onChange: setSource },
          { key: "projectType", label: "Projeto", options: toOptions(PROJECT_TYPE_LABEL), value: projectType, onChange: setProjectType },
          { key: "revenue", label: "Faturamento", options: toOptions(REVENUE_LABEL), value: revenue, onChange: setRevenue },
          { key: "temperature", label: "Temperatura", options: toOptions(TEMPERATURE_LABEL), value: temperature, onChange: setTemperature },
          { key: "owner", label: "Responsável", options: userOptions, value: owner, onChange: setOwner },
          { key: "period", label: "Período", options: PERIOD_OPTIONS, value: period, onChange: setPeriod },
        ]}
      />

      <DataTable
        columns={columns}
        data={filtered}
        getRowId={(l) => l.id}
        selectable
        onRowClick={(l) => router.push(`/leads/${l.id}`)}
        empty={
          <EmptyState
            icon={UserRound}
            title={leads.length ? "Nenhum lead encontrado" : "Nenhum lead cadastrado"}
            description={leads.length ? "Ajuste os filtros ou a busca." : "Cadastre um lead ou importe uma planilha CSV."}
            action={
              leads.length ? (
                <Button size="sm" variant="outline" onClick={clearFilters}>
                  Limpar filtros
                </Button>
              ) : (
                <Button size="sm" onClick={() => setFormOpen(true)}>
                  <Plus />
                  Novo lead
                </Button>
              )
            }
          />
        }
        bulkActions={(rows, clear) => (
          <>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="sm" variant="outline">
                  Atribuir responsável
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuLabel className="text-xs text-muted-foreground">Responsável</DropdownMenuLabel>
                {userOptions.map((u) => (
                  <DropdownMenuItem key={u.value} onSelect={() => bulkUpdate(rows, { ownerId: u.value }, `Atribuído a ${u.label}`, clear)}>
                    {u.label}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="sm" variant="outline">
                  Mudar status
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuLabel className="text-xs text-muted-foreground">Status</DropdownMenuLabel>
                {(Object.keys(LEAD_STATUS_LABEL) as LeadStatus[]).map((s) => (
                  <DropdownMenuItem key={s} onSelect={() => bulkUpdate(rows, { status: s }, `Status alterado para ${LEAD_STATUS_LABEL[s]}`, clear)}>
                    {LEAD_STATUS_LABEL[s]}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
            <Button size="sm" variant="outline" onClick={() => exportRows(rows)}>
              <Download />
              Exportar
            </Button>
          </>
        )}
        mobileCard={(l) => (
          <div className="space-y-2">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate font-medium">{l.name}</p>
                <p className="truncate text-xs text-muted-foreground">{l.company || "Sem empresa"}</p>
              </div>
              <EnumBadge value={l.temperature} labels={TEMPERATURE_LABEL} tones={TEMPERATURE_TONE} />
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              <EnumBadge value={l.status} labels={LEAD_STATUS_LABEL} tones={LEAD_STATUS_TONE} />
              <StatusBadge dot={false}>{PROJECT_TYPE_LABEL[l.projectType]}</StatusBadge>
              <StatusBadge dot={false}>{SOURCE_LABEL[l.source]}</StatusBadge>
            </div>
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span className="num">{l.whatsapp}</span>
              <UserAvatar userId={l.ownerId} size="xs" showName />
            </div>
          </div>
        )}
      />

      <LeadFormDialog open={formOpen} onOpenChange={setFormOpen} />
      <ImportCsvDialog open={importOpen} onOpenChange={setImportOpen} />
    </>
  )
}
