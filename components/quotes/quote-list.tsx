"use client"

import { useMemo, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { CheckCircle2, Clock, FileText, Plus, Send } from "lucide-react"
import { Button } from "@/components/ui/button"
import { DataTable, type ColumnDef } from "@/components/shared/data-table"
import { EmptyState } from "@/components/shared/empty-state"
import { ALL, FilterBar, matches } from "@/components/shared/filter-bar"
import { PageHeader } from "@/components/shared/page-header"
import { StatCard, StatGrid } from "@/components/shared/stat-card"
import { EnumBadge } from "@/components/shared/status-badge"
import { UserAvatar } from "@/components/shared/user-avatar"
import { QUOTE_STATUS_LABEL, QUOTE_STATUS_TONE, toOptions } from "@/lib/constants"
import { useById, useCatalog, useQuotes } from "@/lib/data"
import { useEntityOptions } from "@/lib/data/options"
import { daysUntil, formatDate, formatMoney, formatPercent } from "@/lib/format"
import { cn } from "@/lib/utils"
import type { Quote } from "@/types"
import { partyLabel } from "./quote-utils"

export function QuoteList() {
  const router = useRouter()
  const quotes = useQuotes()
  const leads = useById("leads")
  const clients = useById("clients")
  const catalog = useCatalog()
  const { userOptions } = useEntityOptions()
  const [search, setSearch] = useState("")
  const [status, setStatus] = useState(ALL)
  const [owner, setOwner] = useState(ALL)
  const [item, setItem] = useState(ALL)

  const catalogName = useMemo(() => new Map(catalog.map((c) => [c.id, c.name])), [catalog])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return [...quotes]
      .filter((quote) => matches(status, quote.status) && matches(owner, quote.ownerId) && matches(item, quote.catalogItemId))
      .filter((quote) => {
        if (!q) return true
        const party = partyLabel(quote, leads, clients)
        return [quote.number, party.name, party.hint, catalogName.get(quote.catalogItemId)].some((v) => v?.toLowerCase().includes(q))
      })
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  }, [quotes, search, status, owner, item, leads, clients, catalogName])

  const kpis = useMemo(() => {
    const open = quotes.filter((q) => q.status === "enviado" || q.status === "visualizado")
    const decided = quotes.filter((q) => q.status === "aceito" || q.status === "recusado" || q.status === "expirado")
    const accepted = quotes.filter((q) => q.status === "aceito")
    return {
      openValue: open.reduce((s, q) => s + q.total, 0),
      openCount: open.length,
      acceptedValue: accepted.reduce((s, q) => s + q.total, 0),
      acceptedCount: accepted.length,
      rate: decided.length ? accepted.length / decided.length : 0,
      drafts: quotes.filter((q) => q.status === "rascunho").length,
    }
  }, [quotes])

  const columns = useMemo<ColumnDef<Quote, unknown>[]>(
    () => [
      { accessorKey: "number", header: "Número", cell: ({ row }) => <span className="num text-xs text-muted-foreground">{row.original.number}</span> },
      {
        id: "party",
        header: "Cliente / lead",
        accessorFn: (q) => partyLabel(q, leads, clients).name,
        cell: ({ row }) => {
          const p = partyLabel(row.original, leads, clients)
          return (
            <div className="min-w-0">
              <p className="truncate font-medium">{p.name}</p>
              <p className="truncate text-xs text-muted-foreground">{p.hint}</p>
            </div>
          )
        },
      },
      { id: "item", header: "Projeto", accessorFn: (q) => catalogName.get(q.catalogItemId) ?? "—", cell: ({ getValue }) => <span className="text-sm">{String(getValue())}</span> },
      { accessorKey: "status", header: "Status", cell: ({ row }) => <EnumBadge value={row.original.status} labels={QUOTE_STATUS_LABEL} tones={QUOTE_STATUS_TONE} /> },
      { accessorKey: "total", header: "Valor", cell: ({ row }) => <span className="num font-medium">{formatMoney(row.original.total)}</span> },
      {
        accessorKey: "monthlyFee",
        header: "Mensalidade",
        cell: ({ row }) => <span className="num text-muted-foreground">{row.original.monthlyFee ? `${formatMoney(row.original.monthlyFee)}/mês` : "—"}</span>,
      },
      { accessorKey: "validUntil", header: "Validade", cell: ({ row }) => <Validity quote={row.original} /> },
      { accessorKey: "ownerId", header: "Responsável", cell: ({ row }) => <UserAvatar userId={row.original.ownerId} showName /> },
    ],
    [leads, clients, catalogName],
  )

  const clear = () => {
    setSearch("")
    setStatus(ALL)
    setOwner(ALL)
    setItem(ALL)
  }

  return (
    <div>
      <PageHeader
        title="Orçamentos"
        description="Propostas de precificação enviadas pelo WhatsApp"
        actions={
          <Button asChild>
            <Link href="/orcamentos/novo">
              <Plus />
              Novo orçamento
            </Link>
          </Button>
        }
      />
      <StatGrid className="mb-6">
        <StatCard label="Em aberto" value={formatMoney(kpis.openValue)} hint={`${kpis.openCount} proposta(s)`} icon={Send} highlight />
        <StatCard label="Aceitos" value={formatMoney(kpis.acceptedValue)} hint={`${kpis.acceptedCount} proposta(s)`} icon={CheckCircle2} />
        <StatCard label="Taxa de aceite" value={formatPercent(kpis.rate)} hint="sobre propostas decididas" icon={FileText} />
        <StatCard label="Rascunhos" value={kpis.drafts} hint="aguardando envio" icon={Clock} />
      </StatGrid>
      <FilterBar
        search={search}
        onSearch={setSearch}
        searchPlaceholder="Buscar por número, cliente ou projeto"
        onClear={clear}
        filters={[
          { key: "status", label: "Status", options: toOptions(QUOTE_STATUS_LABEL), value: status, onChange: setStatus },
          { key: "item", label: "Projeto", options: catalog.map((c) => ({ value: c.id, label: c.name })), value: item, onChange: setItem },
          { key: "owner", label: "Responsável", options: userOptions, value: owner, onChange: setOwner },
        ]}
      />
      <DataTable
        columns={columns}
        data={filtered}
        getRowId={(q) => q.id}
        onRowClick={(q) => router.push(`/orcamentos/${q.id}`)}
        initialSorting={[]}
        empty={
          <EmptyState
            icon={FileText}
            title={quotes.length ? "Nenhum orçamento encontrado" : "Nenhum orçamento ainda"}
            description={quotes.length ? "Ajuste os filtros ou a busca." : "Monte a primeira proposta com o formulário de precificação."}
            action={
              <Button asChild size="sm">
                <Link href="/orcamentos/novo">
                  <Plus />
                  Novo orçamento
                </Link>
              </Button>
            }
          />
        }
        mobileCard={(q) => {
          const p = partyLabel(q, leads, clients)
          return (
            <div className="space-y-2">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate font-medium">{p.name}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    <span className="num">{q.number}</span> · {catalogName.get(q.catalogItemId)}
                  </p>
                </div>
                <EnumBadge value={q.status} labels={QUOTE_STATUS_LABEL} tones={QUOTE_STATUS_TONE} />
              </div>
              <div className="flex items-end justify-between gap-2">
                <div>
                  <p className="num font-semibold">{formatMoney(q.total)}</p>
                  {q.monthlyFee > 0 && <p className="num text-xs text-muted-foreground">+ {formatMoney(q.monthlyFee)}/mês</p>}
                </div>
                <Validity quote={q} />
              </div>
            </div>
          )
        }}
      />
    </div>
  )
}

function Validity({ quote }: { quote: Quote }) {
  const days = daysUntil(quote.validUntil)
  const closed = quote.status === "aceito" || quote.status === "recusado"
  const tone = closed ? "text-muted-foreground" : days < 0 ? "text-danger" : days <= 3 ? "text-warning" : "text-muted-foreground"
  return (
    <div className="text-right md:text-left">
      <p className={cn("num text-sm", tone)}>{formatDate(quote.validUntil)}</p>
      {!closed && <p className={cn("text-[11px]", tone)}>{days < 0 ? "Vencido" : days === 0 ? "Vence hoje" : `${days} ${days === 1 ? "dia" : "dias"} restantes`}</p>}
    </div>
  )
}
