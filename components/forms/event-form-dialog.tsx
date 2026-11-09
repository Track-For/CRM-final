"use client"

import { useEffect, useState } from "react"
import { Controller, useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { format } from "date-fns"
import { toast } from "@/lib/store/save-feedback"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { FormDialog } from "@/components/forms/form-dialog"
import { EntityCombobox } from "@/components/shared/entity-combobox"
import { FormField, FormGrid } from "@/components/shared/form-field"
import { OptionSelect } from "@/components/shared/option-select"
import { EVENT_TYPE_LABEL, toOptions } from "@/lib/constants"
import { newId, useCrm, useDeals } from "@/lib/data"
import { useEntityOptions } from "@/lib/data/options"
import { createGoogleCalendarEvent, getGoogleCalendarState, updateGoogleCalendarEvent } from "@/lib/google-calendar/actions"
import { applyGoogleCalendarState, useGoogleCalendarStore } from "@/lib/google-calendar/ui-store"
import { v } from "@/lib/validation"
import type { CalendarEvent } from "@/types"

const schema = z.object({
  title: v.required("Título"),
  type: v.select(["call", "reuniao", "followup", "entrega", "cobranca"], "o tipo"),
  date: v.date("Data"),
  time: v.required("Horário"),
  duration: z.string(),
  link: z.string().optional(),
  ownerId: v.required("Responsável"),
  meetingUrl: v.url(false),
  reminderMinutes: z.string(),
  description: z.string().optional(),
})
type Values = z.infer<typeof schema>

const DURATIONS = [
  { value: "15", label: "15 min" },
  { value: "30", label: "30 min" },
  { value: "45", label: "45 min" },
  { value: "60", label: "1 hora" },
  { value: "90", label: "1h30" },
  { value: "120", label: "2 horas" },
]
const REMINDERS = [
  { value: "0", label: "Sem lembrete" },
  { value: "10", label: "10 min antes" },
  { value: "15", label: "15 min antes" },
  { value: "30", label: "30 min antes" },
  { value: "60", label: "1 hora antes" },
  { value: "1440", label: "1 dia antes" },
]

interface EventFormDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Editar evento existente. */
  event?: CalendarEvent
  defaults?: { leadId?: string; dealId?: string; clientId?: string; date?: string; type?: string; title?: string }
}

/** Valor do vínculo codificado como "lead:id", "deal:id" ou "client:id". */
function encodeLink(e: { leadId?: string; dealId?: string; clientId?: string }) {
  if (e.dealId) return `deal:${e.dealId}`
  if (e.leadId) return `lead:${e.leadId}`
  if (e.clientId) return `client:${e.clientId}`
  return undefined
}

export function EventFormDialog({ open, onOpenChange, event, defaults }: EventFormDialogProps) {
  const currentUserId = useCrm((s) => s.currentUserId)
  const deals = useDeals()
  const googleConnection = useGoogleCalendarStore(s => s.data)
  const [requestId, setRequestId] = useState(() => newId("google_evt"))
  useEffect(() => {
    if (!open) return
    const initial = setTimeout(() => {
      setRequestId(newId("google_evt"))
      void getGoogleCalendarState().then(applyGoogleCalendarState).catch(() => { /* O formulário permanece bloqueado sem uma agenda editável. */ })
    }, 0)
    return () => clearTimeout(initial)
  }, [open, event])
  const { leadOptions, clientOptions, dealOptions, userOptions } = useEntityOptions()
  const linkOptions = [
    ...dealOptions.map((o) => ({ ...o, value: `deal:${o.value}` })),
    ...leadOptions.map((o) => ({ ...o, value: `lead:${o.value}` })),
    ...clientOptions.map((o) => ({ ...o, value: `client:${o.value}` })),
  ]

  const initial = (): Values => {
    const start = event ? new Date(event.start) : defaults?.date ? new Date(defaults.date) : new Date()
    const duration = event ? Math.round((new Date(event.end).getTime() - start.getTime()) / 60000) : 30
    return {
      title: event?.title ?? defaults?.title ?? "",
      type: (event?.type ?? defaults?.type ?? "call") as Values["type"],
      date: format(start, "yyyy-MM-dd"),
      time: event || defaults?.date ? format(start, "HH:mm") : "10:00",
      duration: String(duration > 0 ? duration : 30),
      link: encodeLink(event ?? defaults ?? {}),
      ownerId: event?.ownerId ?? currentUserId,
      meetingUrl: event?.meetingUrl ?? "",
      reminderMinutes: event?.google?.usesDefaultReminders ? "google_default" : String(event ? event.reminderMinutes ?? 0 : 15),
      description: event?.description ?? "",
    }
  }
  const { register, control, handleSubmit, reset, formState } = useForm<Values>({ resolver: zodResolver(schema), defaultValues: initial() })
  const errors = formState.errors

  useEffect(() => {
    if (open) reset(initial())
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, event?.id])

  const onSubmit = handleSubmit(async (values) => {
    if (!googleConnection?.canWrite) { toast.error("Conecte uma agenda Google com permissão de edição para salvar eventos."); return }
    if (event && !event.google) { toast.error("Este evento local foi removido. Atualize a agenda."); return }
    const start = new Date(`${values.date}T${values.time}:00`)
    const end = new Date(start.getTime() + Number(values.duration) * 60000)
    const [kind, id] = (values.link ?? "").split(":")
    const deal = kind === "deal" ? deals.find((d) => d.id === id) : undefined
    const data = {
      title: values.title,
      type: values.type,
      start: start.toISOString(),
      end: end.toISOString(),
      dealId: deal?.id,
      leadId: kind === "lead" ? id : deal?.leadId,
      clientId: kind === "client" ? id : deal?.clientId,
      ownerId: values.ownerId,
      meetingUrl: values.meetingUrl || undefined,
      reminderMinutes: Number(values.reminderMinutes) || undefined,
      description: values.description,
    }
    try {
      const result = event?.google
        ? await updateGoogleCalendarEvent(event.id, event.google.etag, data)
        : await createGoogleCalendarEvent(requestId, data)
      applyGoogleCalendarState(result)
      toast.success(event ? "Evento atualizado no Google Agenda" : "Evento criado no Google Agenda")
      onOpenChange(false)
    } catch (error) { toast.error(error instanceof Error ? error.message : "Não foi possível salvar no Google Agenda") }

  })

  return (
    <FormDialog open={open} onOpenChange={onOpenChange} title={event ? "Editar evento" : "Novo evento"} onSubmit={onSubmit} submitLabel={event ? "Salvar" : "Criar evento"} submitting={formState.isSubmitting || !googleConnection?.canWrite || Boolean(event?.google?.readOnly)} description={event?.google?.recurring ? "A alteração será aplicada somente a esta ocorrência da reunião." : undefined}>
      <p className="rounded-lg border p-3 text-sm">{googleConnection?.canWrite ? `Este evento será salvo no Google Agenda: ${googleConnection.selected?.summary || "agenda selecionada"}.` : "Conecte e selecione uma agenda Google com permissão de edição para criar ou alterar eventos."}</p>
      <FormGrid>
        <FormField label="Título" required error={errors.title?.message} className="sm:col-span-2">
          <Input {...register("title")} placeholder="Ex.: Call de diagnóstico" aria-invalid={!!errors.title} />
        </FormField>
        <FormField label="Tipo" required>
          <Controller control={control} name="type" render={({ field }) => <OptionSelect value={field.value} onChange={field.onChange} options={toOptions(EVENT_TYPE_LABEL)} />} />
        </FormField>
        <FormField label="Responsável" required>
          <Controller control={control} name="ownerId" render={({ field }) => <OptionSelect value={googleConnection ? googleConnection.owner.id : field.value} onChange={field.onChange} options={userOptions} disabled />} />
        </FormField>
        <FormField label="Data" required error={errors.date?.message}>
          <Input type="date" {...register("date")} />
        </FormField>
        <div className="grid grid-cols-2 gap-2">
          <FormField label="Horário" required error={errors.time?.message}>
            <Input type="time" {...register("time")} />
          </FormField>
          <FormField label="Duração">
            <Controller control={control} name="duration" render={({ field }) => <OptionSelect value={field.value} onChange={field.onChange} options={event && !DURATIONS.some(d => d.value === String(Math.round((new Date(event.end).getTime() - new Date(event.start).getTime()) / 60000))) ? [...DURATIONS, { value: String(Math.round((new Date(event.end).getTime() - new Date(event.start).getTime()) / 60000)), label: `${Math.round((new Date(event.end).getTime() - new Date(event.start).getTime()) / 60000)} min` }] : DURATIONS} />} />
          </FormField>
        </div>
        <FormField label="Vínculo (lead, negócio ou cliente)" className="sm:col-span-2">
          <Controller control={control} name="link" render={({ field }) => <EntityCombobox options={linkOptions} value={field.value} onChange={field.onChange} placeholder="Opcional" searchPlaceholder="Buscar lead, negócio ou cliente" />} />
        </FormField>
        <FormField label="Link da reunião" error={errors.meetingUrl?.message}>
          <Input {...register("meetingUrl")} readOnly={Boolean(event?.google)} placeholder="https://meet.google.com/..." />
        </FormField>
        <FormField label="Lembrete">
          <Controller control={control} name="reminderMinutes" render={({ field }) => <OptionSelect value={field.value} onChange={field.onChange} options={event?.google?.usesDefaultReminders ? [{ value: "google_default", label: "Padrão do Google" }, ...REMINDERS] : REMINDERS} disabled={Boolean(event?.google)} />} />
        </FormField>
        <FormField label="Observações" className="sm:col-span-2">
          <Textarea {...register("description")} rows={2} />
        </FormField>
      </FormGrid>
    </FormDialog>
  )
}
