"use client"

import { useCallback, useEffect, useState } from "react"
import Link from "next/link"
import { ArrowUpRight, Loader2, RefreshCw, Sparkles } from "lucide-react"
import { PageHeader } from "@/components/shared/page-header"
import { Panel } from "@/components/shared/panel"
import { StatusBadge } from "@/components/shared/status-badge"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { analyzeManagement, getManagementAiState } from "@/lib/ai/management-actions"
import { managementLabels, type ManagementReport } from "@/lib/ai/management-model"

export function ManagementAiView() {
  const [state, setState] = useState<Awaited<ReturnType<typeof getManagementAiState>> | null>(null)
  const [report, setReport] = useState<ManagementReport | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const [prompt, setPrompt] = useState("")
  const load = useCallback(async () => {
    setLoading(true)
    try { const result = await getManagementAiState(); setState(result); setReport(result.report); setError("") }
    catch (e) { setError(e instanceof Error ? e.message : "Não foi possível carregar a central de IA.") }
    finally { setLoading(false) }
  }, [])
  useEffect(() => { const initial = setTimeout(() => void load(), 0); return () => clearTimeout(initial) }, [load])
  async function analyze() {
    setBusy(true); setError("")
    try { setReport(await analyzeManagement(prompt)) }
    catch (e) { setError(e instanceof Error ? e.message : "Não foi possível gerar a análise.") }
    finally { setBusy(false) }
  }
  const sources = new Map(report?.context.records.map(record => [record.key, record]) || [])
  const coverage = report?.context.coverage || state?.context.coverage || []
  const isOld = report && state && Date.parse(state.context.checkedAt) - Date.parse(report.context.checkedAt) > 86400000
  return <div className="space-y-5">
    <PageHeader title="Central de IA" description="Prioridades e próximos passos para o comercial, financeiro e operação, com base nos registros do CRM." actions={<><Button variant="outline" disabled={loading || busy} onClick={() => void load()}><RefreshCw />Atualizar dados</Button><Button disabled={loading || busy || !state?.configured || !state.context.records.length} onClick={() => void analyze()}>{busy ? <Loader2 className="animate-spin" /> : <Sparkles />}{busy ? "Analisando…" : "Gerar análise"}</Button></>} />
    {error && <p role="alert" className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm">{error}</p>}
    {loading && <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" />Carregando registros e última análise…</p>}
    {state && !state.configured && <Panel title="Conecte a IA"><p className="text-sm">Cadastre a chave e o modelo em Integrações → WhatsApp e IA. A central utiliza a mesma conexão.</p></Panel>}
    <Panel title="Oriente a análise" description="Diga à IA o que você quer investigar ou priorizar nesta análise.">
      <label htmlFor="management-ai-prompt" className="mb-2 block text-sm font-medium">Seu prompt (opcional)</label>
      <Textarea id="management-ai-prompt" value={prompt} onChange={event => setPrompt(event.target.value)} disabled={busy} maxLength={2000} rows={4} aria-describedby="management-ai-prompt-help" placeholder="Ex.: priorize negócios parados há mais de 7 dias e sugira próximos passos para retomar as vendas." />
      <div id="management-ai-prompt-help" className="mt-2 flex flex-wrap justify-between gap-2 text-xs text-muted-foreground"><span>Deixe vazio para uma análise geral. Depois, clique em Gerar análise.</span><span>{prompt.length}/2.000 caracteres</span></div>
    </Panel>
    <Panel title="Áreas da análise" description="A IA acessa apenas as áreas permitidas ao seu usuário. Os números representam registros pendentes elegíveis; cada área inclui até 20 registros, priorizando as datas mais antigas.">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">{coverage.map(item => <div key={item.resource} className="rounded-xl border p-3"><p className="text-xs text-muted-foreground">{managementLabels[item.resource]}</p><p className="mt-1 text-xl font-semibold">{item.total}</p><p className="mt-1 text-xs text-muted-foreground">{item.included} na análise</p></div>)}</div>
      <p className="mt-4 text-xs text-muted-foreground">Ao gerar, nomes, situações, valores comerciais e financeiros permitidos e prazos são enviados ao provedor configurado. A consulta utiliza créditos da API. Revise as sugestões antes de agir.</p>
    </Panel>
    {report ? <>
      <Panel title="Visão geral" description={`Dados consultados em ${new Date(report.context.checkedAt).toLocaleString("pt-BR")}`}>
        {report.prompt && <div className="mb-4 rounded-lg border bg-muted/30 p-3"><p className="text-xs font-semibold">Prompt utilizado</p><p className="mt-1 whitespace-pre-wrap break-words text-sm">{report.prompt}</p></div>}
        {isOld && <p className="mb-3 text-sm text-amber-600">Esta análise tem mais de 24 horas. Gere outra antes de tomar decisões.</p>}
        <p className="whitespace-pre-wrap text-sm leading-relaxed">{report.analysis.summary}</p>
      </Panel>
      <section aria-label="Prioridades sugeridas" className="grid gap-4 lg:grid-cols-2">{report.analysis.findings.map((finding, index) => <Panel key={index} title={finding.title} actions={<StatusBadge tone={finding.priority === "alta" ? "danger" : finding.priority === "media" ? "warning" : "neutral"}>Prioridade {finding.priority === "media" ? "média" : finding.priority}</StatusBadge>}>
        <p className="mb-2 text-xs font-medium text-primary">{managementLabels[finding.area]}</p>
        <p className="whitespace-pre-wrap text-sm leading-relaxed">{finding.observation}</p>
        <div className="mt-4 rounded-lg bg-muted/40 p-3"><p className="text-xs font-semibold">Próximo passo sugerido</p><p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed">{finding.nextStep}</p></div>
        <div className="mt-4 flex flex-wrap gap-2">{[...new Set(finding.evidence)].map(key => { const source = sources.get(key); return source ? <Button key={key} size="sm" variant="outline" asChild><Link href={source.href}><span className="max-w-52 truncate">{source.label}</span><ArrowUpRight /></Link></Button> : null })}</div>
      </Panel>)}</section>
      {!report.analysis.findings.length && <p className="text-sm text-muted-foreground">A IA não identificou recomendações com evidências suficientes neste recorte.</p>}
    </> : !loading && <Panel title="O que merece atenção hoje?"><p className="text-sm text-muted-foreground">Gere uma análise para identificar oportunidades comerciais, propostas sem retorno, vencimentos e pendências de projetos e tarefas. Cada recomendação terá referências aos registros usados.</p></Panel>}
  </div>
}
