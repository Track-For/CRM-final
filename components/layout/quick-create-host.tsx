"use client"

import { ChargeFormDialog } from "@/components/forms/charge-form-dialog"
import { DealFormDialog } from "@/components/forms/deal-form-dialog"
import { EventFormDialog } from "@/components/forms/event-form-dialog"
import { LeadFormDialog } from "@/components/forms/lead-form-dialog"
import { TaskFormDialog } from "@/components/forms/task-form-dialog"
import { useUiStore } from "@/lib/store/ui-store"

/**
 * Monta os modais de criação rápida uma única vez. Qualquer tela pode abrir com:
 * `useUiStore.getState().openQuickCreate("event", { leadId })`.
 */
export function QuickCreateHost() {
  const kind = useUiStore((s) => s.quickCreate)
  const defaults = useUiStore((s) => s.quickCreateDefaults)
  const close = useUiStore((s) => s.closeQuickCreate)
  const onOpenChange = (open: boolean) => {
    if (!open) close()
  }
  return (
    <>
      <LeadFormDialog open={kind === "lead"} onOpenChange={onOpenChange} />
      <DealFormDialog open={kind === "deal"} onOpenChange={onOpenChange} defaults={defaults} />
      <TaskFormDialog open={kind === "task"} onOpenChange={onOpenChange} defaults={defaults} />
      <EventFormDialog open={kind === "event"} onOpenChange={onOpenChange} defaults={defaults} />
      <ChargeFormDialog open={kind === "charge"} onOpenChange={onOpenChange} defaults={defaults} />
    </>
  )
}
