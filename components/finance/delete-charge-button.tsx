"use client"

import { useState } from "react"
import { Trash2 } from "lucide-react"
import { toast } from "@/lib/store/save-feedback"
import { Button } from "@/components/ui/button"
import { AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog"
import { useCrm } from "@/lib/data"
import { archiveChargeAction } from "@/lib/data/records-actions"
import { formatMoney } from "@/lib/format"
import type { Charge } from "@/types"

export function DeleteChargeButton({ charge, compact = false, onDeleted }: { charge: Charge; compact?: boolean; onDeleted?: () => void }) {
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const remove = async () => {
    setBusy(true)
    try {
      const result = await archiveChargeAction(charge.id)
      if (!result.ok) return void toast.error(result.error)
      const state = useCrm.getState()
      state.replace("charges", state.charges.map(item => item.id === charge.id ? { ...item, deletedAt: result.deletedAt } : item))
      state.replace("entries", state.entries.map(item => item.chargeId === charge.id ? { ...item, deletedAt: result.deletedAt } : item))
      setOpen(false)
      toast.success("Cobrança excluída do CRM")
      onDeleted?.()
    } catch { toast.error("Não foi possível excluir a cobrança") }
    finally { setBusy(false) }
  }
  return <>
    <Button type="button" variant={compact ? "ghost" : "outline"} size={compact ? "icon-sm" : "default"} className="text-destructive" aria-label={`Excluir cobrança ${charge.number}`} onClick={event => { event.stopPropagation(); setOpen(true) }}><Trash2 />{!compact && "Excluir do CRM"}</Button>
    <AlertDialog open={open} onOpenChange={value => !busy && setOpen(value)}>
      <AlertDialogContent onClick={event => event.stopPropagation()}>
        <AlertDialogHeader><AlertDialogTitle>Excluir esta cobrança do CRM?</AlertDialogTitle><AlertDialogDescription>{charge.description} · {formatMoney(charge.amount)}. A cobrança e seu lançamento financeiro sairão das listagens do CRM.{charge.gatewayId ? " A cobrança continuará existindo no Asaas e não será importada novamente." : " Ela não será recriada automaticamente ao atualizar o negócio."} Esta ação não estorna pagamentos nem cancela notas fiscais.</AlertDialogDescription></AlertDialogHeader>
        <AlertDialogFooter><AlertDialogCancel disabled={busy}>Cancelar</AlertDialogCancel><Button variant="destructive" disabled={busy} onClick={() => void remove()}>{busy ? "Excluindo…" : "Excluir do CRM"}</Button></AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </>
}
