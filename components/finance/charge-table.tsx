"use client"

import { useMemo } from "react"
import { DataTable, type ColumnDef } from "@/components/shared/data-table"
import { DeleteChargeButton } from "@/components/finance/delete-charge-button"
import { EmptyState } from "@/components/shared/empty-state"
import { EnumBadge } from "@/components/shared/status-badge"
import { CHARGE_STATUS_LABEL, CHARGE_STATUS_TONE, PAYMENT_METHOD_LABEL } from "@/lib/constants"
import { useById } from "@/lib/data"
import { formatDate, formatMoney } from "@/lib/format"
import { cn } from "@/lib/utils"
import type { Charge } from "@/types"

interface ChargeTableProps {
  charges: Charge[]
  onOpen: (charge: Charge) => void
  hideClient?: boolean
  pageSize?: number
}

/** Tabela de cobranças reutilizada em Financeiro e na ficha do cliente. */
export function ChargeTable({ charges, onOpen, hideClient, pageSize }: ChargeTableProps) {
  const clients = useById("clients")
  const columns = useMemo<ColumnDef<Charge, unknown>[]>(() => {
    const cols: ColumnDef<Charge, unknown>[] = [
      { id: "number", header: "Número", accessorFn: (c) => c.number, cell: ({ row }) => <span className="num text-xs text-muted-foreground">{row.original.number}{row.original.gateway === "asaas" && " · Asaas"}</span> },
      {
        id: "client",
        header: "Cliente",
        accessorFn: (c) => clients.get(c.clientId)?.name ?? "",
        cell: ({ row }) => (
          <div className="min-w-0 max-w-64">
            <p className="truncate font-medium">{clients.get(row.original.clientId)?.name ?? "—"}</p>
            <p className="truncate text-xs text-muted-foreground">{row.original.description}</p>
          </div>
        ),
      },
      { id: "origin", header: "Origem", accessorFn: charge => charge.gatewayId ? "Asaas" : charge.automatic && charge.status !== "pago" ? "Previsto no CRM" : "Registro manual", cell: ({ row }) => <span className="text-xs">{row.original.gatewayId ? "Asaas" : row.original.automatic && row.original.status !== "pago" ? "Previsto no CRM" : "Registro manual"}</span> },
      { id: "method", header: "Forma", accessorFn: (c) => c.method, cell: ({ row }) => PAYMENT_METHOD_LABEL[row.original.method] },
      { id: "installment", header: "Parcela", enableSorting: false, cell: ({ row }) => <span className="num text-xs">{row.original.installment}/{row.original.installments}</span> },
      {
        id: "due",
        header: "Vencimento",
        accessorFn: (c) => c.dueDate,
        cell: ({ row }) => <span className={cn("num text-xs", row.original.status === "vencido" && "text-danger")}>{row.original.dueDate ? formatDate(row.original.dueDate) : "A definir"}</span>,
      },
      { id: "amount", header: "Valor", accessorFn: (c) => c.amount, cell: ({ row }) => <span className="num font-medium whitespace-nowrap">{formatMoney(row.original.amount)}</span> },
      { id: "status", header: "Status", accessorFn: (c) => c.status, cell: ({ row }) => <EnumBadge value={row.original.status} labels={CHARGE_STATUS_LABEL} tones={CHARGE_STATUS_TONE} /> },
      { id: "actions", header: "", enableSorting: false, cell: ({ row }) => <DeleteChargeButton charge={row.original} compact /> },
    ]
    return hideClient
      ? cols.map((c) =>
          c.id === "client"
            ? { ...c, header: "Descrição", cell: ({ row }: { row: { original: Charge } }) => <span className="block max-w-64 truncate">{row.original.description}</span> }
            : c,
        )
      : cols
  }, [clients, hideClient])

  return (
    <DataTable
      columns={columns}
      data={charges}
      getRowId={(c) => c.id}
      onRowClick={onOpen}
      pageSize={pageSize}
      initialSorting={[{ id: "due", desc: true }]}
      empty={<EmptyState title="Nenhuma cobrança" description="As cobranças geradas aparecem aqui." compact />}
      mobileCard={(c) => (
        <div className="space-y-1.5">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="truncate font-medium">{hideClient ? c.description : (clients.get(c.clientId)?.name ?? "—")}</p>
              <p className="num text-xs text-muted-foreground">
                {c.gatewayId ? "Asaas" : "CRM"} · {c.number} · {PAYMENT_METHOD_LABEL[c.method]} · {c.installment}/{c.installments}
              </p>
            </div>
            <div className="flex items-center gap-1"><EnumBadge value={c.status} labels={CHARGE_STATUS_LABEL} tones={CHARGE_STATUS_TONE} /><DeleteChargeButton charge={c} compact /></div>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-x-3 text-sm">
            <span className={cn("num text-xs", c.status === "vencido" ? "text-danger" : "text-muted-foreground")}>{c.dueDate ? `Vence ${formatDate(c.dueDate)}` : "Vencimento a definir"}</span>
            <span className="num font-semibold whitespace-nowrap">{formatMoney(c.amount)}</span>
          </div>
        </div>
      )}
    />
  )
}
