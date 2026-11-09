"use client"

import Link from "next/link"
import { useCallback, useEffect, useState } from "react"
import { RefreshCw, Download, Target, TrendingUp, Code2, Trash2, Pencil } from "lucide-react"
import { toast } from "@/lib/store/save-feedback"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { PageHeader } from "@/components/shared/page-header"
import { Panel } from "@/components/shared/panel"
import { StatCard } from "@/components/shared/stat-card"
import { ReportTable } from "@/components/reports/report-table"
import { getCommercialData, removeCommercialRecord, retryAutomation, saveCommercialRecord, type CommercialData } from "@/lib/commercial/actions"
import { automationEvents, automationSchema, goalSchema, reportSchema, sources, stages, type Automation, type Goal, type SavedReport, type StoredRow } from "@/lib/commercial/model"
import { forecast, goalProgress, localDay, runReport } from "@/lib/commercial/metrics"
import { stageName } from "@/components/sales/utils"
import type { StageKey } from "@/types"
import { SOURCE_LABEL, STAGE_LABEL, WEBHOOK_EVENTS } from "@/lib/constants"
import { downloadCsv } from "@/lib/browser"
import { formatMoney } from "@/lib/format"
import type { Deal, Lead } from "@/types"

const selectClass = "h-10 w-full rounded-md border bg-background px-3 text-sm focus-visible:outline-2 focus-visible:outline-ring"
function Field({ label, children }: { label: string; children: React.ReactNode }) { return <label className="grid min-w-0 gap-1.5 text-xs font-medium">{label}{children}</label> }
function Options({ label, value, onChange, options, empty }: { label: string; value: string; onChange: (v: string) => void; options: { value: string; label: string }[]; empty?: string }) {
  return <Field label={label}><select className={selectClass} value={value} onChange={e => onChange(e.target.value)}>{empty !== undefined && <option value="">{empty}</option>}{options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}</select></Field>
}
function errorText(e: unknown) { return e instanceof Error ? e.message : "Não foi possível salvar." }
const collect = <T,>(data: CommercialData, resource: string) => data.rows.filter(r => r.resource === resource).map(r => ({ ...r.data, id: r.id }) as T)
const monthNow = () => localDay(new Date().toISOString()).slice(0, 7)
const goalLabels = { receivedValue: "Receita recebida (projetos + mensalidades)", wonValue: "Valor contratado (inclui valores ainda sem pagamento)", wonCount: "Quantidade de contratos ganhos", newLeads: "Novos leads" }

export function CommercialView() {
  const [data, setData] = useState<CommercialData | null>(null)
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const load = useCallback(async () => {
    try { setData(await getCommercialData()); setError("") }
    catch (e) { setError(errorText(e)) }
    finally { setLoading(false) }
  }, [])
  useEffect(() => { const timer = setTimeout(() => void load(), 0); return () => clearTimeout(timer) }, [load])
  async function mutate(action: () => Promise<unknown>) {
    if (busy) return
    setBusy(true)
    try { await action(); await load(); toast.success("Alteração salva") }
    catch (e) { toast.error(errorText(e)); throw e }
    finally { setBusy(false) }
  }
  return <div className="space-y-5">
    <PageHeader title="Gestão comercial" description="Defina metas, acompanhe a previsão de vendas e configure seus processos." actions={<><Button variant="outline" disabled={loading || busy} onClick={() => void load()}><RefreshCw />Atualizar</Button><Button variant="outline" asChild><Link href="/integracoes/api"><Code2 />API de integrações</Link></Button></>} />
    {error && <p role="alert" className="rounded-lg border border-destructive/30 p-3 text-sm text-destructive">{error}</p>}
    {loading && <p role="status" className="py-12 text-center text-muted-foreground">Carregando gestão comercial…</p>}
    {data && <Tabs defaultValue="forecast" className="gap-5">
      <div className="overflow-x-auto"><TabsList><TabsTrigger value="forecast">Previsão de vendas</TabsTrigger><TabsTrigger value="goals">Metas</TabsTrigger><TabsTrigger value="reports">Relatórios personalizados</TabsTrigger>{data.canManageAutomations && <TabsTrigger value="automations">Automações</TabsTrigger>}</TabsList></div>
      <TabsContent value="forecast"><ForecastPanel data={data} /></TabsContent>
      <TabsContent value="goals"><GoalsPanel data={data} busy={busy} mutate={mutate} /></TabsContent>
      <TabsContent value="reports"><ReportsPanel data={data} busy={busy} mutate={mutate} /></TabsContent>
      {data.canManageAutomations && <TabsContent value="automations"><AutomationsPanel data={data} busy={busy} mutate={mutate} /></TabsContent>}
    </Tabs>}
  </div>
}
type EditingProps = { data: CommercialData; busy: boolean; mutate: (action: () => Promise<unknown>) => Promise<void> }
function people(data: CommercialData) { return data.users.filter(u => u.active).map(u => ({ value: u.id, label: u.name })) }
function pipes(data: CommercialData) { return data.pipelines.map(p => ({ value: p.id, label: p.name })) }
function labelFor(value: string, data: CommercialData) { return data.users.find(u => u.id === value)?.name || (value in STAGE_LABEL ? stageName(data.pipelines, undefined, value as StageKey) : undefined) || SOURCE_LABEL[value as keyof typeof SOURCE_LABEL] || ({ todo: "A fazer", doing: "Em andamento", review: "Em revisão", done: "Concluída", novo: "Novo", em_contato: "Em contato", qualificado: "Qualificado", convertido: "Convertido", perdido: "Perdido" } as Record<string, string>)[value] || value }
function ForecastPanel({ data }: { data: CommercialData }) {
  const [month, setMonth] = useState(monthNow)
  const [owner, setOwner] = useState("")
  const [pipeline, setPipeline] = useState("")
  const projection = forecast(collect<Deal>(data, "deals"), data.pipelines, month, owner, pipeline, [], data.projectPaidByDeal, data.contractReceivables)
  const cash = data.receiptGroups.filter(g => g.month === month && (!owner || g.ownerId === owner) && (!pipeline || g.pipelineId === pipeline)).reduce((sum, g) => ({ total: sum.total + g.total, count: sum.count + g.count }), { total: 0, count: 0 })
  const result = { ...projection, closed: cash.total, receivedCount: cash.count, projected: cash.total + projection.contractedReceivable + projection.weighted }
  return <div className="space-y-4">
    <Panel title="Período e equipe" description="Recebimentos em reais pela data de pagamento, incluindo mensalidades. Contratos fechados entram pelo vencimento das parcelas pendentes; negócios abertos usam as probabilidades do funil.">
      <div className="grid gap-3 sm:grid-cols-3"><Field label="Mês previsto"><Input type="month" required value={month} onChange={e => e.target.value && setMonth(e.target.value)} /></Field><Options label="Responsável" value={owner} onChange={setOwner} options={people(data)} empty="Toda a equipe" /><Options label="Funil" value={pipeline} onChange={setPipeline} options={pipes(data)} empty="Todos os funis" /></div>
    </Panel>
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5"><StatCard label="Receita recebida no mês" value={formatMoney(result.closed)} hint={`${result.receivedCount} pagamentos · inclui mensalidades`} icon={Target} /><StatCard label="Contratos fechados a receber" value={formatMoney(result.contractedReceivable)} hint={`${result.receivables.length} parcelas com vencimento no mês · valor integral`} /><StatCard label="Previsão ponderada em aberto" value={formatMoney(result.weighted)} hint="Saldo do projeto × probabilidade da etapa" icon={TrendingUp} /><StatCard label="Total projetado" value={formatMoney(result.projected)} hint="Recebido + contratos a receber + previsão ponderada" /><StatCard label="Potencial em aberto" value={formatMoney(result.potential)} hint={`${result.openCount} negócios com fechamento previsto`} /></div>
    <Panel title="Contratos fechados a receber" description="Parcelas de projetos já ganhos, com vencimento no mês selecionado, pelo valor integral. O recebimento ainda depende do pagamento do cliente.">
      {!!result.missingDueDate && <p className="mb-4 text-xs text-muted-foreground">{result.missingDueDate} parcela(s) de contratos fechados sem vencimento válido ficaram fora da projeção. Defina o vencimento em Cobranças.</p>}
      {!result.receivables.length ? <p className="py-6 text-sm text-muted-foreground">Nenhuma parcela de contrato fechado a receber neste mês.</p> : <ReportTable rows={result.receivables} getKey={r => r.id} columns={[{ key: "title", label: "Contrato", render: r => <Link className="hover:underline" href={`/vendas/${r.dealId}`}>{r.title}</Link> }, { key: "description", label: "Parcela", render: r => r.description }, { key: "dueDate", label: "Vencimento", render: r => localDay(r.dueDate).split("-").reverse().join("/") }, { key: "amount", label: "A receber", render: r => formatMoney(r.amount) }]} />}
    </Panel>
    <Panel title="Negócios previstos" description="A previsão é uma estimativa baseada nas probabilidades configuradas no funil; não representa receita recebida." actions={<Button variant="outline" disabled={!result.deals.length} onClick={() => downloadCsv(`previsao-${month}`, result.deals.map(d => ({ Negócio: d.title, Responsável: labelFor(d.ownerId || "Sem responsável", data), Etapa: stageName(data.pipelines, d.pipelineId, d.stage), Valor: d.value, Probabilidade: d.probability, Ponderado: d.weighted, Fechamento: localDay(d.expectedCloseDate) })))}><Download />CSV</Button>}>
      {!!result.missingCloseDate && <p className="mb-4 text-xs text-muted-foreground">{result.missingCloseDate} negócio(s) em aberto sem data de fechamento válida ficaram fora da previsão.</p>}
      {!result.deals.length ? <p className="py-6 text-sm text-muted-foreground">Nenhum negócio em aberto previsto para este mês.</p> : <ReportTable rows={result.deals} getKey={d => d.id} columns={[{ key: "title", label: "Negócio", render: d => <Link className="hover:underline" href={`/vendas/${d.id}`}>{d.title}</Link> }, { key: "stage", label: "Etapa", render: d => stageName(data.pipelines, d.pipelineId, d.stage) }, { key: "value", label: "Saldo a receber", render: d => formatMoney(d.value) }, { key: "probability", label: "Probabilidade", render: d => `${d.probability}%` }, { key: "weighted", label: "Ponderado", render: d => formatMoney(d.weighted) }]} />}
    </Panel>
  </div>
}
function GoalsPanel({ data, busy, mutate }: EditingProps) {
  const blank = { name: "", month: monthNow(), ownerId: "", pipelineId: "", metric: "receivedValue" as Goal["metric"], target: 10000 }
  const [form, setForm] = useState(blank)
  const [id, setId] = useState<string | null>(null)
  const [month, setMonth] = useState(monthNow)
  const goals = collect<Goal>(data, "salesGoals").filter(g => g.month === month)
  const deals = collect<Deal>(data, "deals"), leads = collect<Lead>(data, "leads")
  return <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(300px,400px)]">
    <Panel title="Acompanhamento de metas" actions={<Input aria-label="Mês das metas" type="month" value={month} onChange={e => setMonth(e.target.value)} />}>
      <div className="space-y-4">{!goals.length && <p className="text-sm text-muted-foreground">Nenhuma meta cadastrada neste mês.</p>}{goals.map(goal => {
        const progress = goalProgress(goal, deals, leads, data.receiptGroups)
        const format = (v: number) => ["receivedValue", "wonValue"].includes(goal.metric) ? formatMoney(v) : v.toLocaleString("pt-BR")
        return <div key={goal.id} className="space-y-3 rounded-lg border p-4"><div className="flex items-start justify-between gap-3"><div><h3 className="font-medium">{goal.name}</h3><p className="text-xs text-muted-foreground">{goalLabels[goal.metric]} · {goal.ownerId ? labelFor(goal.ownerId, data) : "Toda a equipe"}{goal.pipelineId ? ` · ${data.pipelines.find(p => p.id === goal.pipelineId)?.name || goal.pipelineId}` : ""}</p></div>{data.canEditGoals && <div className="flex gap-1"><Button size="icon" variant="ghost" disabled={busy} aria-label={`Editar meta ${goal.name}`} onClick={() => { const { id, ...v } = goal; setId(id); setForm(v) }}><Pencil /></Button><Button size="icon" variant="ghost" disabled={busy} aria-label={`Excluir meta ${goal.name}`} onClick={() => void mutate(() => removeCommercialRecord("salesGoals", goal.id)).catch(() => {})}><Trash2 /></Button></div>}</div><div className="flex justify-between text-sm"><span>{format(progress.actual)} / {format(goal.target)}</span><span>{progress.percent.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%</span></div><progress aria-label={`Progresso de ${goal.name}`} className="h-2 w-full accent-primary" max={100} value={Math.min(100, progress.percent)} /><p className="text-xs text-muted-foreground">{progress.remaining ? `Faltam ${format(progress.remaining)} para atingir a meta.` : "Meta atingida."}</p></div>
      })}</div>
    </Panel>
    {data.canEditGoals && <Panel title={id ? "Editar meta" : "Nova meta"}><form className="space-y-3" onSubmit={async e => { e.preventDefault(); try { const parsed = goalSchema.safeParse(form); if (!parsed.success) return toast.error(parsed.error.issues[0].message); await mutate(() => saveCommercialRecord("salesGoals", id, parsed.data)); setForm(blank); setId(null) } catch {} }}>
      {form.metric === "receivedValue" && <p className="text-xs leading-relaxed text-muted-foreground">Conta os pagamentos realmente recebidos no mês, incluindo mensalidades. A data de cadastro, a data do contrato e valores ainda pendentes não entram nesta meta.</p>}
      <Field label="Nome"><Input required maxLength={120} value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} /></Field>
      <Field label="Mês"><Input required type="month" value={form.month} onChange={e => setForm({ ...form, month: e.target.value })} /></Field>
      <Options label="Indicador" value={form.metric} onChange={metric => setForm({ ...form, metric: metric as Goal["metric"], pipelineId: metric === "newLeads" ? "" : form.pipelineId })} options={Object.entries(goalLabels).map(([value, label]) => ({ value, label }))} />
      <Field label={["receivedValue", "wonValue"].includes(form.metric) ? "Meta em reais" : "Quantidade"}><Input required type="number" min={["receivedValue", "wonValue"].includes(form.metric) ? "0.01" : "1"} step={["receivedValue", "wonValue"].includes(form.metric) ? "0.01" : "1"} value={form.target} onChange={e => setForm({ ...form, target: Number(e.target.value) })} /></Field>
      <Options label="Responsável" value={form.ownerId} onChange={ownerId => setForm({ ...form, ownerId })} options={people(data)} empty="Toda a equipe" />
      {form.metric !== "newLeads" && <Options label="Funil" value={form.pipelineId} onChange={pipelineId => setForm({ ...form, pipelineId })} options={pipes(data)} empty="Todos os funis" />}
      <Button type="submit" disabled={busy}>Salvar meta</Button>{id && <Button type="button" variant="ghost" onClick={() => { setId(null); setForm(blank) }}>Cancelar</Button>}
    </form></Panel>}
  </div>
}
function ReportsPanel({ data, busy, mutate }: EditingProps) {
  const blank = { name: "", resource: "deals" as SavedReport["resource"], groupBy: "stage" as SavedReport["groupBy"], dateField: "paidAt" as SavedReport["dateField"], metric: "receivedValue" as SavedReport["metric"], from: `${monthNow()}-01`, to: localDay(new Date().toISOString()), ownerId: "", pipelineId: "", status: "" }
  const [form, setReportForm] = useState(blank)
  const [id, setId] = useState<string | null>(null)
  const [result, setResult] = useState<ReturnType<typeof runReport> | null>(null)
  function setForm(value: typeof blank) { setReportForm(value); setResult(null) }
  const saved = collect<SavedReport>(data, "savedReports")
  const groups = form.resource === "deals" ? ["ownerId", "source", "stage", "month"] : form.resource === "leads" ? ["ownerId", "source", "status", "month"] : ["ownerId", "status", "month"]
  const labels: Record<string, string> = { ownerId: "Responsável", source: "Origem", stage: "Etapa", month: "Mês", status: "Status", createdAt: "Criação", expectedCloseDate: "Fechamento previsto", wonAt: "Venda ganha", dueDate: "Vencimento", count: "Quantidade", receivedValue: "Receita recebida (projetos + mensalidades)", paidAt: "Pagamento recebido", value: "Valor contratado do projeto", weightedValue: "Valor ponderado", monthlyFee: "Mensalidade negociada" }
  function calculate() { const parsed = reportSchema.safeParse(form); if (!parsed.success) { toast.error(parsed.error.issues[0].message); return null }; return runReport({ ...parsed.data, id: id || "preview" }, data.rows, data.pipelines, data.projectPaidByDeal, data.receipts) }
  return <div className="space-y-4">
    <Panel title="Seus relatórios" description="Salve filtros e agrupamentos para consultar novamente com os dados atuais."><div className="flex flex-wrap gap-2">{!saved.length && <p className="text-sm text-muted-foreground">Nenhum relatório salvo.</p>}{saved.map(r => <div key={r.id} className="flex items-center rounded-lg border"><Button variant="ghost" onClick={() => { const { id, ...v } = r; setId(id); setForm(v); setResult(runReport(r, data.rows, data.pipelines, data.projectPaidByDeal, data.receipts)) }}>{r.name}</Button><Button size="icon" variant="ghost" disabled={busy} aria-label={`Excluir relatório ${r.name}`} onClick={() => void mutate(() => removeCommercialRecord("savedReports", r.id)).then(() => { if (id === r.id) { setId(null); setForm(blank); setResult(null) } }).catch(() => {})}><Trash2 /></Button></div>)}</div></Panel>
    <Panel title={id ? "Editar relatório" : "Montar relatório"}><form className="space-y-4" onSubmit={e => { e.preventDefault(); setResult(calculate()) }}>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Field label="Nome do relatório"><Input required maxLength={120} value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} /></Field>
        <Options label="Dados" value={form.resource} onChange={v => { setResult(null); setForm({ ...form, resource: v as SavedReport["resource"], groupBy: "ownerId", metric: "count", dateField: "createdAt", status: "", pipelineId: "" }) }} options={[{ value: "deals", label: "Negócios" }, { value: "leads", label: "Leads" }, { value: "tasks", label: "Tarefas" }]} />
        <Options label="Agrupar por" value={form.groupBy} onChange={v => setForm({ ...form, groupBy: v as SavedReport["groupBy"] })} options={groups.map(value => ({ value, label: labels[value] }))} />
        <Options label="Indicador" value={form.metric} onChange={v => setForm({ ...form, metric: v as SavedReport["metric"], dateField: v === "receivedValue" ? "paidAt" : form.dateField === "paidAt" ? "wonAt" : form.dateField })} options={(form.resource === "deals" ? ["receivedValue", "count", "value", "weightedValue", "monthlyFee"] : ["count"]).map(value => ({ value, label: labels[value] }))} />
        <Options label="Data usada no filtro" value={form.dateField} onChange={v => setForm({ ...form, dateField: v as SavedReport["dateField"] })} options={(form.metric === "receivedValue" ? ["paidAt"] : form.resource === "deals" ? ["createdAt", "expectedCloseDate", "wonAt"] : form.resource === "tasks" ? ["createdAt", "dueDate"] : ["createdAt"]).map(value => ({ value, label: labels[value] }))} />
        <Field label="De"><Input required type="date" value={form.from} onChange={e => setForm({ ...form, from: e.target.value })} /></Field><Field label="Até"><Input required type="date" value={form.to} onChange={e => setForm({ ...form, to: e.target.value })} /></Field>
        <Options label="Responsável" value={form.ownerId} onChange={ownerId => setForm({ ...form, ownerId })} options={people(data)} empty="Toda a equipe" />
        {form.resource === "deals" && <Options label="Funil" value={form.pipelineId} onChange={pipelineId => setForm({ ...form, pipelineId })} options={pipes(data)} empty="Todos os funis" />}
        <Options label={form.resource === "deals" ? "Etapa" : "Status"} value={form.status} onChange={status => setForm({ ...form, status })} options={(form.resource === "deals" ? [...stages] : form.resource === "leads" ? ["novo", "em_contato", "qualificado", "convertido", "perdido"] : ["todo", "doing", "review", "done"]).map(value => ({ value, label: labelFor(value, data) }))} empty="Todos" />
      </div>
      <p className="text-xs leading-relaxed text-muted-foreground">{form.metric === "receivedValue" ? "Soma apenas pagamentos recebidos entre as datas escolhidas, incluindo mensalidades. Pagamentos anteriores e valores pendentes ficam fora do resultado." : form.resource === "deals" ? "Este indicador consulta contratos pela data selecionada. O valor contratado não representa receita recebida no período. Para consultar pagamentos, escolha Receita recebida." : "Conta os registros pela data selecionada."}</p>
      <div className="flex flex-wrap gap-2"><Button type="submit">Visualizar</Button><Button type="button" variant="outline" disabled={busy} onClick={async () => { const parsed = reportSchema.safeParse(form); if (!parsed.success) return toast.error(parsed.error.issues[0].message); try { await mutate(async () => { const r = await saveCommercialRecord("savedReports", id, parsed.data); setId(r.id) }); setResult(calculate()) } catch {} }}>Salvar relatório</Button><Button type="button" variant="ghost" onClick={() => { setId(null); setForm(blank); setResult(null) }}>Novo</Button></div>
    </form></Panel>
    {result && <Panel title="Resultado da consulta" description="Resultado gerado ao visualizar. Recalcule após alterar os filtros ou atualizar os dados." actions={<Button variant="outline" disabled={!result.length} onClick={() => downloadCsv(form.name || "relatorio", result.map(r => ({ Grupo: labelFor(r.group, data), [form.metric === "receivedValue" ? "Pagamentos" : "Registros"]: r.count, Resultado: r.value })))}><Download />CSV</Button>}>
      {!result.length ? <p className="text-sm text-muted-foreground">Nenhum registro atende aos filtros.</p> : <ReportTable rows={result} getKey={r => r.group} columns={[{ key: "group", label: "Grupo", render: r => labelFor(r.group, data) }, { key: "count", label: form.metric === "receivedValue" ? "Pagamentos" : "Registros", render: r => r.count }, { key: "value", label: "Resultado", render: r => form.metric === "count" ? r.value : formatMoney(r.value) }]} />}
    </Panel>}
  </div>
}
function AutomationsPanel({ data, busy, mutate }: EditingProps) {
  const blank = { name: "", active: true, event: "lead.created" as Automation["event"], stage: "" as Automation["stage"], source: "" as Automation["source"], minValue: 0, action: "create_task" as Automation["action"], title: "Entrar em contato com {nome}", userId: "", dueDays: 1 }
  const [form, setForm] = useState(blank), [id, setId] = useState<string | null>(null)
  const rules = collect<Automation>(data, "automationRules")
  const runs = data.rows.filter(r => r.resource === "automationRuns").sort((a, b) => String(b.data.createdAt).localeCompare(String(a.data.createdAt))).slice(0, 30)
  const failed = data.rows.filter(r => r.resource === "automationEvents" && r.data.state === "failed")
  const events = automationEvents.map(value => ({ value, label: WEBHOOK_EVENTS.find(e => e.value === value)?.label || value }))
  return <div className="space-y-4"><div className="grid items-start gap-4 xl:grid-cols-2">
    <Panel title="Automações configuradas" description="Executadas para novos eventos, uma vez por regra, registro e etapa. Alterar uma regra não reaplica eventos concluídos."><div className="space-y-3">{!rules.length && <p className="text-sm text-muted-foreground">Crie sua primeira automação ao lado.</p>}{rules.map(rule => <div key={rule.id} className="rounded-lg border p-4"><div className="flex items-start justify-between gap-3"><div><h3 className="font-medium">{rule.name}</h3><p className="text-xs text-muted-foreground">{events.find(e => e.value === rule.event)?.label} → {rule.action === "create_task" ? "Criar tarefa" : "Atribuir responsável"}</p><p className="mt-1 text-xs">{rule.active ? "Ativa" : "Pausada"}{rule.stage ? ` · ${labelFor(rule.stage, data)}` : ""}{rule.source ? ` · ${labelFor(rule.source, data)}` : ""}{rule.minValue ? ` · A partir de ${formatMoney(rule.minValue)}` : ""}</p></div><div className="flex gap-1"><Button variant="ghost" size="icon" aria-label={`Editar automação ${rule.name}`} onClick={() => { const { id, ...v } = rule; setId(id); setForm(v) }}><Pencil /></Button><Button variant="ghost" size="icon" disabled={busy} aria-label={`Excluir automação ${rule.name}`} onClick={() => void mutate(() => removeCommercialRecord("automationRules", rule.id)).catch(() => {})}><Trash2 /></Button></div></div><Button className="mt-2" variant="outline" size="sm" disabled={busy} onClick={() => { const { id, ...v } = rule; void mutate(() => saveCommercialRecord("automationRules", id, { ...v, active: !v.active })).catch(() => {}) }}>{rule.active ? "Pausar" : "Ativar"}</Button></div>)}</div></Panel>
    <Panel title={id ? "Editar automação" : "Nova automação"}><form className="space-y-3" onSubmit={async e => { e.preventDefault(); const parsed = automationSchema.safeParse(form); if (!parsed.success) return toast.error(parsed.error.issues[0].message); try { await mutate(() => saveCommercialRecord("automationRules", id, parsed.data)); setId(null); setForm(blank) } catch {} }}>
      <Field label="Nome"><Input required value={form.name} maxLength={120} onChange={e => setForm({ ...form, name: e.target.value })} /></Field>
      <Options label="Quando acontecer" value={form.event} onChange={event => setForm({ ...form, event: event as Automation["event"], stage: "", minValue: 0 })} options={events} />
      <div className="grid gap-3 sm:grid-cols-2"><Options label="Origem do contato" value={form.source} onChange={source => setForm({ ...form, source: source as Automation["source"] })} options={sources.map(value => ({ value, label: labelFor(value, data) }))} empty="Qualquer origem" />
      {form.event !== "lead.created" && <><Options label="Etapa do negócio" value={form.stage} onChange={stage => setForm({ ...form, stage: stage as Automation["stage"] })} options={stages.map(value => ({ value, label: labelFor(value, data) }))} empty="Qualquer etapa" /><Field label="Valor mínimo (R$)"><Input type="number" min="0" step="0.01" value={form.minValue} onChange={e => setForm({ ...form, minValue: Number(e.target.value) })} /></Field></>}</div>
      <Options label="Ação" value={form.action} onChange={action => setForm({ ...form, action: action as Automation["action"] })} options={[{ value: "create_task", label: "Criar tarefa" }, { value: "assign_owner", label: "Atribuir responsável comercial" }]} />
      <Options label={form.action === "create_task" ? "Responsável pela tarefa" : "Novo responsável"} value={form.userId} onChange={userId => setForm({ ...form, userId })} options={people(data).filter(p => form.action === "create_task" || ["admin", "comercial"].includes(data.users.find(u => u.id === p.value)?.role || ""))} empty={form.action === "create_task" ? "Sem responsável" : "Selecione"} />
      {form.action === "create_task" && <><Field label="Título da tarefa · use {nome} para o contato ou negócio"><Input required maxLength={300} value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} /></Field><Field label="Prazo em dias após o evento"><Input required type="number" min="0" max="365" value={form.dueDays} onChange={e => setForm({ ...form, dueDays: Number(e.target.value) })} /></Field></>}
      <Button type="submit" disabled={busy}>Salvar automação</Button>{id && <Button type="button" variant="ghost" onClick={() => { setId(null); setForm(blank) }}>Cancelar</Button>}
    </form></Panel>
  </div>
  <Panel title="Histórico de execução" description="A fila é processada pelo servidor a cada poucos segundos. Atualize a página para acompanhar.">
    {failed.map(row => <div key={row.id} className="mb-3 flex flex-wrap items-center justify-between gap-3 rounded border p-3 text-sm"><p>Evento {String(row.data.event)} falhou após cinco tentativas. Confira responsáveis e regras antes de reenviar.</p><Button disabled={busy} variant="outline" onClick={() => void mutate(() => retryAutomation(row.id)).catch(() => {})}>Tentar novamente</Button></div>)}
    {!runs.length ? <p className="text-sm text-muted-foreground">Nenhuma automação executada.</p> : <ReportTable<StoredRow> rows={runs} getKey={r => r.id} columns={[{ key: "name", label: "Automação", render: r => String(r.data.ruleName) }, { key: "event", label: "Evento", render: r => String(r.data.event) }, { key: "source", label: "Registro", render: r => String(r.data.sourceId) }, { key: "date", label: "Executada em", render: r => new Date(String(r.data.createdAt)).toLocaleString("pt-BR") }, { key: "state", label: "Resultado", render: () => "Concluída" }]} />}
  </Panel></div>
}
