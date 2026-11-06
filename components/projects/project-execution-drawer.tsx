"use client"

import { useEffect, useState } from "react"
import { ArrowDown, ArrowUp, CheckSquare, Link2, Loader2, Plus, Save, Trash2, Unlink } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Progress } from "@/components/ui/progress"
import { AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog"
import { EntityDrawer } from "@/components/shared/entity-drawer"
import { FormField } from "@/components/shared/form-field"
import { OptionSelect } from "@/components/shared/option-select"
import { EnumBadge, StatusBadge } from "@/components/shared/status-badge"
import { TaskDrawer } from "@/components/tasks/task-drawer"
import { PROJECT_STATUS_LABEL, PROJECT_STATUS_TONE, TASK_STATUS_LABEL, TASK_STATUS_TONE, toOptions, type Tone } from "@/lib/constants"
import { useCrm, useTasks, useUsers } from "@/lib/data"
import { flushPendingWrites } from "@/lib/data/api"
import { STAGE_LABEL, projectProgress, projectStatus, type ProjectPlanInput } from "@/lib/projects/plan"
import { createProjectTaskAction, getProjectExecutionAction, linkProjectTaskAction, saveProjectExecutionAction } from "@/lib/projects/actions"
import type { Project, ProjectStage, Task } from "@/types"

const STAGE_TONE: Record<ProjectStage["status"], Tone> = { pendente: "neutral", em_andamento: "brand", em_revisao: "info", bloqueada: "danger", concluida: "success" }
type Loaded = Awaited<ReturnType<typeof getProjectExecutionAction>>
function planFor(project: Project): ProjectPlanInput {
  return { clientId: project.clientId, projectId: project.id, expectedVersion: project.executionVersion || 0, startDate: project.startDate.slice(0, 10), deliveryDate: project.deliveryDate.slice(0, 10), paused: project.status === "pausado", stages: structuredClone(project.stages || []) }
}
function reflectProject(project: Project) {
  useCrm.setState(state => ({ projects: [...state.projects.filter(item => item.id !== project.id), project] }))
}
function reflectTask(task: Task) {
  useCrm.setState(state => ({ tasks: [...state.tasks.filter(item => item.id !== task.id), task] }))
}
export function ProjectExecutionDrawer({ clientId, projectId, onOpenChange, onBilling }: { clientId: string; projectId: string | null; onOpenChange: (open: boolean) => void; onBilling: () => void }) {
  if (!projectId) return null
  return <ProjectExecution key={projectId} clientId={clientId} projectId={projectId} onOpenChange={onOpenChange} onBilling={onBilling} />
}
function ProjectExecution({ clientId, projectId, onOpenChange, onBilling }: { clientId: string; projectId: string; onOpenChange: (open: boolean) => void; onBilling: () => void }) {
  const [loaded, setLoaded] = useState<Loaded | null>(null)
  const [draft, setDraft] = useState<ProjectPlanInput | null>(null)
  const [baseline, setBaseline] = useState("")
  const [error, setError] = useState("")
  const [busy, setBusy] = useState(false)
  const [discardOpen, setDiscardOpen] = useState(false)
  const [reload, setReload] = useState(0)
  const [taskId, setTaskId] = useState<string | null>(null)
  const tasks = useTasks()
  const users = useUsers()
  const role = useCrm(state => state.users.find(user => user.id === state.currentUserId)?.role)
  const canFinance = role === "admin" || role === "financeiro"
  const canEditBilling = role === "admin" || role === "comercial"
  const dirty = Boolean(draft && JSON.stringify(draft) !== baseline)
  useEffect(() => {
    let active = true
    getProjectExecutionAction(clientId, projectId).then(value => {
      if (!active) return
      setLoaded(value); const plan = planFor(value.project); setDraft(plan); setBaseline(JSON.stringify(plan)); setError(""); reflectProject(value.project)
    }).catch(error => { if (active) setError(error instanceof Error ? error.message : "Não foi possível carregar o projeto.") })
    return () => { active = false }
  }, [clientId, projectId, reload])
  useEffect(() => {
    if (!dirty) return
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = "" }
    window.addEventListener("beforeunload", warn)
    return () => window.removeEventListener("beforeunload", warn)
  }, [dirty])
  const close = (open: boolean) => { if (open || busy) return; if (dirty) setDiscardOpen(true); else onOpenChange(false) }
  const changeStage = (id: string, patch: Partial<ProjectStage>) => setDraft(plan => plan && ({ ...plan, stages: plan.stages.map(stage => stage.id === id ? { ...stage, ...patch } : stage) }))
  const save = async () => {
    if (!draft || !loaded) return
    setBusy(true); setError("")
    try {
      await flushPendingWrites()
      const project = await saveProjectExecutionAction(draft)
      const next = planFor(project); setDraft(next); setBaseline(JSON.stringify(next)); setLoaded({ ...loaded, project }); reflectProject(project); toast.success("Etapas do projeto salvas")
    } catch (error) { setError(error instanceof Error ? error.message : "Não foi possível salvar o projeto.") }
    finally { setBusy(false) }
  }
  const taskAction = async (job: () => Promise<Task>) => {
    setBusy(true); setError("")
    try { await flushPendingWrites(); const task = await job(); reflectTask(task); return task }
    catch (error) { setError(error instanceof Error ? error.message : "Não foi possível atualizar a tarefa.") }
    finally { setBusy(false) }
  }
  const move = (index: number, direction: number) => setDraft(plan => {
    if (!plan) return plan
    const stages = [...plan.stages]; const target = index + direction
    if (target < 0 || target >= stages.length) return plan
    ;[stages[index], stages[target]] = [stages[target], stages[index]]
    return { ...plan, stages }
  })
  const progress = projectProgress(draft?.stages)
  const canEdit = loaded?.canEdit && !busy
  const status = draft ? projectStatus(draft.stages, draft.paused) : "planejamento"
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date())
  return <>
    <EntityDrawer open onOpenChange={close} size="xl" title={loaded?.project.name || "Acompanhamento do projeto"} description="Etapas, responsáveis, prazos e tarefas do projeto." badge={loaded && <EnumBadge value={status} labels={PROJECT_STATUS_LABEL} tones={PROJECT_STATUS_TONE} />} footer={<><Button variant="outline" disabled={busy} onClick={() => close(false)}>Fechar</Button>{loaded?.canEdit && <Button disabled={busy || !draft || !dirty} onClick={save}>{busy ? <Loader2 className="animate-spin" /> : <Save />} Salvar alterações</Button>}</>}>
      {!loaded || !draft ? <div className="space-y-3"><p role={error ? "alert" : "status"}>{error || "Carregando projeto…"}</p>{error && <Button variant="outline" onClick={() => { setError(""); setReload(value => value + 1) }}>Tentar novamente</Button>}</div> : <div className="space-y-6">
        <section className="space-y-3 rounded-xl border bg-card p-4">
          <div className="flex items-center justify-between gap-2"><h2 className="text-sm font-semibold">Andamento do projeto</h2><span className="num text-sm">{progress.done}/{progress.total} etapas · {progress.percent}%</span></div>
          <Progress value={progress.percent} aria-label="Progresso das etapas" aria-valuenow={progress.percent} />
          <fieldset disabled={!canEdit} className="grid gap-3 sm:grid-cols-3">
            <FormField label="Início do projeto"><Input type="date" value={draft.startDate} onChange={event => setDraft({ ...draft, startDate: event.target.value })} /></FormField>
            <FormField label="Entrega prevista"><Input type="date" value={draft.deliveryDate} onChange={event => setDraft({ ...draft, deliveryDate: event.target.value })} /></FormField>
            <FormField label="Situação"><OptionSelect value={draft.paused ? "pausado" : "ativo"} onChange={value => setDraft({ ...draft, paused: value === "pausado" })} options={[{ value: "ativo", label: "Ativo" }, { value: "pausado", label: "Pausado" }]} /></FormField>
          </fieldset>
          {dirty && <p className="text-xs text-warning">Você tem alterações não salvas.</p>}
          {!loaded.canEdit && <p className="text-xs text-muted-foreground">Acompanhamento disponível para consulta.</p>}
        </section>
        {error && <div role="alert" className="space-y-2 rounded-lg border border-destructive p-3"><p className="text-sm text-destructive">{error}</p><Button variant="outline" size="sm" disabled={busy} onClick={() => { if (dirty) setDiscardOpen(true); else setReload(value => value + 1) }}>Recarregar projeto</Button></div>}
        <div className="flex items-center justify-between"><h2 className="font-semibold">Etapas de execução</h2>{loaded.canEdit && <Button variant="outline" size="sm" disabled={!canEdit || draft.stages.length >= 50} onClick={() => setDraft({ ...draft, stages: [...draft.stages, { id: crypto.randomUUID(), name: "Nova etapa", description: "", status: "pendente", assigneeId: "", startDate: "", dueDate: "" }] })}><Plus /> Adicionar etapa</Button>}</div>
        <div className="space-y-4">{draft.stages.map((stage, index) => {
          const stageTasks = tasks.filter(task => task.projectId === projectId && task.projectStageId === stage.id)
          const availableTasks = tasks.filter(task => task.clientId === clientId && (!task.projectId || task.projectId === projectId) && task.projectStageId !== stage.id)
          const overdue = Boolean(stage.dueDate && stage.dueDate < today && stage.status !== "concluida")
          const payment = loaded.paymentMilestones.find(item => item.id === stage.paymentMilestoneId)
          return <section key={stage.id} className="space-y-4 rounded-xl border bg-card p-4">
            <div className="flex flex-wrap items-center gap-2"><span className="num flex size-7 items-center justify-center rounded-full bg-muted text-xs">{index + 1}</span><h3 className="min-w-0 flex-1 text-sm font-semibold">{stage.name || "Etapa sem nome"}</h3><StatusBadge tone={STAGE_TONE[stage.status]}>{STAGE_LABEL[stage.status]}</StatusBadge>{overdue && <StatusBadge tone="danger">Atrasada</StatusBadge>}
              {loaded.canEdit && <div className="flex gap-1"><Button variant="ghost" size="icon-xs" disabled={!canEdit || index === 0} aria-label={`Mover ${stage.name} para cima`} onClick={() => move(index, -1)}><ArrowUp /></Button><Button variant="ghost" size="icon-xs" disabled={!canEdit || index === draft.stages.length - 1} aria-label={`Mover ${stage.name} para baixo`} onClick={() => move(index, 1)}><ArrowDown /></Button><Button variant="ghost" size="icon-xs" className="text-destructive" disabled={!canEdit || draft.stages.length === 1 || stageTasks.length > 0} aria-label={`Remover ${stage.name}`} title={stageTasks.length ? "Desvincule as tarefas antes de remover" : "Remover etapa"} onClick={() => setDraft({ ...draft, stages: draft.stages.filter(item => item.id !== stage.id) })}><Trash2 /></Button></div>}
            </div>
            <fieldset disabled={!canEdit} className="grid gap-3 sm:grid-cols-2">
              <FormField label="Nome da etapa"><Input value={stage.name} maxLength={150} onChange={event => changeStage(stage.id, { name: event.target.value })} /></FormField>
              <FormField label="Status"><OptionSelect value={stage.status} onChange={status => changeStage(stage.id, { status })} options={toOptions(STAGE_LABEL)} /></FormField>
              <FormField label="Responsável"><OptionSelect value={stage.assigneeId || "none"} onChange={value => changeStage(stage.id, { assigneeId: value === "none" ? "" : value })} options={[{ value: "none", label: "A definir" }, ...users.filter(user => user.active || user.id === stage.assigneeId).map(user => ({ value: user.id, label: `${user.name}${user.active ? "" : " (inativo)"}` }))]} /></FormField>
              <div className="grid grid-cols-2 gap-3"><FormField label="Início"><Input type="date" value={stage.startDate} onChange={event => changeStage(stage.id, { startDate: event.target.value })} /></FormField><FormField label="Prazo"><Input type="date" value={stage.dueDate} onChange={event => changeStage(stage.id, { dueDate: event.target.value })} /></FormField></div>
              <FormField label="Descrição" className="sm:col-span-2"><Textarea value={stage.description} rows={2} maxLength={4000} onChange={event => changeStage(stage.id, { description: event.target.value })} /></FormField>
              {canEditBilling && loaded.paymentMilestones.length > 0 && <FormField label="Etapa de pagamento vinculada" className="sm:col-span-2"><OptionSelect value={stage.paymentMilestoneId || "none"} onChange={value => changeStage(stage.id, { paymentMilestoneId: value === "none" ? undefined : value })} options={[{ value: "none", label: "Sem vínculo" }, ...loaded.paymentMilestones.map(item => ({ value: item.id, label: item.label }))]} /><p className="mt-1 text-xs text-muted-foreground">As cobranças são gerenciadas na aba Cobranças.</p></FormField>}
            </fieldset>
            {!canEditBilling && stage.paymentMilestoneId && <p className="flex items-center gap-2 text-xs text-muted-foreground"><Link2 className="size-3.5" />{payment ? `Pagamento vinculado: ${payment.label}` : "Etapa com pagamento vinculado"}</p>}
            {canFinance && stage.paymentMilestoneId && <Button variant="link" size="sm" className="px-0" disabled={dirty || busy} onClick={onBilling}>Ver cobranças do projeto</Button>}
            <div className="space-y-2 border-t pt-3"><div className="flex items-center gap-2 text-sm font-medium"><CheckSquare className="size-4" /> Tarefas da etapa <span className="text-xs text-muted-foreground">{stageTasks.filter(task => task.status === "done").length}/{stageTasks.length}</span></div>
              {stageTasks.map(task => <div key={task.id} className="flex items-center gap-2"><button className="min-w-0 flex-1 truncate text-left text-sm text-primary hover:underline" onClick={() => setTaskId(task.id)}>{task.title}</button><EnumBadge value={task.status} labels={TASK_STATUS_LABEL} tones={TASK_STATUS_TONE} />{loaded.canEdit && <Button variant="ghost" size="icon-xs" disabled={busy || dirty} aria-label={`Desvincular ${task.title}`} onClick={() => taskAction(() => linkProjectTaskAction(clientId, projectId, task.id, null))}><Unlink /></Button>}</div>)}
              {!stageTasks.length && <p className="text-xs text-muted-foreground">Nenhuma tarefa vinculada.</p>}
              {loaded.canEdit && stage.status !== "concluida" && <StageTaskControls disabled={busy || dirty} availableTasks={availableTasks} onCreate={async title => { const task = await taskAction(() => createProjectTaskAction(clientId, projectId, stage.id, title)); if (task) setTaskId(task.id); return Boolean(task) }} onLink={id => taskAction(() => linkProjectTaskAction(clientId, projectId, id, stage.id))} />}
              {dirty && loaded.canEdit && <p className="text-xs text-muted-foreground">Salve as etapas para criar ou vincular tarefas.</p>}
            </div>
          </section>
        })}</div>
      </div>}
    </EntityDrawer>
    <TaskDrawer task={tasks.find(task => task.id === taskId)} onOpenChange={open => { if (!open) setTaskId(null) }} now={new Date()} />
    <AlertDialog open={discardOpen} onOpenChange={setDiscardOpen}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Descartar alterações não salvas?</AlertDialogTitle><AlertDialogDescription>As alterações feitas no planejamento desde o último salvamento serão perdidas.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Continuar editando</AlertDialogCancel><Button variant="outline" onClick={() => { setDiscardOpen(false); setReload(value => value + 1) }}>Recarregar projeto</Button><Button variant="destructive" onClick={() => { setDiscardOpen(false); onOpenChange(false) }}>Descartar e fechar</Button></AlertDialogFooter></AlertDialogContent></AlertDialog>
  </>
}
function StageTaskControls({ disabled, availableTasks, onCreate, onLink }: { disabled: boolean; availableTasks: Task[]; onCreate: (title: string) => Promise<boolean>; onLink: (id: string) => Promise<unknown> }) {
  const [title, setTitle] = useState("")
  const [selected, setSelected] = useState("")
  return <div className="space-y-2 pt-1"><form className="flex gap-2" onSubmit={async event => { event.preventDefault(); if (title.trim() && await onCreate(title.trim())) setTitle("") }}><Input disabled={disabled} required maxLength={300} aria-label="Título da nova tarefa" value={title} onChange={event => setTitle(event.target.value)} placeholder="Nova tarefa desta etapa" /><Button type="submit" variant="outline" size="sm" disabled={disabled || !title.trim()}><Plus /> Criar tarefa</Button></form>{availableTasks.length > 0 && <div className="flex gap-2"><OptionSelect disabled={disabled} value={selected} onChange={setSelected} placeholder="Vincular tarefa existente" options={availableTasks.map(task => ({ value: task.id, label: task.title }))} /><Button variant="outline" size="sm" disabled={disabled || !selected} onClick={async () => { await onLink(selected); setSelected("") }}><Link2 /> Vincular</Button></div>}</div>
}
