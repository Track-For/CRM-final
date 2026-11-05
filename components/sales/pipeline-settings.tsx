"use client"

import { useState } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { toast } from "sonner"
import { ArrowDown, ArrowUp, Lock, Plus, RotateCcw, Save } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { FormDialog } from "@/components/forms/form-dialog"
import { FormField } from "@/components/shared/form-field"
import { Panel } from "@/components/shared/panel"
import { StatusBadge } from "@/components/shared/status-badge"
import { TONE_COLOR } from "@/components/sales/utils"
import { STAGE_LABEL, STAGE_ORDER, STAGE_TONE } from "@/lib/constants"
import { newId, useCrm, useDeals } from "@/lib/data"
import { v } from "@/lib/validation"
import type { Pipeline, PipelineStage } from "@/types"

const stagesSchema = z.array(
  z.object({
    name: z.string().trim().min(1, "Nome da etapa é obrigatório").max(40, "Máximo de 40 caracteres"),
    probability: z.number({ error: "Informe a probabilidade" }).int("Use um número inteiro").min(0, "Mínimo 0%").max(100, "Máximo 100%"),
  }),
)

const pipelineSchema = z.object({
  name: v.required("Nome do pipeline"),
  description: z.string().trim().max(160, "Máximo de 160 caracteres").optional(),
})
type PipelineValues = z.infer<typeof pipelineSchema>

const DEFAULT_PROB: Record<string, number> = { novo_lead: 10, contato_feito: 20, call_agendada: 35, proposta_enviada: 55, negociacao: 75, ganho: 100, perdido: 0 }

/** Editor de etapas de um pipeline: renomear, reordenar e probabilidade padrão. */
export function StageEditor({ pipeline }: { pipeline: Pipeline }) {
  const update = useCrm((s) => s.update)
  const deals = useDeals()
  const sorted = [...pipeline.stages].sort((a, b) => a.order - b.order)
  const [stages, setStages] = useState<PipelineStage[]>(sorted)
  const [name, setName] = useState(pipeline.name)
  const [description, setDescription] = useState(pipeline.description)
  const [errors, setErrors] = useState<Record<number, string>>({})
  const dirty = JSON.stringify(stages) !== JSON.stringify(sorted) || name !== pipeline.name || description !== pipeline.description
  const dealsCount = deals.filter((d) => d.pipelineId === pipeline.id).length

  const patch = (i: number, p: Partial<PipelineStage>) => setStages((prev) => prev.map((s, k) => (k === i ? { ...s, ...p } : s)))
  const move = (i: number, dir: -1 | 1) =>
    setStages((prev) => {
      const next = [...prev]
      const j = i + dir
      if (j < 0 || j >= next.length || next[j].kind !== "open" || next[i].kind !== "open") return prev
      ;[next[i], next[j]] = [next[j], next[i]]
      return next.map((s, order) => ({ ...s, order }))
    })

  const save = () => {
    if (!name.trim()) {
      toast.error("Nome do pipeline é obrigatório")
      return
    }
    const parsed = stagesSchema.safeParse(stages.map((s) => ({ name: s.name, probability: s.probability })))
    if (!parsed.success) {
      const errs: Record<number, string> = {}
      for (const issue of parsed.error.issues) {
        const idx = Number(issue.path[0])
        if (!(idx in errs)) errs[idx] = issue.message
      }
      setErrors(errs)
      toast.error("Corrija as etapas destacadas")
      return
    }
    setErrors({})
    update("pipelines", pipeline.id, {
      name: name.trim(),
      description: description.trim(),
      stages: stages.map((s, order) => ({ ...s, name: s.name.trim(), order })),
    })
    toast.success("Pipeline salvo", { description: "As novas probabilidades valem para os próximos movimentos." })
  }

  return (
    <Panel
      title={pipeline.name}
      description={`${dealsCount} negócio(s) neste pipeline`}
      actions={
        <>
          <Button
            variant="ghost"
            size="sm"
            disabled={!dirty}
            onClick={() => {
              setStages(sorted)
              setName(pipeline.name)
              setDescription(pipeline.description)
              setErrors({})
            }}
          >
            <RotateCcw />
            Descartar
          </Button>
          <Button size="sm" disabled={!dirty} onClick={save}>
            <Save />
            Salvar
          </Button>
        </>
      }
    >
      <div className="mb-5 grid gap-3 sm:grid-cols-2">
        <FormField label="Nome do pipeline" required>
          <Input value={name} onChange={(e) => setName(e.target.value)} />
        </FormField>
        <FormField label="Descrição">
          <Input value={description} onChange={(e) => setDescription(e.target.value)} />
        </FormField>
      </div>
      <ul className="space-y-2">
        {stages.map((s, i) => {
          const locked = s.kind !== "open"
          return (
            <li key={s.key} className="rounded-lg border bg-surface p-3">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                <div className="flex items-center gap-2">
                  <span className="h-8 w-1 rounded-full" style={{ backgroundColor: TONE_COLOR[STAGE_TONE[s.key]] }} />
                  <div className="flex flex-col">
                    <Button variant="ghost" size="icon-xs" aria-label="Subir etapa" disabled={locked || i === 0} onClick={() => move(i, -1)}>
                      <ArrowUp />
                    </Button>
                    <Button variant="ghost" size="icon-xs" aria-label="Descer etapa" disabled={locked || stages[i + 1]?.kind !== "open"} onClick={() => move(i, 1)}>
                      <ArrowDown />
                    </Button>
                  </div>
                  <span className="num w-5 text-xs text-muted-foreground">{i + 1}</span>
                </div>
                <div className="min-w-0 flex-1">
                  <Input value={s.name} onChange={(e) => patch(i, { name: e.target.value })} aria-invalid={i in errors} aria-label="Nome da etapa" />
                  <p className="mt-1 text-[11px] text-muted-foreground">Etapa base: {STAGE_LABEL[s.key]}</p>
                </div>
                <div className="flex items-center gap-2">
                  <div className="relative w-24">
                    <Input
                      type="number"
                      min={0}
                      max={100}
                      className="num pr-6"
                      value={Number.isFinite(s.probability) ? s.probability : ""}
                      disabled={locked}
                      onChange={(e) => patch(i, { probability: e.target.value === "" ? Number.NaN : Number(e.target.value) })}
                      aria-label="Probabilidade padrão"
                    />
                    <span className="pointer-events-none absolute top-1/2 right-2 -translate-y-1/2 text-xs text-muted-foreground">%</span>
                  </div>
                  {locked ? (
                    <StatusBadge tone={s.kind === "won" ? "success" : "danger"}>
                      <Lock className="size-3" />
                      {s.kind === "won" ? "Ganho" : "Perdido"}
                    </StatusBadge>
                  ) : (
                    <StatusBadge tone="neutral">Aberta</StatusBadge>
                  )}
                </div>
              </div>
              {errors[i] && <p className="mt-2 text-xs text-danger">{errors[i]}</p>}
            </li>
          )
        })}
      </ul>
      <p className="mt-3 text-xs text-muted-foreground">Ganho e Perdido são etapas finais fixas. A probabilidade padrão é aplicada quando um negócio entra na etapa.</p>
    </Panel>
  )
}

/** Modal de criação de um novo pipeline com as etapas padrão. */
export function NewPipelineDialog({ open, onOpenChange, onCreated }: { open: boolean; onOpenChange: (o: boolean) => void; onCreated: (id: string) => void }) {
  const add = useCrm((s) => s.add)
  const { register, handleSubmit, reset, formState } = useForm<PipelineValues>({ resolver: zodResolver(pipelineSchema), defaultValues: { name: "", description: "" } })

  const onSubmit = handleSubmit((values) => {
    const pipeline: Pipeline = {
      id: newId("pip"),
      name: values.name,
      description: values.description ?? "",
      stages: STAGE_ORDER.map((key, order) => ({
        key,
        order,
        name: STAGE_LABEL[key],
        probability: DEFAULT_PROB[key],
        kind: key === "ganho" ? "won" : key === "perdido" ? "lost" : "open",
      })),
    }
    add("pipelines", pipeline)
    toast.success("Pipeline criado")
    reset({ name: "", description: "" })
    onOpenChange(false)
    onCreated(pipeline.id)
  })

  return (
    <FormDialog open={open} onOpenChange={onOpenChange} title="Novo pipeline" description="Começa com as etapas padrão; você pode renomear depois." onSubmit={onSubmit} submitLabel="Criar pipeline" size="md">
      <FormField label="Nome" required error={formState.errors.name?.message}>
        <Input {...register("name")} placeholder="Ex.: Aplicativos" aria-invalid={!!formState.errors.name} />
      </FormField>
      <FormField label="Descrição" error={formState.errors.description?.message}>
        <Textarea {...register("description")} rows={2} />
      </FormField>
    </FormDialog>
  )
}

export function PipelineSettings({ selectedId, onSelect }: { selectedId: string; onSelect: (id: string) => void }) {
  const pipelines = useCrm((s) => s.pipelines)
  const [creating, setCreating] = useState(false)
  const selected = pipelines.find((p) => p.id === selectedId) ?? pipelines[0]

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {pipelines.map((p) => (
          <Button key={p.id} variant={p.id === selected?.id ? "default" : "outline"} size="sm" onClick={() => onSelect(p.id)}>
            {p.name}
          </Button>
        ))}
        <Button variant="ghost" size="sm" onClick={() => setCreating(true)}>
          <Plus />
          Novo pipeline
        </Button>
      </div>
      {selected && <StageEditor key={`${selected.id}-${JSON.stringify(selected.stages)}-${selected.name}`} pipeline={selected} />}
      <NewPipelineDialog open={creating} onOpenChange={setCreating} onCreated={onSelect} />
    </div>
  )
}
