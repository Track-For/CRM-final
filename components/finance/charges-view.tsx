"use client"

import { useSearchParams } from "next/navigation"
import { useMemo, useState } from "react"
import { AlertTriangle, CircleCheck, Clock, Download, Plus, Wallet } from "lucide-react"
import { Button } from "@/components/ui/button"
import { ALL, FilterBar, matches } from "@/components/shared/filter-bar"
import { StatCard, StatGrid } from "@/components/shared/stat-card"
import { AsaasSyncButton } from "@/components/finance/asaas-sync-button"
import { ChargeDrawer } from "@/components/finance/charge-drawer"
import { ChargeTable } from "@/components/finance/charge-table"
import { FinanceToolbar } from "@/components/finance/finance-tabs"
import { downloadCsv } from "@/lib/browser"
import { CHARGE_STATUS_LABEL, PAYMENT_METHOD_LABEL, toOptions } from "@/lib/constants"
import { useById, useCharges } from "@/lib/data"
import { sum } from "@/lib/data/selectors"
import { formatDate, formatMoney } from "@/lib/format"
import { getPeriodRange, inRange } from "@/lib/period"
import { useUiStore } from "@/lib/store/ui-store"

export function ChargesView() {
  const params = useSearchParams()
  const initialCharge = params.get("cobranca")
  const initialView = params.get("visao") === "sem-data" ? "undated" : "all"
  return <ChargesViewContent key={`${initialCharge || "list"}-${initialView}`} initialCharge={initialCharge} initialView={initialView} />
}

function ChargesViewContent({ initialCharge, initialView }: { initialCharge: string | null; initialView: string }) {
  const charges = useCharges()
  const clients = useById("clients")
  const period = useUiStore((s) => s.period)
  const openQuickCreate = useUiStore((s) => s.openQuickCreate)
  const [view, setView] = useState(initialView)
  const [search, setSearch] = useState("")
  const [status, setStatus] = useState(ALL)
  const [method, setMethod] = useState(ALL)
  const [chargeId, setChargeId] = useState<string | null>(initialCharge)

  const range = getPeriodRange(period)
  const stats = useMemo(() => {
    const received = charges.filter((c) => c.status === "pago" && inRange(c.paidAt, range.from, range.to))
    const pending = charges.filter((c) => c.status === "pendente")
    const overdue = charges.filter((c) => c.status === "vencido")
    return { received, pending, overdue }
  }, [charges, range.from, range.to])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return charges.filter(
      (c) =>
        (view === "all" || (view === "open" && (c.status === "pendente" || c.status === "vencido")) || (view === "overdue" && c.status === "vencido") || (view === "undated" && !c.dueDate && (c.status === "pendente" || c.status === "vencido"))) &&
        matches(status, c.status) &&
        matches(method, c.method) &&
        (!q || [c.number, c.description, clients.get(c.clientId)?.name ?? ""].some((s) => s.toLowerCase().includes(q))),
    )
  }, [charges, clients, search, status, method, view])

  return (
    <div className="space-y-4">
      <StatGrid>
        <StatCard label={`Recebido · ${range.label.toLowerCase()}`} value={formatMoney(sum(stats.received, (c) => c.amount))} icon={CircleCheck} highlight hint={`${stats.received.length} pagamento(s)`} />
        <StatCard label="Pendente" value={formatMoney(sum(stats.pending, (c) => c.amount))} icon={Clock} hint={`${stats.pending.length} cobrança(s)`} />
        <StatCard label="Vencido" value={formatMoney(sum(stats.overdue, (c) => c.amount))} icon={AlertTriangle} hint={`${stats.overdue.length} cobrança(s)`} />
        <StatCard label="Total emitido" value={charges.length} icon={Wallet} hint="cobranças" />
      </StatGrid>

      <div>
        <FinanceToolbar title="Cobranças">
          <AsaasSyncButton />
          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              downloadCsv(
                "cobrancas",
                filtered.map((c) => ({
                  Número: c.number,
                  Cliente: clients.get(c.clientId)?.name,
                  Descrição: c.description,
                  Forma: PAYMENT_METHOD_LABEL[c.method],
                  Parcela: `${c.installment}/${c.installments}`,
                  Vencimento: formatDate(c.dueDate),
                  Valor: c.amount.toFixed(2).replace(".", ","),
                  Status: CHARGE_STATUS_LABEL[c.status],
                })),
              )
            }
          >
            <Download />
            Exportar
          </Button>
          <Button size="sm" onClick={() => openQuickCreate("charge")}>
            <Plus />
            Nova cobrança
          </Button>
        </FinanceToolbar>
        <div className="mb-4 flex flex-wrap gap-2" role="group" aria-label="Visualizações de cobranças">
          {[
            { key: "all", label: "Todas", count: charges.length },
            { key: "open", label: "Em aberto", count: stats.pending.length + stats.overdue.length },
            { key: "overdue", label: "Vencidas", count: stats.overdue.length },
            { key: "undated", label: "Sem data", count: charges.filter(c => !c.dueDate && (c.status === "pendente" || c.status === "vencido")).length },
          ].map(item => <Button key={item.key} size="sm" variant={view === item.key ? "default" : "outline"} aria-pressed={view === item.key} onClick={() => { setView(item.key); setStatus(ALL) }}>{item.label}<span className="num rounded bg-background/20 px-1.5 text-xs">{item.count}</span></Button>)}
        </div>
        <FilterBar
          search={search}
          onSearch={setSearch}
          searchPlaceholder="Buscar por número, cliente ou descrição"
          filters={[
            { key: "status", label: "Status", options: toOptions(CHARGE_STATUS_LABEL), value: status, onChange: setStatus },
            { key: "method", label: "Forma", options: toOptions(PAYMENT_METHOD_LABEL), value: method, onChange: setMethod },
          ]}
          onClear={() => {
            setView("all")
            setSearch("")
            setStatus(ALL)
            setMethod(ALL)
          }}
        />
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
          <p role="status" aria-live="polite">{filtered.length} de {charges.length} cobranças · {formatMoney(sum(filtered, c => c.amount))}</p>
          <p>Selecione uma cobrança para ver detalhes e alterar a data.</p>
        </div>
        {filtered.length === 0 && charges.length > 0 && <div className="mb-3 rounded-lg border border-dashed p-4 text-sm"><p>Nenhuma cobrança corresponde aos filtros.</p><Button variant="link" size="sm" onClick={() => { setView("all"); setSearch(""); setStatus(ALL); setMethod(ALL) }}>Mostrar todas as cobranças</Button></div>}
        <ChargeTable charges={filtered} onOpen={(c) => setChargeId(c.id)} />
      </div>
      <ChargeDrawer chargeId={chargeId} onOpenChange={(o) => !o && setChargeId(null)} />
    </div>
  )
}
