"use client"

import { useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { AlertTriangle, Building2, Download, Plus, Repeat, Users } from "lucide-react"
import { Button } from "@/components/ui/button"
import { DataTable, type ColumnDef } from "@/components/shared/data-table"
import { EmptyState } from "@/components/shared/empty-state"
import { ALL, FilterBar, matches } from "@/components/shared/filter-bar"
import { PageHeader } from "@/components/shared/page-header"
import { StatCard, StatGrid } from "@/components/shared/stat-card"
import { StatusBadge } from "@/components/shared/status-badge"
import { UserAvatar } from "@/components/shared/user-avatar"
import { DeleteClientButton } from "@/components/clients/delete-client-button"
import { ClientFormDialog } from "@/components/clients/client-form-dialog"
import { downloadCsv } from "@/lib/browser"
import { useCharges, useClients, useSubscriptions } from "@/lib/data"
import { mrr } from "@/lib/data/selectors"
import { formatMoney } from "@/lib/format"
import type { Client } from "@/types"

interface Row extends Client {
  mrr: number
  open: number
  overdue: number
}

export function ClientsView() {
  const router = useRouter()
  const clients = useClients()
  const subscriptions = useSubscriptions()
  const charges = useCharges()
  const [search, setSearch] = useState("")
  const [status, setStatus] = useState(ALL)
  const [docType, setDocType] = useState(ALL)
  const [formOpen, setFormOpen] = useState(false)

  const rows = useMemo<Row[]>(
    () =>
      clients.map((c) => {
        const own = charges.filter((ch) => ch.clientId === c.id)
        return {
          ...c,
          mrr: mrr(subscriptions.filter((s) => s.clientId === c.id)),
          open: own.filter((ch) => ch.status === "pendente" || ch.status === "vencido").reduce((s, ch) => s + ch.amount, 0),
          overdue: own.filter((ch) => ch.status === "vencido").reduce((s, ch) => s + ch.amount, 0),
        }
      }),
    [clients, subscriptions, charges],
  )

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return rows.filter(
      (c) => matches(status, c.status) && matches(docType, c.documentType) && (!q || `${c.name} ${c.legalName} ${c.document} ${c.contactName} ${c.address.city}`.toLowerCase().includes(q)),
    )
  }, [rows, search, status, docType])

  const columns = useMemo<ColumnDef<Row, unknown>[]>(
    () => [
      {
        id: "name",
        header: "Cliente",
        accessorFn: (c) => c.name,
        cell: ({ row }) => (
          <div className="min-w-0 max-w-72">
            <p className="truncate font-medium">{row.original.name}</p>
            <p className="truncate text-xs text-muted-foreground">{row.original.legalName}</p>
          </div>
        ),
      },
      { id: "document", header: "CPF/CNPJ", accessorFn: (c) => c.document, cell: ({ row }) => <span className="num text-xs">{row.original.document}</span> },
      {
        id: "contact",
        header: "Contato",
        accessorFn: (c) => c.contactName,
        cell: ({ row }) => (
          <div>
            <p className="text-sm">{row.original.contactName}</p>
            <p className="num text-xs text-muted-foreground">{row.original.whatsapp}</p>
          </div>
        ),
      },
      { id: "city", header: "Cidade", accessorFn: (c) => c.address.city, cell: ({ row }) => <span className="text-xs">{row.original.address.city}/{row.original.address.state}</span> },
      { id: "mrr", header: "Mensalidade", accessorFn: (c) => c.mrr, cell: ({ row }) => <span className="num">{row.original.mrr ? formatMoney(row.original.mrr) : "—"}</span> },
      {
        id: "open",
        header: "Em aberto",
        accessorFn: (c) => c.open,
        cell: ({ row }) => <span className={row.original.overdue ? "num text-danger" : "num"}>{row.original.open ? formatMoney(row.original.open) : "—"}</span>,
      },
      { id: "owner", header: "Responsável", enableSorting: false, cell: ({ row }) => <UserAvatar userId={row.original.ownerId} showName /> },
      { id: "status", header: "Status", accessorFn: (c) => c.status, cell: ({ row }) => <StatusBadge tone={row.original.status === "ativo" ? "success" : "neutral"}>{row.original.status === "ativo" ? "Ativo" : "Inativo"}</StatusBadge> },
      { id: "actions", header: "", enableSorting: false, cell: ({ row }) => <DeleteClientButton client={row.original} compact /> },
    ],
    [],
  )

  const active = rows.filter((r) => r.status === "ativo")

  return (
    <>
      <PageHeader
        title="Clientes"
        description="Base de clientes com dados fiscais, projetos e cobrança."
        actions={
          <>
            <Button
              variant="outline"
              onClick={() =>
                downloadCsv(
                  "clientes",
                  filtered.map((c) => ({ Nome: c.name, "Razão social": c.legalName, "CPF/CNPJ": c.document, Contato: c.contactName, WhatsApp: c.whatsapp, Cidade: c.address.city, UF: c.address.state, Status: c.status })),
                )
              }
            >
              <Download />
              Exportar
            </Button>
            <Button onClick={() => setFormOpen(true)}>
              <Plus />
              Novo cliente
            </Button>
          </>
        }
      />
      <div className="space-y-4">
        <StatGrid>
          <StatCard label="Clientes ativos" value={active.length} icon={Users} highlight hint={`${rows.length} no total`} />
          <StatCard label="MRR da base" value={formatMoney(rows.reduce((s, r) => s + r.mrr, 0))} icon={Repeat} hint={`${rows.filter((r) => r.mrr).length} com mensalidade`} />
          <StatCard label="Em aberto" value={formatMoney(rows.reduce((s, r) => s + r.open, 0))} icon={Building2} hint="cobranças pendentes" />
          <StatCard label="Inadimplentes" value={rows.filter((r) => r.overdue).length} icon={AlertTriangle} hint={formatMoney(rows.reduce((s, r) => s + r.overdue, 0))} />
        </StatGrid>
        <div>
          <FilterBar
            search={search}
            onSearch={setSearch}
            searchPlaceholder="Buscar nome, razão social, CNPJ ou cidade"
            filters={[
              {
                key: "status",
                label: "Status",
                options: [
                  { value: "ativo", label: "Ativo" },
                  { value: "inativo", label: "Inativo" },
                ],
                value: status,
                onChange: setStatus,
              },
              {
                key: "doc",
                label: "Pessoa",
                options: [
                  { value: "cnpj", label: "Jurídica (CNPJ)" },
                  { value: "cpf", label: "Física (CPF)" },
                ],
                value: docType,
                onChange: setDocType,
              },
            ]}
            onClear={() => {
              setSearch("")
              setStatus(ALL)
              setDocType(ALL)
            }}
          />
          <DataTable
            columns={columns}
            data={filtered}
            getRowId={(c) => c.id}
            onRowClick={(c) => router.push(`/clientes/${c.id}`)}
            initialSorting={[{ id: "name", desc: false }]}
            empty={
              <EmptyState
                icon={Users}
                title="Nenhum cliente encontrado"
                description="Clientes são criados ao ganhar um negócio ou manualmente."
                action={
                  <Button size="sm" onClick={() => setFormOpen(true)}>
                    <Plus />
                    Novo cliente
                  </Button>
                }
              />
            }
            mobileCard={(c) => (
              <div className="space-y-1.5">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate font-medium">{c.name}</p>
                    <p className="num truncate text-xs text-muted-foreground">{c.document}</p>
                  </div>
                  <div className="flex items-center gap-1"><StatusBadge tone={c.status === "ativo" ? "success" : "neutral"}>{c.status === "ativo" ? "Ativo" : "Inativo"}</StatusBadge><DeleteClientButton client={c} compact /></div>
                </div>
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>
                    {c.contactName} · {c.address.city}
                  </span>
                  {c.mrr > 0 && <span className="num text-foreground">{formatMoney(c.mrr)}/mês</span>}
                </div>
              </div>
            )}
          />
        </div>
      </div>
      <ClientFormDialog open={formOpen} onOpenChange={setFormOpen} />
    </>
  )
}
