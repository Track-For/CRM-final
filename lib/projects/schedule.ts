/** Divide o prazo total em fases do cronograma, somando exatamente o total. */
export function schedulePhases(totalDays: number): { label: string; days: number }[] {
  const weights: [string, number][] = [
    ["Briefing e planejamento", 0.15],
    ["Design e aprovação", 0.3],
    ["Desenvolvimento", 0.4],
    ["Testes e publicação", 0.15],
  ]
  if (totalDays < weights.length) return [{ label: "Execução completa", days: Math.max(1, totalDays) }]
  const phases = weights.map(([label, w]) => ({ label, days: Math.max(1, Math.round(totalDays * w)) }))
  const diff = totalDays - phases.reduce((s, p) => s + p.days, 0)
  phases[2].days = Math.max(1, phases[2].days + diff)
  return phases
}
