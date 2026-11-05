"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import Link from "next/link"
import { Ban, FileCheck2, Loader2, Plus, Receipt, Settings2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { DataTable, type ColumnDef } from "@/components/shared/data-table"
import { EmptyState } from "@/components/shared/empty-state"
import { ALL, FilterBar, matches } from "@/components/shared/filter-bar"
import { PageHeader } from "@/components/shared/page-header"
import { StatCard, StatGrid } from "@/components/shared/stat-card"
import { EnumBadge } from "@/components/shared/status-badge"
import { ConnectFiscalState, HomologationBanner } from "@/components/invoices/fiscal-banners"
import { FISCAL_STATUS_LABEL, FISCAL_STATUS_TONE, PENDING_STATUSES, issOf } from "@/components/invoices/fiscal-meta"
import { InvoiceDrawer } from "@/components/invoices/invoice-drawer"
import { InvoiceFormDialog } from "@/components/invoices/invoice-form-dialog"
import { refreshInvoiceAction, type FiscalSettingsView, type InvoiceView } from "@/lib/fiscal/actions"
import { toOptions } from "@/lib/constants"
import { sum } from "@/lib/data/selectors"
import { formatDate, formatMoney, maskDocument } from "@/lib/format"
import { getPeriodRange, inRange } from "@/lib/period"
import { useUiStore } from "@/lib/store/ui-store"

const POLL_MS = 10_000

interface InvoicesViewProps {
  initialInvoices: InvoiceView[]
  settings: FiscalSettingsView | null
  /** Erro ao carregar do servidor (ex.: sem permissão). */
  loadError?: string
  errorTitle?: string
}

const dateOf = (i: InvoiceView) => i.issuedAt ?? i.createdAt

export function InvoicesView({ initialInvoices, settings, loadError, errorTitle }: InvoicesViewProps) {
  // Notas atualizadas no cliente (emissão, consulta, cancelamento) por cima da lista do servidor.
  const [local, setLocal] = useState<Record<string, InvoiceView>>({})
  const period = useUiStore((s) => s.period)
  const [search, setSearch] = useState("")
  const [status, setStatus] = useState(ALL)
  const [formOpen, setFormOpen] = useState(false)
  const [invoiceId, setInvoiceId] = useState<string | null>(null)

  const invoices = useMemo(() => {
    const byId = new Map(initialInvoices.map((i) => [i.id, i]))
    for (const inv of Object.values(local)) {
      const server = byId.get(inv.id)
      if (!server || inv.updatedAt >= server.updatedAt) byId.set(inv.id, inv)
    }
    return [...byId.values()]
  }, [initialInvoices, local])

  const upsert = (inv: InvoiceView) => setLocal((m) => ({ ...m, [inv.id]: inv }))

  const pendingIds = invoices.filter((i) => PENDING_STATUSES.includes(i.status)).map((i) => i.id)
  const pendingKey = pendingIds.join(",")

  // Consulta automática das notas em processamento/cancelamento enquanto a tela estiver aberta.
  const polling = useRef(false)
  useEffect(() => {
    if (!pendingKey) return
    const ids = pendingKey.split(",")
    const timer = window.setInterval(async () => {
      if (polling.current || document.hidden) return
      polling.current = true
      try {
        for (const id of ids) {
          const res = await refreshInvoiceAction(id).catch(() => null)
          if (res?.invoice) setLocal((m) => ({ ...m, [res.invoice!.id]: res.invoice! }))
        }
      } finally {
        polling.current = false
      }
    }, POLL_MS)
    return () => window.clearInterval(timer)
  }, [pendingKey])

  const range = getPeriodRange(period)
  const issued = invoices.filter((i) => i.status === "emitida" && i.issuedAt && inRange(i.issuedAt, range.from, range.to))
  const issuedValue = sum(issued, (i) => i.amount)

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    const qDigits = q.replace(/\D/g, "")
    return invoices.filter((i) => {
      if (!matches(status, i.status)) return false
      if (!q) return true
      const text = `${i.number ?? ""} ${i.tomador.name}`.toLowerCase()
      return text.includes(q) || (qDigits.length >= 3 && i.tomador.document.includes(qDigits))
    })
  }, [invoices, search, status])

  const columns = useMemo<ColumnDef<InvoiceView, unknown>[]>(
    () => [
      { id: "number", header: "Número", accessorFn: (i) => Number(i.number) || 0, cell: ({ row }) => <span className="num font-medium">{row.original.number ?? "—"}</span> },
      {
        id: "client",
        header: "Tomador",
        accessorFn: (i) => i.tomador.name,
        cell: ({ row }) => (
          <div className="min-w-0 max-w-72">
            <p className="truncate font-medium">{row.original.tomador.name}</p>
            <p className="num truncate text-xs text-muted-foreground">{maskDocument(row.original.tomador.document)}</p>
          </div>
        ),
      },
      { id: "service", header: "Serviço", enableSorting: false, cell: ({ row }) => <span className="block max-w-64 truncate text-xs text-muted-foreground">{row.original.serviceDescription}</span> },
      { id: "amount", header: "Valor", accessorFn: (i) => i.amount, cell: ({ row }) => <span className="num font-medium">{formatMoney(row.original.amount)}</span> },
      { id: "date", header: "Data", accessorFn: dateOf, cell: ({ row }) => <span className="num text-xs">{formatDate(dateOf(row.original))}</span> },
      {
        id: "status",
        header: "Status",
        accessorFn: (i) => i.status,
        cell: ({ row }) => (
          <span className="inline-flex items-center gap-1.5">
            <EnumBadge value={row.original.status} labels={FISCAL_STATUS_LABEL} tones={FISCAL_STATUS_TONE} />
            {row.original.environment === "homologacao" && <span className="text-[10px] text-muted-foreground">teste</span>}
          </span>
        ),
      },
    ],
    [],
  )

  const connected = Boolean(settings?.connected)
  const selected = invoiceId ? (invoices.find((i) => i.id === invoiceId) ?? null) : null

  return (
    <>
      <PageHeader
        title="Notas fiscais"
        description="NFS-e emitidas para os clientes via Brasil NFe."
        actions={
          settings && (
            <>
              <Button variant="outline" size="icon" asChild aria-label="Configurar Brasil NFe" title="Configurar Brasil NFe">
                <Link href="/integracoes/brasil_nfe">
                  <Settings2 />
                </Link>
              </Button>
              <Button onClick={() => setFormOpen(true)} disabled={!connected}>
                <Plus />
                Emitir NFS-e
              </Button>
            </>
          )
        }
      />

      {loadError || !settings ? (
        <EmptyState icon={Ban} title={errorTitle ?? "Não foi possível carregar as notas"} description={loadError ?? "Tente recarregar a página."} />
      ) : (
        <div className="space-y-4">
          {connected && settings.environment === "homologacao" && <HomologationBanner />}
          {!connected && invoices.length === 0 ? (
            <ConnectFiscalState />
          ) : (
            <>
              {!connected && <ConnectFiscalState className="p-6" />}
              <StatGrid>
                <StatCard label={`Emitido · ${range.label.toLowerCase()}`} value={formatMoney(issuedValue)} icon={FileCheck2} highlight hint={`${issued.length} nota(s)`} />
                <StatCard label="ISS do período" value={formatMoney(sum(issued, issOf))} icon={Receipt} hint="Calculado pela prefeitura" />
                <StatCard label="Processando" value={pendingIds.length} icon={Loader2} hint="aguardando prefeitura" />
                <StatCard label="Rejeitadas" value={invoices.filter((i) => i.status === "rejeitada").length} icon={Ban} hint="precisam de correção" />
              </StatGrid>
              <div>
                <FilterBar
                  search={search}
                  onSearch={setSearch}
                  searchPlaceholder="Buscar por número, tomador ou CPF/CNPJ"
                  filters={[{ key: "status", label: "Status", options: toOptions(FISCAL_STATUS_LABEL), value: status, onChange: setStatus }]}
                  onClear={() => {
                    setSearch("")
                    setStatus(ALL)
                  }}
                />
                <DataTable
                  columns={columns}
                  data={filtered}
                  getRowId={(i) => i.id}
                  onRowClick={(i) => setInvoiceId(i.id)}
                  initialSorting={[{ id: "date", desc: true }]}
                  empty={
                    <EmptyState
                      icon={Receipt}
                      title={invoices.length ? "Nenhuma nota encontrada" : "Nenhuma nota emitida ainda"}
                      description={invoices.length ? "Ajuste a busca ou os filtros." : "Clique em Emitir NFS-e para enviar a primeira nota."}
                      compact
                    />
                  }
                  mobileCard={(i) => (
                    <div className="space-y-1.5">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="truncate font-medium">{i.tomador.name}</p>
                          <p className="num text-xs text-muted-foreground">
                            {i.number ? `NFS-e ${i.number}` : "Sem número"} · {formatDate(dateOf(i))}
                          </p>
                        </div>
                        <EnumBadge value={i.status} labels={FISCAL_STATUS_LABEL} tones={FISCAL_STATUS_TONE} />
                      </div>
                      <p className="num text-right text-sm font-semibold">{formatMoney(i.amount)}</p>
                    </div>
                  )}
                />
              </div>
            </>
          )}
        </div>
      )}

      {settings && connected && (
        <InvoiceFormDialog
          open={formOpen}
          onOpenChange={setFormOpen}
          settings={settings}
          onSaved={(inv) => {
            upsert(inv)
            setInvoiceId(inv.id)
          }}
        />
      )}
      {settings && <InvoiceDrawer invoice={selected} onOpenChange={(o) => !o && setInvoiceId(null)} settings={settings} onChange={upsert} />}
    </>
  )
}
