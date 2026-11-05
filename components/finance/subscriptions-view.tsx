"use client"

import { useMemo, useState } from "react"
import Link from "next/link"
import { CalendarClock, MoreHorizontal, Pause, Play, Plus, Repeat, TrendingDown, Wallet, XCircle } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { DataTable, type ColumnDef } from "@/components/shared/data-table"
import { EmptyState } from "@/components/shared/empty-state"
import { ALL, FilterBar, matches } from "@/components/shared/filter-bar"
import { Panel } from "@/components/shared/panel"
import { StatCard, StatGrid } from "@/components/shared/stat-card"
import { EnumBadge } from "@/components/shared/status-badge"
import { FinanceToolbar } from "@/components/finance/finance-tabs"
import { ReasonDialog } from "@/components/finance/reason-dialog"
import { SubscriptionFormDialog } from "@/components/finance/subscription-form-dialog"
import { PAYMENT_METHOD_LABEL, SUBSCRIPTION_STATUS_LABEL, SUBSCRIPTION_STATUS_TONE, toOptions } from "@/lib/constants"
import { useById, useCrm, useSubscriptions } from "@/lib/data"
import { mrr } from "@/lib/data/selectors"
import { daysSince, daysUntil, formatDate, formatMoney, formatPercent } from "@/lib/format"
import type { Subscription } from "@/types"

export function SubscriptionsView() {
  const subscriptions = useSubscriptions()
  const clients = useById("clients")
  const update = useCrm((s) => s.update)
  const [search, setSearch] = useState("")
  const [status, setStatus] = useState(ALL)
  const [formOpen, setFormOpen] = useState(false)
  const [canceling, setCanceling] = useState<Subscription | null>(null)

  const active = subscriptions.filter((s) => s.status === "ativa")
  const canceled = subscriptions.filter((s) => s.status === "cancelada").sort((a, b) => (b.canceledAt ?? "").localeCompare(a.canceledAt ?? ""))
  const recentCanceled = canceled.filter((s) => s.canceledAt && daysSince(s.canceledAt) <= 30)
  const lostMrr = recentCanceled.reduce((s, x) => s + x.amount, 0)
  const currentMrr = mrr(subscriptions)
  const upcoming = [...active].sort((a, b) => a.nextBillingDate.localeCompare(b.nextBillingDate)).filter((s) => daysUntil(s.nextBillingDate) <= 30)

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return subscriptions.filter((s) => matches(status, s.status) && (!q || `${clients.get(s.clientId)?.name ?? ""} ${s.description}`.toLowerCase().includes(q)))
  }, [subscriptions, clients, search, status])

  const setStatusFor = (s: Subscription, next: Subscription["status"]) => {
    update("subscriptions", s.id, { status: next, canceledAt: undefined, cancelReason: undefined })
    toast.success(next === "pausada" ? "Mensalidade pausada" : "Mensalidade reativada")
  }

  const columns = useMemo<ColumnDef<Subscription, unknown>[]>(
    () => [
      {
        id: "client",
        header: "Cliente",
        accessorFn: (s) => clients.get(s.clientId)?.name ?? "",
        cell: ({ row }) => (
          <div className="min-w-0">
            <Link href={`/clientes/${row.original.clientId}`} onClick={(e) => e.stopPropagation()} className="font-medium hover:text-primary">
              {clients.get(row.original.clientId)?.name ?? "—"}
            </Link>
            <p className="truncate text-xs text-muted-foreground">{row.original.description}</p>
          </div>
        ),
      },
      { id: "amount", header: "Valor", accessorFn: (s) => s.amount, cell: ({ row }) => <span className="num font-medium">{formatMoney(row.original.amount)}/mês</span> },
      { id: "method", header: "Forma", accessorFn: (s) => s.method, cell: ({ row }) => PAYMENT_METHOD_LABEL[row.original.method] },
      { id: "day", header: "Dia", accessorFn: (s) => s.billingDay, cell: ({ row }) => <span className="num">{row.original.billingDay}</span> },
      { id: "next", header: "Próxima cobrança", accessorFn: (s) => s.nextBillingDate, cell: ({ row }) => <span className="num text-xs">{row.original.status === "ativa" ? formatDate(row.original.nextBillingDate) : "—"}</span> },
      { id: "status", header: "Status", accessorFn: (s) => s.status, cell: ({ row }) => <EnumBadge value={row.original.status} labels={SUBSCRIPTION_STATUS_LABEL} tones={SUBSCRIPTION_STATUS_TONE} /> },
      { id: "actions", header: "", enableSorting: false, size: 40, cell: ({ row }) => <RowActions sub={row.original} onCancel={setCanceling} onStatus={setStatusFor} /> },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [clients],
  )

  return (
    <div className="space-y-4">
      <StatGrid>
        <StatCard label="MRR" value={formatMoney(currentMrr)} icon={Repeat} highlight hint="Receita recorrente mensal" />
        <StatCard label="Mensalidades ativas" value={active.length} icon={Wallet} hint={`Ticket médio ${formatMoney(active.length ? currentMrr / active.length : 0)}`} />
        <StatCard label="Próximos 30 dias" value={formatMoney(upcoming.reduce((s, x) => s + x.amount, 0))} icon={CalendarClock} hint={`${upcoming.length} cobrança(s)`} />
        <StatCard label="Churn (30 dias)" value={formatPercent(currentMrr + lostMrr ? lostMrr / (currentMrr + lostMrr) : 0)} icon={TrendingDown} hint={`${formatMoney(lostMrr)} perdidos`} />
      </StatGrid>

      <div className="grid gap-4 xl:grid-cols-[1fr_340px]">
        <div className="min-w-0">
          <FinanceToolbar title="Recorrências">
            <Button size="sm" onClick={() => setFormOpen(true)}>
              <Plus />
              Nova mensalidade
            </Button>
          </FinanceToolbar>
          <FilterBar
            search={search}
            onSearch={setSearch}
            searchPlaceholder="Buscar cliente ou descrição"
            filters={[{ key: "status", label: "Status", options: toOptions(SUBSCRIPTION_STATUS_LABEL), value: status, onChange: setStatus }]}
            onClear={() => {
              setSearch("")
              setStatus(ALL)
            }}
          />
          <DataTable
            columns={columns}
            data={filtered}
            getRowId={(s) => s.id}
            empty={<EmptyState title="Nenhuma mensalidade encontrada" compact />}
            mobileCard={(s) => (
              <div className="space-y-1.5">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate font-medium">{clients.get(s.clientId)?.name}</p>
                    <p className="truncate text-xs text-muted-foreground">{s.description}</p>
                  </div>
                  <RowActions sub={s} onCancel={setCanceling} onStatus={setStatusFor} />
                </div>
                <div className="flex items-center justify-between">
                  <EnumBadge value={s.status} labels={SUBSCRIPTION_STATUS_LABEL} tones={SUBSCRIPTION_STATUS_TONE} />
                  <span className="num text-sm font-semibold">{formatMoney(s.amount)}/mês</span>
                </div>
              </div>
            )}
          />
        </div>

        <div className="space-y-4">
          <Panel title="Próximas cobranças" description="Próximos 30 dias" contentClassName="p-0">
            {upcoming.length === 0 ? (
              <EmptyState title="Nada previsto" compact className="m-4" />
            ) : (
              <ul className="divide-y">
                {upcoming.map((s) => (
                  <li key={s.id} className="flex items-center gap-3 px-4 py-2.5">
                    <div className="num flex size-10 shrink-0 flex-col items-center justify-center rounded-lg border bg-surface leading-none">
                      <span className="text-sm font-semibold">{formatDate(s.nextBillingDate).slice(0, 2)}</span>
                      <span className="text-[9px] text-muted-foreground">{formatDate(s.nextBillingDate).slice(3, 5)}</span>
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm">{clients.get(s.clientId)?.name}</p>
                      <p className="text-xs text-muted-foreground">em {Math.max(0, daysUntil(s.nextBillingDate))} dias</p>
                    </div>
                    <span className="num text-sm">{formatMoney(s.amount)}</span>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
          <Panel title="Cancelamentos" contentClassName="p-0">
            {canceled.length === 0 ? (
              <EmptyState title="Nenhum cancelamento" compact className="m-4" />
            ) : (
              <ul className="divide-y">
                {canceled.map((s) => (
                  <li key={s.id} className="px-4 py-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <p className="truncate text-sm">{clients.get(s.clientId)?.name}</p>
                      <span className="num text-xs text-danger">-{formatMoney(s.amount)}</span>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {formatDate(s.canceledAt)} · {s.cancelReason ?? "Sem motivo"}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>
      </div>

      <SubscriptionFormDialog open={formOpen} onOpenChange={setFormOpen} />
      <ReasonDialog
        open={Boolean(canceling)}
        onOpenChange={(o) => !o && setCanceling(null)}
        title="Cancelar mensalidade"
        description={canceling ? `${clients.get(canceling.clientId)?.name} — ${canceling.description}` : undefined}
        label="Motivo do cancelamento"
        confirmLabel="Cancelar mensalidade"
        onConfirm={(reason) => {
          if (!canceling) return
          update("subscriptions", canceling.id, { status: "cancelada", canceledAt: new Date().toISOString(), cancelReason: reason })
          toast.success("Mensalidade cancelada")
        }}
      />
    </div>
  )
}

function RowActions({ sub, onCancel, onStatus }: { sub: Subscription; onCancel: (s: Subscription) => void; onStatus: (s: Subscription, next: Subscription["status"]) => void }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon-sm" aria-label="Ações" onClick={(e) => e.stopPropagation()}>
          <MoreHorizontal />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-44">
        {sub.status === "ativa" && (
          <DropdownMenuItem onSelect={() => onStatus(sub, "pausada")}>
            <Pause />
            Pausar
          </DropdownMenuItem>
        )}
        {sub.status !== "ativa" && (
          <DropdownMenuItem onSelect={() => onStatus(sub, "ativa")}>
            <Play />
            Reativar
          </DropdownMenuItem>
        )}
        {sub.status !== "cancelada" && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive" onSelect={() => onCancel(sub)}>
              <XCircle />
              Cancelar
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
