"use client"

import { useCallback, useMemo, useState } from "react"
import { Plus } from "lucide-react"
import { Button } from "@/components/ui/button"
import { FilterBar, ALL, matches } from "@/components/shared/filter-bar"
import { KanbanBoard, type KanbanColumn } from "@/components/shared/kanban-board"
import { PageHeader } from "@/components/shared/page-header"
import { DealCard } from "@/components/sales/deal-card"
import { DealEditDialog } from "@/components/sales/deal-edit-dialog"
import { useStageMover } from "@/components/sales/use-stage-mover"
import { orderedStages, TONE_COLOR } from "@/components/sales/utils"
import { PROJECT_TYPE_LABEL, SOURCE_LABEL, STAGE_TONE, toOptions } from "@/lib/constants"
import { useById, useDeals, usePipelines } from "@/lib/data"
import { useEntityOptions } from "@/lib/data/options"
import { isStaleDeal, sum } from "@/lib/data/selectors"
import { formatMoney } from "@/lib/format"
import { useUiStore } from "@/lib/store/ui-store"
import type { Deal, StageKey } from "@/types"

export function KanbanView() {
  const deals = useDeals()
  const leads = useById("leads")
  const pipelines = usePipelines()
  const { userOptions } = useEntityOptions()
  const openQuickCreate = useUiStore((s) => s.openQuickCreate)
  const { requestMove, dialog } = useStageMover()

  const [pipelineId, setPipelineId] = useState(ALL)
  const [owner, setOwner] = useState(ALL)
  const [type, setType] = useState(ALL)
  const [source, setSource] = useState(ALL)
  const [search, setSearch] = useState("")
  const [editingId, setEditingId] = useState<string | null>(null)
  const clients = useById("clients")

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return deals.filter((d) => {
      if (!matches(pipelineId, d.pipelineId) || !matches(owner, d.ownerId) || !matches(type, d.projectType) || !matches(source, d.source)) return false
      if (!q) return true
      const lead = leads.get(d.leadId)
      return `${d.title} ${lead?.name ?? ""} ${lead?.company ?? ""}`.toLowerCase().includes(q)
    })
  }, [deals, leads, pipelineId, owner, type, source, search])

  const pipeline = pipelines.find((p) => p.id === pipelineId)
  const columns: KanbanColumn[] = useMemo(
    () =>
      orderedStages(pipeline).map((stage) => {
        const list = filtered.filter((d) => d.stage === stage.key)
        const monthly = sum(list, (d) => d.monthlyFee)
        return {
          id: stage.key,
          title: stage.name,
          accent: TONE_COLOR[STAGE_TONE[stage.key]],
          meta: (
            <div className="flex items-baseline justify-between gap-2">
              <span className="num font-medium text-foreground">{formatMoney(sum(list, (d) => d.value))}</span>
              {monthly > 0 && <span className="num">+ {formatMoney(monthly)}/mês</span>}
            </div>
          ),
        }
      }),
    [pipeline, filtered],
  )

  const getId = useCallback((d: Deal) => d.id, [])
  const getColumnId = useCallback((d: Deal) => d.stage, [])
  const stale = filtered.filter(isStaleDeal).length

  return (
    <div>
      <PageHeader
        title="Kanban de negócios"
        description={`${filtered.length} negócio(s) · ${stale} parado(s) há mais de 7 dias`}
        actions={
          <Button onClick={() => openQuickCreate("deal")}>
            <Plus />
            Novo negócio
          </Button>
        }
      />
      <FilterBar
        search={search}
        onSearch={setSearch}
        searchPlaceholder="Buscar negócio ou lead"
        filters={[
          { key: "pipeline", label: "Pipeline", value: pipelineId, onChange: setPipelineId, options: pipelines.map((p) => ({ value: p.id, label: p.name })) },
          { key: "owner", label: "Responsável", value: owner, onChange: setOwner, options: userOptions },
          { key: "type", label: "Tipo", value: type, onChange: setType, options: toOptions(PROJECT_TYPE_LABEL) },
          { key: "source", label: "Origem", value: source, onChange: setSource, options: toOptions(SOURCE_LABEL) },
        ]}
        onClear={() => {
          setPipelineId(ALL)
          setOwner(ALL)
          setType(ALL)
          setSource(ALL)
          setSearch("")
        }}
      />
      <KanbanBoard
        columns={columns}
        items={filtered}
        getId={getId}
        getColumnId={getColumnId}
        emptyLabel="Nenhum negócio nesta etapa"
        renderCard={(deal, { overlay }) => (
          <DealCard deal={deal} lead={leads.get(deal.leadId)} clientName={clients.get(deal.clientId ?? "")?.name} overlay={overlay} onOpen={overlay ? undefined : () => setEditingId(deal.id)} />
        )}
        onMove={(id, to) => {
          const deal = deals.find((d) => d.id === id)
          if (deal && deal.stage !== to) requestMove(deal, to as StageKey)
        }}
      />
      <DealEditDialog deal={deals.find((d) => d.id === editingId) ?? null} onOpenChange={(o) => !o && setEditingId(null)} onStageChange={requestMove} />
      {dialog}
    </div>
  )
}
