"use client"

import { useMemo, useState } from "react"
import { ArrowDownCircle, ArrowUpCircle, Check, Download, MoreHorizontal, Pencil, Plus, Scale, Trash2 } from "lucide-react"
import { toast } from "@/lib/store/save-feedback"
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { DataTable, type ColumnDef } from "@/components/shared/data-table"
import { EmptyState } from "@/components/shared/empty-state"
import { ALL, FilterBar, matches } from "@/components/shared/filter-bar"
import { StatCard } from "@/components/shared/stat-card"
import { EnumBadge } from "@/components/shared/status-badge"
import { EntryFormDialog } from "@/components/finance/entry-form-dialog"
import { PaymentDateButton } from "@/components/finance/payment-date-button"
import { FinanceToolbar } from "@/components/finance/finance-tabs"
import { downloadCsv } from "@/lib/browser"
import { ENTRY_STATUS_LABEL, ENTRY_STATUS_TONE, toOptions } from "@/lib/constants"
import { useById, useCrm, useEntries, useFinancialCategories } from "@/lib/data"
import { entriesForView, entryStatusNow, entryTotals, type EntryView } from "@/lib/data/selectors"
import { formatDate, formatMoney, formatMonth } from "@/lib/format"
import { getPeriodRange } from "@/lib/period"
import { useUiStore } from "@/lib/store/ui-store"
import { cn } from "@/lib/utils"
import type { EntryType, FinancialEntry } from "@/types"

const TYPE_LABEL: Record<EntryType, string> = { receita: "Entrada", despesa: "Saída" }

export function EntriesView() {
  const entries = useEntries()
  const categories = useById("financialCategories")
  const categoryList = useFinancialCategories()
  const clients = useById("clients")
  const charges = useById("charges")
  const remove = useCrm((s) => s.remove)
  const period = useUiStore((s) => s.period)
  const [now] = useState(() => new Date())
  const [view, setView] = useState<EntryView>("todos")
  const [search, setSearch] = useState("")
  const [status, setStatus] = useState(ALL)
  const [category, setCategory] = useState(ALL)
  const [formOpen, setFormOpen] = useState(false)
  const [formType, setFormType] = useState<EntryType>("receita")
  const [editing, setEditing] = useState<FinancialEntry | null>(null)
  const [settling, setSettling] = useState(false)
  const [deleting, setDeleting] = useState<FinancialEntry | null>(null)

  const range = useMemo(() => getPeriodRange(period), [period])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return entriesForView(entries, view, range, now)
      .filter(
        (e) =>
          matches(status, entryStatusNow(e, now)) &&
          matches(category, e.categoryId) &&
          (!q || `${e.description} ${e.supplier ?? ""} ${clients.get(e.clientId ?? "")?.name ?? ""}`.toLowerCase().includes(q)),
      )
      .sort((a, b) => b.dueDate.localeCompare(a.dueDate))
  }, [entries, view, range, now, status, category, search, clients])

  const totals = useMemo(() => entryTotals(filtered), [filtered])

  const openNew = (type: EntryType) => {
    setSettling(false)
    setEditing(null)
    setFormType(type)
    setFormOpen(true)
  }

  const openEdit = (e: FinancialEntry) => {
    setSettling(false)
    setEditing(e)
    setFormOpen(true)
  }

  /** Boleto registrado só é baixado pelo Asaas. */
  const canSettle = (e: FinancialEntry) => e.status !== "pago" && !(e.chargeId && charges.get(e.chargeId)?.gatewayId)

  const markPaid = (e: FinancialEntry) => {
    setEditing(e)
    setSettling(true)
    setFormOpen(true)
  }

  const renderActions = (e: FinancialEntry) => (
    <div className="flex items-center justify-end gap-1">
      {e.chargeId && charges.get(e.chargeId) ? <PaymentDateButton charge={charges.get(e.chargeId)!} /> : canSettle(e) && (
        <Button variant="outline" size="xs" onClick={() => markPaid(e)}>
          <Check />
          {e.type === "despesa" ? "Pagar" : "Baixar"}
        </Button>
      )}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon-sm" aria-label="Ações">
            <MoreHorizontal />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-40">
          <DropdownMenuItem onSelect={() => openEdit(e)}>
            <Pencil />
            Editar
          </DropdownMenuItem>
          <DropdownMenuItem
            variant="destructive"
            onSelect={() => {
              if (e.chargeId) {
                toast.error("Vinculada a uma cobrança", { description: "Cancele a cobrança em Cobranças para remover esta entrada." })
                return
              }
              setDeleting(e)
            }}
          >
            <Trash2 />
            Excluir
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )

  const amountCell = (e: FinancialEntry, className?: string) => (
    <span className={cn("num whitespace-nowrap", e.type === "receita" ? "text-success" : "text-danger", className)}>
      {e.type === "receita" ? "+" : "-"} {formatMoney(e.amount)}
    </span>
  )

  const columns = useMemo<ColumnDef<FinancialEntry, unknown>[]>(
    () => [
      {
        id: "description",
        header: "Descrição",
        accessorFn: (e) => e.description,
        cell: ({ row }) => {
          const e = row.original
          return (
            <div className="min-w-0 max-w-72">
              <p className="truncate font-medium">{e.description}</p>
              <p className="truncate text-xs text-muted-foreground">{e.supplier || clients.get(e.clientId ?? "")?.name || "—"}</p>
            </div>
          )
        },
      },
      { id: "category", header: "Categoria", accessorFn: (e) => categories.get(e.categoryId)?.name ?? "", cell: ({ row }) => <span className="text-xs">{categories.get(row.original.categoryId)?.name ?? "—"}</span> },
      { id: "competence", header: "Competência", accessorFn: (e) => e.competenceDate, cell: ({ row }) => <span className="num text-xs capitalize">{formatMonth(row.original.competenceDate)}</span> },
      {
        id: "due",
        header: "Vencimento",
        accessorFn: (e) => e.dueDate,
        cell: ({ row }) => {
          const e = row.original
          return (
            <div className="text-xs">
              <p className={cn("num", entryStatusNow(e, now) === "vencido" && "text-danger")}>{formatDate(e.dueDate)}</p>
              {e.status === "pago" && e.paidAt && <p className="text-muted-foreground">Pago em <span className="num">{formatDate(e.paidAt)}</span></p>}
            </div>
          )
        },
      },
      { id: "amount", header: "Valor", accessorFn: (e) => (e.type === "receita" ? e.amount : -e.amount), cell: ({ row }) => amountCell(row.original, "font-medium") },
      { id: "status", header: "Status", accessorFn: (e) => entryStatusNow(e, now), cell: ({ row }) => <EnumBadge value={entryStatusNow(row.original, now)} labels={ENTRY_STATUS_LABEL} tones={ENTRY_STATUS_TONE} /> },
      { id: "actions", header: "", enableSorting: false, cell: ({ row }) => renderActions(row.original) },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [categories, clients, charges, now],
  )

  return (
    <div className="space-y-4">
      <div>
        <FinanceToolbar title="Entradas e saídas">
          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              downloadCsv(
                "entradas-e-saidas",
                filtered.map((e) => ({
                  Tipo: TYPE_LABEL[e.type],
                  Descrição: e.description,
                  Categoria: categories.get(e.categoryId)?.name,
                  "Cliente ou fornecedor": e.supplier || clients.get(e.clientId ?? "")?.name,
                  Competência: formatMonth(e.competenceDate),
                  Vencimento: formatDate(e.dueDate),
                  Pagamento: e.status === "pago" ? formatDate(e.paidAt) : "",
                  Valor: e.amount.toFixed(2).replace(".", ","),
                  Status: ENTRY_STATUS_LABEL[entryStatusNow(e, now)],
                })),
              )
            }
          >
            <Download />
            Exportar
          </Button>
          <Button variant="outline" size="sm" onClick={() => openNew("despesa")}>
            <ArrowUpCircle className="text-danger" />
            Nova saída
          </Button>
          <Button size="sm" onClick={() => openNew("receita")}>
            <Plus />
            Nova entrada
          </Button>
        </FinanceToolbar>
        <Tabs value={view} onValueChange={(v) => setView(v as EntryView)} className="mb-3">
          <TabsList className="w-full overflow-x-auto sm:w-fit">
            <TabsTrigger value="todos">Todas</TabsTrigger>
            <TabsTrigger value="receita">Entradas</TabsTrigger>
            <TabsTrigger value="despesa">Saídas</TabsTrigger>
            <TabsTrigger value="a_receber">A receber</TabsTrigger>
            <TabsTrigger value="a_pagar">A pagar</TabsTrigger>
            <TabsTrigger value="vencidos">Vencidas</TabsTrigger>
          </TabsList>
        </Tabs>
        <FilterBar
          search={search}
          onSearch={setSearch}
          searchPlaceholder="Buscar descrição, fornecedor ou cliente"
          filters={[
            { key: "status", label: "Status", options: toOptions(ENTRY_STATUS_LABEL), value: status, onChange: setStatus },
            { key: "category", label: "Categoria", options: categoryList.map((c) => ({ value: c.id, label: c.name })), value: category, onChange: setCategory },
          ]}
          onClear={() => {
            setSearch("")
            setStatus(ALL)
            setCategory(ALL)
          }}
        />
        <div className="mb-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
          <StatCard label="Entradas" value={formatMoney(totals.entradas)} icon={ArrowDownCircle} valueClassName="text-success" hint={range.label} />
          <StatCard label="Saídas" value={formatMoney(totals.saidas)} icon={ArrowUpCircle} valueClassName="text-danger" hint={range.label} />
          <StatCard
            label="Resultado"
            value={formatMoney(totals.resultado)}
            icon={Scale}
            highlight
            className="col-span-2 sm:col-span-1"
            valueClassName={totals.resultado < 0 ? "text-danger" : undefined}
            hint={`${filtered.length} na lista filtrada`}
          />
        </div>
        <DataTable
          columns={columns}
          data={filtered}
          getRowId={(e) => e.id}
          empty={<EmptyState title="Nenhuma entrada ou saída" description="Ajuste os filtros ou o período global." compact />}
          mobileCard={(e) => (
            <div className="space-y-1.5">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate font-medium">{e.description}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {categories.get(e.categoryId)?.name} · <span className="num">{formatDate(e.dueDate)}</span>
                  </p>
                </div>
                <EnumBadge value={entryStatusNow(e, now)} labels={ENTRY_STATUS_LABEL} tones={ENTRY_STATUS_TONE} />
              </div>
              <div className="flex flex-wrap items-center justify-between gap-2">
                {amountCell(e, "font-semibold")}
                {renderActions(e)}
              </div>
            </div>
          )}
        />
      </div>
      <EntryFormDialog open={formOpen} onOpenChange={setFormOpen} defaultType={formType} entry={editing} settle={settling} />
      <AlertDialog open={Boolean(deleting)} onOpenChange={(o) => !o && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir {deleting ? TYPE_LABEL[deleting.type].toLowerCase() : ""}?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleting?.description} · {formatMoney(deleting?.amount)}. Essa ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Voltar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (!deleting) return
                remove("entries", deleting.id)
                toast.success(deleting.type === "receita" ? "Entrada excluída" : "Saída excluída")
                setDeleting(null)
              }}
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
