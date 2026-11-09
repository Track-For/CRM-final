import type { Tone } from "@/lib/constants"
import { STAGE_LABEL, STAGE_ORDER } from "@/lib/constants"
import type { Deal, Pipeline, PipelineStage, StageKey } from "@/types"

/** Cor sólida (CSS var) para cada tom, usada em faixas e barras. */
export const TONE_COLOR: Record<Tone, string> = {
  neutral: "var(--chart-muted)",
  brand: "var(--primary)",
  success: "var(--success)",
  warning: "var(--warning)",
  danger: "var(--danger)",
  info: "var(--info)",
  purple: "var(--chart-4)",
}

export function stageName(pipelines: Pipeline[], pipelineId: string | undefined, key: StageKey): string {
  if (!pipelineId) {
    const names = [...new Set(pipelines.flatMap(p => p.stages.filter(s => s.key === key).map(s => s.name)))]
    return names.length ? names.join(" / ") : STAGE_LABEL[key]
  }
  const p = pipelines.find((x) => x.id === pipelineId)
  return p?.stages.find((s) => s.key === key)?.name ?? STAGE_LABEL[key]
}

/** Etapas ordenadas de um pipeline (ou a ordem padrão quando "todos"). */
export function orderedStages(pipeline: Pipeline | undefined): PipelineStage[] {
  if (pipeline) return [...pipeline.stages].sort((a, b) => a.order - b.order)
  return STAGE_ORDER.map((key, order) => ({
    key,
    order,
    name: STAGE_LABEL[key],
    probability: 0,
    kind: key === "ganho" ? "won" : key === "perdido" ? "lost" : "open",
  }))
}

/** Maior etapa (índice em STAGE_ORDER, sem "perdido") que o negócio alcançou. */
export function reachedIndex(deal: Deal): number {
  let max = 0
  const consider = (k?: StageKey) => {
    if (!k || k === "perdido") return
    max = Math.max(max, STAGE_ORDER.indexOf(k))
  }
  consider(deal.stage)
  for (const h of deal.history) consider(h.toStage)
  return max
}

/** Dias passados em cada etapa, a partir do histórico. */
export function timeInStages(deal: Deal, now = Date.now()): Partial<Record<StageKey, number>> {
  const steps = deal.history
    .filter((h) => h.toStage)
    .slice()
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
  const out: Partial<Record<StageKey, number>> = {}
  steps.forEach((h, i) => {
    const key = h.toStage!
    if (key === "ganho" || key === "perdido") return
    const start = new Date(h.createdAt).getTime()
    const next = steps.slice(i + 1).find((n) => n.toStage !== key)
    const end = next ? new Date(next.createdAt).getTime() : deal.stage === key ? now : start
    out[key] = (out[key] ?? 0) + Math.max(0, end - start) / 86400000
  })
  return out
}

export function formatDuration(days: number): string {
  const v = Math.round(days * 10) / 10
  return `${v.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} ${v === 1 ? "dia" : "dias"}`
}
