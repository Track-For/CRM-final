"use client"
import { useState } from "react"
import Link from "next/link"
import { ArrowUpRight, Check, CheckCircle2, CheckSquare, Clock3, FolderKanban, Loader2, MessageSquare, Wallet } from "lucide-react"
import { toast } from "@/lib/store/save-feedback"
import { Button } from "@/components/ui/button"
import { EmptyState } from "@/components/shared/empty-state"
import { StatusBadge } from "@/components/shared/status-badge"
import { TaskDrawer } from "@/components/tasks/task-drawer"
import { useCharges, useClients, useCrm, useCurrentUser, useDeals, useProjects, useTasks } from "@/lib/data"
import { saveRecord } from "@/lib/data/records-actions"
import { isStaleDeal, dealIdleDays } from "@/lib/data/selectors"
import { formatDate, formatMoney } from "@/lib/format"
import { useUiStore } from "@/lib/store/ui-store"
import { cn } from "@/lib/utils"
import type { Task } from "@/types"
const dayOf = (value: string | number) => { if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value; const date = new Date(value); return Number.isFinite(date.getTime()) ? new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).format(date) : "" }
export function DailyActions() {
  const tasks = useTasks()
  const projects = useProjects()
  const deals = useDeals()
  const charges = useCharges()
  const clients = useClients()
  const user = useCurrentUser()
  const role = useUiStore(state => state.role)
  const [now] = useState(() => Date.now())
  const today = dayOf(now)
  const [selected, setSelected] = useState("tasks")
  const [mine, setMine] = useState(true)
  const [openTaskId, setOpenTaskId] = useState<string | null>(null)
  const [saving, setSaving] = useState("")
  const dueTasks = tasks.filter(task => task.status !== "done" && task.dueDate && dayOf(task.dueDate) <= today && (!mine || task.assigneeId === user?.id || !task.assigneeId)).sort((a, b) => a.dueDate.localeCompare(b.dueDate))
  const projectAlerts = projects.filter(project => !["entregue", "pausado"].includes(project.status) && ((project.deliveryDate && project.deliveryDate.slice(0, 10) < today) || project.stages?.some(stage => stage.status !== "concluida" && (stage.status === "bloqueada" || (stage.dueDate && stage.dueDate < today)))))
  const followUps = deals.filter(isStaleDeal).sort((a, b) => dealIdleDays(b) - dealIdleDays(a))
  const overdueCharges = charges.filter(charge => ["pendente", "vencido"].includes(charge.status) && charge.dueDate && dayOf(charge.dueDate) < today).sort((a, b) => a.dueDate.localeCompare(b.dueDate))
  const categories = [{ id: "tasks", label: "Tarefas de hoje", count: dueTasks.length, hint: "Hoje e em atraso", icon: CheckSquare, href: "/tarefas" }, { id: "projects", label: "Projetos em atenção", count: projectAlerts.length, hint: "Prazos e bloqueios", icon: FolderKanban, href: "/clientes" }, ...(["admin", "comercial"].includes(role) ? [{ id: "sales", label: "Retornos comerciais", count: followUps.length, hint: "Negócios sem avanço", icon: MessageSquare, href: "/vendas" }] : []), ...(["admin", "financeiro"].includes(role) ? [{ id: "billing", label: "Cobranças vencidas", count: overdueCharges.length, hint: "Recebimentos pendentes", icon: Wallet, href: "/financeiro/cobrancas" }] : [])]
  const active = categories.find(category => category.id === selected) || categories[0]
  async function setTaskStatus(task: Task, status: Task["status"]) {
    setSaving(task.id)
    try {
      await saveRecord("tasks", task.id, { status })
      useCrm.setState(state => ({ tasks: state.tasks.map(item => item.id === task.id ? { ...item, status } : item) }))
      toast.success(status === "done" ? "Tarefa concluída" : "Tarefa reaberta", status === "done" ? { action: { label: "Desfazer", onClick: () => { void setTaskStatus({ ...task, status: "done" }, task.status) } } } : undefined)
    } catch (error) { toast.error(error instanceof Error ? error.message : "Não foi possível salvar a tarefa.") }
    finally { setSaving("") }
  }
  const total = categories.reduce((count, category) => count + category.count, 0)
  return <section className="space-y-5" aria-labelledby="daily-actions-title">
    <div className="flex flex-wrap items-end justify-between gap-3"><div><p className="mb-1 text-[10px] font-semibold tracking-[0.12em] text-muted-foreground uppercase">Seu dia no CRM</p><h2 id="daily-actions-title" className="text-lg font-semibold tracking-tight">O que precisa da sua atenção</h2></div><span className="text-sm text-muted-foreground">{total ? `${total} pendência${total === 1 ? "" : "s"} para acompanhar` : "Tudo em dia por aqui"}</span></div>
    <div className={cn("grid grid-cols-2 gap-3", categories.length === 3 ? "xl:grid-cols-3" : categories.length === 4 ? "xl:grid-cols-4" : "")}>{categories.map(category => <button key={category.id} aria-pressed={active.id === category.id} onClick={() => setSelected(category.id)} className={cn("group flex min-h-24 flex-col justify-between rounded-xl border p-4 text-left transition-colors hover:border-primary/40", active.id === category.id ? "border-primary/40 bg-brand-soft/70 text-foreground ring-1 ring-primary/10" : "bg-card text-foreground")}><div className="flex items-center justify-between gap-2"><category.icon className={cn("size-5", active.id === category.id ? "text-primary" : "text-muted-foreground")} /><span className="num text-2xl font-semibold">{category.count}</span></div><div className="mt-3"><p className="text-sm font-semibold">{category.label}</p><p className={cn("mt-1 text-xs text-muted-foreground")}>{category.hint}</p></div></button>)}</div>
    <div className="overflow-hidden rounded-2xl border bg-card"><div className="flex flex-wrap items-center justify-between gap-3 border-b px-5 py-4"><h3 className="font-semibold">{active.label}</h3>{active.id === "tasks" ? <div className="flex rounded-lg bg-surface p-1">{[{ value: true, label: "Minhas tarefas" }, { value: false, label: "Toda a equipe" }].map(option => <button key={option.label} aria-pressed={mine === option.value} className={cn("rounded-md px-3 py-1.5 text-xs font-medium", mine === option.value ? "bg-card text-primary shadow-sm" : "text-muted-foreground")} onClick={() => setMine(option.value)}>{option.label}</button>)}</div> : <active.icon className="size-5 text-primary" />}</div>
      {active.count === 0 ? <EmptyState compact icon={CheckCircle2} title="Nenhuma pendência nesta lista" description={active.id === "tasks" && mine ? "Consulte a equipe ou crie sua próxima tarefa." : "Você pode continuar o trabalho pelas outras áreas do CRM."} className="m-5" /> : <ul className="divide-y">
        {active.id === "tasks" && dueTasks.slice(0, 6).map(task => <li key={task.id} className="flex items-center gap-3 px-5 py-4"><span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-brand-soft text-primary"><Clock3 className="size-4" /></span><button className="min-w-0 flex-1 text-left" onClick={() => setOpenTaskId(task.id)}><p className="truncate text-sm font-medium hover:text-primary">{task.title}</p><p className="mt-1 truncate text-xs text-muted-foreground">{task.projectName || clients.find(client => client.id === task.clientId)?.name || "Tarefa interna"} · {dayOf(task.dueDate) < today ? `Atrasada · ${formatDate(task.dueDate)}` : "Para hoje"}</p></button><Button variant="outline" size="sm" disabled={Boolean(saving)} onClick={() => void setTaskStatus(task, "done")}>{saving === task.id ? <Loader2 className="animate-spin" /> : <Check />}<span className="hidden sm:inline">Concluir</span></Button></li>)}
        {active.id === "projects" && projectAlerts.slice(0, 6).map(project => <li key={project.id}><Link href={`/clientes/${project.clientId}?projeto=${encodeURIComponent(project.id)}`} className="flex items-center gap-3 px-5 py-4 hover:bg-surface"><FolderKanban className="size-5 shrink-0 text-primary" /><div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{project.name}</p><p className="mt-1 text-xs text-muted-foreground">{clients.find(client => client.id === project.clientId)?.name || "Cliente"} · {project.stages?.find(stage => stage.status === "bloqueada")?.name || "Revisar prazo de entrega"}</p></div><StatusBadge tone="warning">Precisa de atenção</StatusBadge><ArrowUpRight className="hidden size-4 text-primary sm:block" /></Link></li>)}
        {active.id === "sales" && followUps.slice(0, 6).map(deal => <li key={deal.id}><Link href={`/vendas/${deal.id}`} className="flex items-center gap-3 px-5 py-4 hover:bg-surface"><MessageSquare className="size-5 shrink-0 text-primary" /><div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{deal.title}</p><p className="mt-1 text-xs text-muted-foreground">{dealIdleDays(deal)} dias sem avanço · Retome o contato</p></div><ArrowUpRight className="size-4 text-primary" /></Link></li>)}
        {active.id === "billing" && overdueCharges.slice(0, 6).map(charge => <li key={charge.id}><Link href={`/financeiro/cobrancas?cobranca=${encodeURIComponent(charge.id)}`} className="flex items-center gap-3 px-5 py-4 hover:bg-surface"><Wallet className="size-5 shrink-0 text-primary" /><div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{clients.find(client => client.id === charge.clientId)?.name || charge.description}</p><p className="mt-1 text-xs text-muted-foreground">{charge.number} · Venceu em {formatDate(charge.dueDate)}</p></div><span className="num text-sm font-semibold">{formatMoney(charge.amount)}</span><ArrowUpRight className="hidden size-4 text-primary sm:block" /></Link></li>)}
      </ul>}
      <div className="flex justify-end border-t bg-surface px-5 py-3"><Button asChild variant="link" size="sm"><Link href={active.href}>Ver {active.id === "projects" ? "clientes e projetos" : active.id === "sales" ? "todos os negócios" : active.id === "billing" ? "todas as cobranças" : "todas as tarefas"}<ArrowUpRight /></Link></Button></div>
    </div>
    <TaskDrawer task={tasks.find(task => task.id === openTaskId)} onOpenChange={open => { if (!open) setOpenTaskId(null) }} now={new Date(now)} />
  </section>
}
