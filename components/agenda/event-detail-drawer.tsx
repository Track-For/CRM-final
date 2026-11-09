"use client"

import Link from "next/link"
import { useState } from "react"
import { deleteGoogleCalendarEvent } from "@/lib/google-calendar/actions"
import { applyGoogleCalendarState } from "@/lib/google-calendar/ui-store"
import { Bell, Building2, CalendarClock, Handshake, MessageCircle, Pencil, Trash2, UserRound, Video } from "lucide-react"
import { toast } from "@/lib/store/save-feedback"
import { Button } from "@/components/ui/button"
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
import { EntityDrawer } from "@/components/shared/entity-drawer"
import { InfoRow } from "@/components/shared/panel"
import { StatusBadge } from "@/components/shared/status-badge"
import { UserAvatar } from "@/components/shared/user-avatar"
import { durationLabel, reminderLabel } from "@/components/agenda/utils"
import { EVENT_TYPE_LABEL, EVENT_TYPE_TONE } from "@/lib/constants"
import { openWhatsapp } from "@/lib/browser"
import { useClient, useCrm, useDeal, useLead } from "@/lib/data"
import { formatDate, formatDateLong, formatTime, whatsappLink } from "@/lib/format"
import type { CalendarEvent } from "@/types"

interface EventDetailDrawerProps {
  event: CalendarEvent | undefined
  onOpenChange: (open: boolean) => void
  onEdit: (event: CalendarEvent) => void
}

function LinkRow({ href, icon: Icon, label, value }: { href: string; icon: typeof UserRound; label: string; value: string }) {
  return (
    <Link href={href} className="flex items-center gap-3 rounded-lg border bg-surface px-3 py-2 hover:border-[#9abcec]">
      <Icon className="size-4 shrink-0 text-muted-foreground" />
      <div className="min-w-0">
        <p className="text-[11px] text-muted-foreground">{label}</p>
        <p className="truncate text-sm">{value}</p>
      </div>
    </Link>
  )
}

export function EventDetailDrawer({ event, onOpenChange, onEdit }: EventDetailDrawerProps) {
  const lead = useLead(event?.leadId)
  const deal = useDeal(event?.dealId)
  const client = useClient(event?.clientId)
  const remove = useCrm((s) => s.remove)
  const [deleting, setDeleting] = useState(false)

  const phone = lead?.whatsapp ?? client?.whatsapp
  const contactName = (lead?.name ?? client?.contactName ?? "").split(" ")[0]

  const sendReminder = () => {
    if (!event || !phone) return
    const text = `Olá, ${contactName}! Passando para lembrar do nosso compromisso "${event.title}" em ${formatDate(event.start)} às ${formatTime(event.start)}.${event.meetingUrl ? ` Link: ${event.meetingUrl}` : ""}`
    openWhatsapp(whatsappLink(phone, text))
    toast.success("Lembrete aberto no WhatsApp")
  }

  return (
    <EntityDrawer
      open={Boolean(event)}
      onOpenChange={onOpenChange}
      size="md"
      title={event?.title ?? ""}
      badge={event && <StatusBadge tone={EVENT_TYPE_TONE[event.type]}>{EVENT_TYPE_LABEL[event.type]}</StatusBadge>}
      footer={
        event && (
          <>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="destructive" size="sm" disabled={deleting || event.google?.readOnly}>
                  <Trash2 />
                  Excluir
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Excluir evento?</AlertDialogTitle>
                  <AlertDialogDescription>O compromisso &quot;{event.title}&quot; será removido {event.google ? "do Google Agenda e desta tela" : "da agenda"}.{event.google?.recurring && " Somente esta ocorrência será removida."}</AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancelar</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={async () => {
                      setDeleting(true)
                      try {
                        if (event.google) applyGoogleCalendarState(await deleteGoogleCalendarEvent(event.id, event.google.etag))
                        else remove("events", event.id)
                        onOpenChange(false)
                        toast.success("Evento excluído")
                      } catch (error) { toast.error(error instanceof Error ? error.message : "Não foi possível excluir o evento") }
                      finally { setDeleting(false) }
                    }}
                  >
                    Excluir
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
            <Button variant="outline" size="sm" disabled={event.google?.readOnly || deleting} onClick={() => onEdit(event)}>
              <Pencil />
              Editar
            </Button>
          </>
        )
      }
    >
      {event && (
        <div className="space-y-5">
          <div className="flex items-start gap-3 rounded-lg border bg-surface p-3">
            <CalendarClock className="mt-0.5 size-4 text-primary" />
            <div>
              <p className="text-sm font-medium capitalize">{formatDateLong(event.start)}</p>
              <p className="num text-sm text-muted-foreground">
                {event.allDay ? "Dia inteiro" : `${formatTime(event.start)} – ${formatTime(event.end)} · ${durationLabel(event)}`}
              </p>
            </div>
          </div>

          {event.google && <div className="space-y-2 text-xs text-muted-foreground"><p>Google Agenda{event.google.readOnly ? " · Consulta pelo CRM. Edite este compromisso no Google Agenda." : " · Alterações neste evento serão salvas no Google."}</p>{event.google.htmlLink && <a href={event.google.htmlLink} target="_blank" rel="noopener noreferrer" className="text-primary">Abrir no Google Agenda</a>}</div>}
          <div className="flex flex-wrap gap-2">
            {event.meetingUrl && (
              <Button asChild size="sm">
                <a href={event.meetingUrl} target="_blank" rel="noopener noreferrer">
                  <Video />
                  Entrar na reunião
                </a>
              </Button>
            )}
            <Button size="sm" variant="outline" onClick={sendReminder} disabled={!phone}>
              <MessageCircle />
              Enviar lembrete no WhatsApp
            </Button>
          </div>

          <div className="divide-y">
            <InfoRow label="Responsável">
              <UserAvatar userId={event.ownerId} showName />
            </InfoRow>
            <InfoRow label="Lembrete">
              <span className="inline-flex items-center gap-1.5">
                <Bell className="size-3.5 text-muted-foreground" />
                {event.google?.usesDefaultReminders ? "Padrão da agenda Google" : reminderLabel(event.reminderMinutes)}
              </span>
            </InfoRow>
            {event.meetingUrl && (
              <InfoRow label="Link">
                <span className="num text-xs break-all">{event.meetingUrl}</span>
              </InfoRow>
            )}
          </div>

          {(lead || deal || client) && (
            <div className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground">Vínculos</p>
              {lead && <LinkRow href={`/leads/${lead.id}`} icon={UserRound} label="Lead" value={`${lead.name} · ${lead.company}`} />}
              {deal && <LinkRow href={`/vendas/${deal.id}`} icon={Handshake} label="Negócio" value={deal.title} />}
              {client && <LinkRow href={`/clientes/${client.id}`} icon={Building2} label="Cliente" value={client.name} />}
            </div>
          )}

          {event.description && (
            <div className="space-y-1">
              <p className="text-xs font-medium text-muted-foreground">Observações</p>
              <p className="text-sm whitespace-pre-wrap">{event.description}</p>
            </div>
          )}
        </div>
      )}
    </EntityDrawer>
  )
}
