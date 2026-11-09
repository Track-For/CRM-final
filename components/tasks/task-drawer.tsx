"use client"

import { useRef, useState } from "react"
import { format, parseISO } from "date-fns"
import { FileText, Paperclip, Plus, Send, Trash2, X } from "lucide-react"
import { toast } from "@/lib/store/save-feedback"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { EntityCombobox } from "@/components/shared/entity-combobox"
import { EntityDrawer } from "@/components/shared/entity-drawer"
import { FormField, FormGrid } from "@/components/shared/form-field"
import { OptionSelect } from "@/components/shared/option-select"
import { StatusBadge } from "@/components/shared/status-badge"
import { InitialsAvatar } from "@/components/shared/user-avatar"
import { checklistProgress, isTaskOverdue } from "@/components/tasks/task-utils"
import { TASK_PRIORITY_LABEL, TASK_STATUS_LABEL, TASK_STATUS_TONE, toOptions } from "@/lib/constants"
import { newId, useById, useCrm } from "@/lib/data"
import { useEntityOptions } from "@/lib/data/options"
import { formatFileSize, formatRelative } from "@/lib/format"
import type { Task } from "@/types"

interface TaskDrawerProps {
  task: Task | undefined
  onOpenChange: (open: boolean) => void
  now: Date
}

export function TaskDrawer({ task, onOpenChange, now }: TaskDrawerProps) {
  const remove = useCrm((s) => s.remove)
  return (
    <EntityDrawer
      open={Boolean(task)}
      onOpenChange={onOpenChange}
      size="lg"
      title={task ? "Tarefa" : ""}
      badge={
        task && (
          <>
            <StatusBadge tone={TASK_STATUS_TONE[task.status]}>{TASK_STATUS_LABEL[task.status]}</StatusBadge>
            {isTaskOverdue(task, now) && <StatusBadge tone="danger">Atrasada</StatusBadge>}
          </>
        )
      }
      footer={
        task && (
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="destructive" size="sm">
                <Trash2 />
                Excluir tarefa
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Excluir tarefa?</AlertDialogTitle>
                <AlertDialogDescription>Checklist, comentários e anexos também serão removidos.</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                <AlertDialogAction
                  onClick={() => {
                    remove("tasks", task.id)
                    onOpenChange(false)
                    toast.success("Tarefa excluída")
                  }}
                >
                  Excluir
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        )
      }
    >
      {task && <TaskEditor key={task.id} task={task} />}
    </EntityDrawer>
  )
}

function TaskEditor({ task }: { task: Task }) {
  const update = useCrm((s) => s.update)
  const moveTask = useCrm((s) => s.moveTask)
  const currentUserId = useCrm((s) => s.currentUserId)
  const users = useById("users")
  const { userOptions, clientOptions } = useEntityOptions()
  const [title, setTitle] = useState(task.title)
  const [description, setDescription] = useState(task.description)
  const [newItem, setNewItem] = useState("")
  const [comment, setComment] = useState("")
  const fileRef = useRef<HTMLInputElement>(null)
  const progress = checklistProgress(task)

  const patch = (p: Partial<Task>) => update("tasks", task.id, p)

  const addItem = () => {
    if (!newItem.trim()) return
    patch({ checklist: [...task.checklist, { id: newId("chk"), text: newItem.trim(), done: false }] })
    setNewItem("")
  }

  const addComment = () => {
    if (!comment.trim()) return
    patch({ comments: [...task.comments, { id: newId("cmt"), authorId: currentUserId, text: comment.trim(), createdAt: new Date().toISOString() }] })
    setComment("")
    toast.success("Comentário adicionado")
  }

  const onFiles = (files: FileList | null) => {
    if (!files?.length) return
    const now = new Date().toISOString()
    const added = Array.from(files).map((f) => ({ id: newId("att"), name: f.name, size: f.size, mime: f.type || "application/octet-stream", createdAt: now }))
    patch({ attachments: [...task.attachments, ...added] })
    toast.success(`${added.length} anexo(s) adicionado(s)`)
    if (fileRef.current) fileRef.current.value = ""
  }

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <Input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onBlur={() => {
            if (!title.trim()) {
              setTitle(task.title)
              toast.error("Título é obrigatório")
            } else if (title !== task.title) patch({ title: title.trim() })
          }}
          className="h-10 text-base font-semibold"
          aria-label="Título da tarefa"
        />
        <Textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          onBlur={() => description !== task.description && patch({ description })}
          rows={3}
          placeholder="Descrição da tarefa"
          aria-label="Descrição"
        />
      </div>

      <FormGrid>
        <FormField label="Status">
          <OptionSelect value={task.status} onChange={(s) => moveTask(task.id, s)} options={toOptions(TASK_STATUS_LABEL)} />
        </FormField>
        <FormField label="Prioridade">
          <OptionSelect value={task.priority} onChange={(p) => patch({ priority: p })} options={toOptions(TASK_PRIORITY_LABEL)} />
        </FormField>
        <FormField label="Responsável">
          <OptionSelect value={task.assigneeId} onChange={(id) => patch({ assigneeId: id })} options={userOptions} />
        </FormField>
        <FormField label="Prazo">
          <Input
            type="date"
            value={format(parseISO(task.dueDate), "yyyy-MM-dd")}
            onChange={(e) => e.target.value && patch({ dueDate: new Date(`${e.target.value}T18:00:00`).toISOString() })}
          />
        </FormField>
        <FormField label="Cliente">
          {task.projectId ? <Input readOnly value={clientOptions.find(option => option.value === task.clientId)?.label || "Cliente do projeto"} /> : <EntityCombobox options={clientOptions} value={task.clientId} onChange={(id) => patch({ clientId: id })} placeholder="Sem cliente" />}
        </FormField>
        <FormField label="Projeto">
          <Input readOnly={Boolean(task.projectId)} defaultValue={task.projectName ?? ""} onBlur={(e) => e.target.value !== (task.projectName ?? "") && patch({ projectName: e.target.value || undefined })} placeholder="Ex.: Loja virtual" />
        </FormField>
      </FormGrid>

      {task.projectId && <p className="text-xs text-muted-foreground">Esta tarefa está vinculada a uma etapa. Gerencie o vínculo em Clientes → Projetos → Acompanhar projeto.</p>}
      <section className="space-y-2">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold">Checklist</h3>
          {progress.total > 0 && (
            <span className="num text-xs text-muted-foreground">
              {progress.done}/{progress.total} · {progress.pct}%
            </span>
          )}
        </div>
        {progress.total > 0 && (
          <div className="h-1 overflow-hidden rounded-full bg-muted">
            <div className="h-full rounded-full bg-primary" style={{ width: `${progress.pct}%` }} />
          </div>
        )}
        <div className="space-y-1">
          {task.checklist.map((item) => (
            <div key={item.id} className="group flex items-center gap-2 rounded-md px-1 py-1 hover:bg-accent">
              <Checkbox
                checked={item.done}
                onCheckedChange={(v) => patch({ checklist: task.checklist.map((c) => (c.id === item.id ? { ...c, done: Boolean(v) } : c)) })}
                aria-label={item.text}
              />
              <span className={item.done ? "flex-1 text-sm text-muted-foreground line-through" : "flex-1 text-sm"}>{item.text}</span>
              <Button
                variant="ghost"
                size="icon-xs"
                className="opacity-60 group-hover:opacity-100"
                onClick={() => patch({ checklist: task.checklist.filter((c) => c.id !== item.id) })}
                aria-label="Remover item"
              >
                <X />
              </Button>
            </div>
          ))}
        </div>
        <div className="flex gap-2">
          <Input value={newItem} onChange={(e) => setNewItem(e.target.value)} onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addItem())} placeholder="Adicionar item" />
          <Button variant="outline" onClick={addItem} aria-label="Adicionar item">
            <Plus />
          </Button>
        </div>
      </section>

      <section className="space-y-2">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold">Anexos</h3>
          <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()}>
            <Paperclip />
            Anexar arquivo
          </Button>
          <input ref={fileRef} type="file" multiple className="hidden" onChange={(e) => onFiles(e.target.files)} />
        </div>
        {task.attachments.length === 0 ? (
          <p className="text-xs text-muted-foreground">Nenhum anexo.</p>
        ) : (
          <div className="space-y-1.5">
            {task.attachments.map((a) => (
              <div key={a.id} className="flex items-center gap-3 rounded-lg border bg-surface px-3 py-2">
                <FileText className="size-4 shrink-0 text-muted-foreground" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm">{a.name}</p>
                  <p className="num text-[11px] text-muted-foreground">{formatFileSize(a.size)}</p>
                </div>
                <Button variant="ghost" size="icon-xs" onClick={() => patch({ attachments: task.attachments.filter((x) => x.id !== a.id) })} aria-label="Remover anexo">
                  <X />
                </Button>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="space-y-3">
        <h3 className="text-sm font-semibold">
          Comentários <span className="num text-xs font-normal text-muted-foreground">{task.comments.length}</span>
        </h3>
        <div className="space-y-3">
          {task.comments.map((c) => {
            const author = users.get(c.authorId)
            return (
              <div key={c.id} className="flex gap-2.5">
                <InitialsAvatar name={author?.name ?? "Usuário"} id={author?.id} size="md" />
                <div className="min-w-0 flex-1 rounded-lg border bg-surface px-3 py-2">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs font-medium">{author?.name ?? "Usuário"}</p>
                    <p className="text-[11px] text-muted-foreground">{formatRelative(c.createdAt)}</p>
                  </div>
                  <p className="mt-1 text-sm whitespace-pre-wrap">{c.text}</p>
                </div>
              </div>
            )
          })}
        </div>
        <div className="flex gap-2">
          <Textarea value={comment} onChange={(e) => setComment(e.target.value)} rows={2} placeholder="Escreva um comentário" className="min-h-0" />
          <Button onClick={addComment} disabled={!comment.trim()} aria-label="Enviar comentário" className="self-end">
            <Send />
          </Button>
        </div>
      </section>
    </div>
  )
}
