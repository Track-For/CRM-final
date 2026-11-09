"use client"

import { useEffect } from "react"
import { Controller, useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { addDays, format } from "date-fns"
import { toast } from "@/lib/store/save-feedback"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { FormDialog } from "@/components/forms/form-dialog"
import { EntityCombobox } from "@/components/shared/entity-combobox"
import { FormField, FormGrid } from "@/components/shared/form-field"
import { OptionSelect } from "@/components/shared/option-select"
import { TASK_PRIORITY_LABEL, TASK_STATUS_LABEL, toOptions } from "@/lib/constants"
import { newId, useClients, useCrm, useTasks } from "@/lib/data"
import { useEntityOptions } from "@/lib/data/options"
import { v } from "@/lib/validation"
import type { Task } from "@/types"

const schema = z.object({
  title: v.required("Título"),
  description: z.string().optional(),
  status: v.select(["todo", "doing", "review", "done"], "o status"),
  priority: v.select(["baixa", "media", "alta", "urgente"], "a prioridade"),
  assigneeId: v.required("Responsável"),
  dueDate: v.date("Prazo"),
  clientId: z.string().optional(),
  projectName: z.string().optional(),
})
type Values = z.infer<typeof schema>

interface TaskFormDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  defaults?: { clientId?: string; dealId?: string; leadId?: string; status?: string; projectName?: string }
}

export function TaskFormDialog({ open, onOpenChange, defaults }: TaskFormDialogProps) {
  const add = useCrm((s) => s.add)
  const currentUserId = useCrm((s) => s.currentUserId)
  const clients = useClients()
  const tasks = useTasks()
  const { clientOptions, userOptions } = useEntityOptions()

  const initial = (): Values => ({
    title: "",
    description: "",
    status: (defaults?.status as Values["status"]) ?? "todo",
    priority: "media",
    assigneeId: currentUserId,
    dueDate: format(addDays(new Date(), 3), "yyyy-MM-dd"),
    clientId: defaults?.clientId,
    projectName: defaults?.projectName || "",
  })
  const { register, control, handleSubmit, reset, formState } = useForm<Values>({ resolver: zodResolver(schema), defaultValues: initial() })
  const errors = formState.errors

  useEffect(() => {
    if (open) reset(initial())
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const onSubmit = handleSubmit((values) => {
    const client = clients.find((c) => c.id === values.clientId)
    const task: Task = {
      id: newId("tsk"),
      title: values.title,
      description: values.description ?? "",
      status: values.status,
      priority: values.priority,
      assigneeId: values.assigneeId,
      clientId: values.clientId,
      dealId: defaults?.dealId,
      leadId: defaults?.leadId,
      projectName: values.projectName || client?.name,
      dueDate: new Date(`${values.dueDate}T18:00:00`).toISOString(),
      checklist: [],
      comments: [],
      attachments: [],
      order: tasks.length,
      createdAt: new Date().toISOString(),
    }
    add("tasks", task)
    toast.success("Tarefa criada")
    onOpenChange(false)
  })

  return (
    <FormDialog open={open} onOpenChange={onOpenChange} title="Nova tarefa" onSubmit={onSubmit} submitLabel="Criar tarefa">
      <FormGrid>
        <FormField label="Título" required error={errors.title?.message} className="sm:col-span-2">
          <Input {...register("title")} placeholder="O que precisa ser feito?" aria-invalid={!!errors.title} />
        </FormField>
        <FormField label="Descrição" className="sm:col-span-2">
          <Textarea {...register("description")} rows={3} />
        </FormField>
        <FormField label="Cliente">
          <Controller control={control} name="clientId" render={({ field }) => <EntityCombobox options={clientOptions} value={field.value} onChange={field.onChange} placeholder="Opcional" />} />
        </FormField>
        <FormField label="Projeto">
          <Input {...register("projectName")} placeholder="Ex.: Site institucional" />
        </FormField>
        <FormField label="Responsável" required>
          <Controller control={control} name="assigneeId" render={({ field }) => <OptionSelect value={field.value} onChange={field.onChange} options={userOptions} />} />
        </FormField>
        <FormField label="Prazo" required error={errors.dueDate?.message}>
          <Input type="date" {...register("dueDate")} />
        </FormField>
        <FormField label="Prioridade" required>
          <Controller control={control} name="priority" render={({ field }) => <OptionSelect value={field.value} onChange={field.onChange} options={toOptions(TASK_PRIORITY_LABEL)} />} />
        </FormField>
        <FormField label="Status" required>
          <Controller control={control} name="status" render={({ field }) => <OptionSelect value={field.value} onChange={field.onChange} options={toOptions(TASK_STATUS_LABEL)} />} />
        </FormField>
      </FormGrid>
    </FormDialog>
  )
}
