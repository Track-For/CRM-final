"use client"

import { useState } from "react"
import Link from "next/link"
import { ArrowDown, ArrowUp, Filter, Plus } from "lucide-react"
import { toast } from "@/lib/store/save-feedback"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Panel } from "@/components/shared/panel"
import { StatusBadge } from "@/components/shared/status-badge"
import { newId, useCrm, useDeals, usePipelines } from "@/lib/data"
import type { Pipeline, PipelineStage } from "@/types"

function PipelineEditor({ pipeline, dealCount }: { pipeline: Pipeline; dealCount: number }) {
  const update = useCrm((s) => s.update)
  const [name, setName] = useState(pipeline.name)
  const [stages, setStages] = useState<PipelineStage[]>(pipeline.stages)
  const dirty = name !== pipeline.name || JSON.stringify(stages) !== JSON.stringify(pipeline.stages)
  const openCount = stages.filter((s) => s.kind === "open").length

  const patch = (key: PipelineStage["key"], p: Partial<PipelineStage>) => setStages((list) => list.map((s) => (s.key === key ? { ...s, ...p } : s)))
  const move = (index: number, to: number) =>
    setStages((list) => {
      const next = [...list]
      const [item] = next.splice(index, 1)
      next.splice(to, 0, item)
      return next.map((s, order) => ({ ...s, order }))
    })

  const save = () => {
    if (!name.trim()) return toast.error("Nome do pipeline é obrigatório")
    if (stages.some((s) => !s.name.trim())) return toast.error("Toda etapa precisa de nome")
    if (stages.some((s) => s.probability < 0 || s.probability > 100)) return toast.error("Probabilidade deve ficar entre 0% e 100%")
    update("pipelines", pipeline.id, { name: name.trim(), stages })
    toast.success(`Pipeline ${name.trim()} salvo`)
  }

  return (
    <Panel
      title={
        <span className="inline-flex items-center gap-2">
          {pipeline.name}
          <StatusBadge dot={false}>
            <span className="num">{dealCount}</span> negócios
          </StatusBadge>
        </span>
      }
      description={pipeline.description}
      actions={
        <Button size="sm" onClick={save} disabled={!dirty}>
          Salvar
        </Button>
      }
    >
      <div className="mb-4 max-w-sm">
        <label className="text-xs text-muted-foreground" htmlFor={`pip-${pipeline.id}`}>
          Nome do pipeline
        </label>
        <Input id={`pip-${pipeline.id}`} value={name} onChange={(e) => setName(e.target.value)} className="mt-1.5" />
      </div>
      <div className="space-y-2">
        <div className="hidden grid-cols-[32px_minmax(0,1fr)_120px_72px] gap-2 px-1 text-xs text-muted-foreground sm:grid">
          <span>#</span>
          <span>Etapa</span>
          <span>Probabilidade</span>
          <span />
        </div>
        {stages.map((s, i) => (
          <div key={s.key} className="grid grid-cols-[32px_minmax(0,1fr)_88px] items-center gap-2 rounded-lg border bg-surface p-2 sm:grid-cols-[32px_minmax(0,1fr)_120px_72px]">
            <span className="num text-center text-xs text-muted-foreground">{i + 1}</span>
            <Input value={s.name} onChange={(e) => patch(s.key, { name: e.target.value })} aria-label="Nome da etapa" />
            <div className="relative">
              <Input
                type="number"
                min={0}
                max={100}
                className="num pr-6"
                value={s.probability}
                disabled={s.kind !== "open"}
                onChange={(e) => patch(s.key, { probability: Number(e.target.value) })}
                aria-label="Probabilidade padrão"
              />
              <span className="pointer-events-none absolute top-1/2 right-2 -translate-y-1/2 text-xs text-muted-foreground">%</span>
            </div>
            <div className="col-span-3 flex justify-end gap-1 sm:col-span-1">
              {s.kind === "open" ? (
                <>
                  <Button variant="ghost" size="icon-sm" disabled={i === 0} onClick={() => move(i, i - 1)} aria-label="Subir etapa">
                    <ArrowUp />
                  </Button>
                  <Button variant="ghost" size="icon-sm" disabled={i >= openCount - 1} onClick={() => move(i, i + 1)} aria-label="Descer etapa">
                    <ArrowDown />
                  </Button>
                </>
              ) : (
                <StatusBadge tone={s.kind === "won" ? "success" : "danger"}>{s.kind === "won" ? "Ganho" : "Perdido"}</StatusBadge>
              )}
            </div>
          </div>
        ))}
      </div>
    </Panel>
  )
}

export function PipelinesSettings() {
  const pipelines = usePipelines()
  const deals = useDeals()
  const add = useCrm((s) => s.add)

  const createPipeline = () => {
    const base = pipelines[0]
    if (!base) return
    add("pipelines", { id: newId("pip"), name: "Novo pipeline", description: "Pipeline personalizado", stages: base.stages.map((s) => ({ ...s })) })
    toast.success("Pipeline criado", { description: "Renomeie e ajuste as etapas" })
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">Renomeie, reordene e defina a probabilidade padrão de cada etapa.</p>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" asChild>
            <Link href="/funil">
              <Filter /> Ver funil
            </Link>
          </Button>
          <Button size="sm" onClick={createPipeline}>
            <Plus /> Novo pipeline
          </Button>
        </div>
      </div>
      {pipelines.map((p) => (
        <PipelineEditor key={p.id} pipeline={p} dealCount={deals.filter((d) => d.pipelineId === p.id).length} />
      ))}
    </div>
  )
}
