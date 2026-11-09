"use client"

import { useState } from "react"
import { Trash2 } from "lucide-react"
import { toast } from "@/lib/store/save-feedback"
import { Button } from "@/components/ui/button"
import { AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog"
import { useCrm } from "@/lib/data"
import { saveRecord } from "@/lib/data/records-actions"
import type { Client } from "@/types"

export function DeleteClientButton({ client, compact = false, onDeleted }: { client: Client; compact?: boolean; onDeleted?: () => void }) {
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const remove = async () => {
    setSaving(true)
    try {
      const deletedAt = new Date().toISOString()
      await saveRecord("clients", client.id, { deletedAt })
      const state = useCrm.getState()
      state.replace("clients", state.clients.map(item => item.id === client.id ? { ...item, deletedAt } : item))
      setOpen(false)
      toast.success("Cliente excluído")
      onDeleted?.()
    } catch { toast.error("Não foi possível excluir o cliente. Tente novamente.") }
    finally { setSaving(false) }
  }
  return <>
    <Button type="button" variant={compact ? "ghost" : "outline"} size={compact ? "icon-sm" : "default"} className="text-destructive" aria-label={`Excluir ${client.name}`} onClick={event => { event.stopPropagation(); setOpen(true) }}><Trash2 />{!compact && "Excluir cliente"}</Button>
    <AlertDialog open={open} onOpenChange={value => !saving && setOpen(value)}>
      <AlertDialogContent onClick={event => event.stopPropagation()}>
        <AlertDialogHeader><AlertDialogTitle>Excluir {client.name}?</AlertDialogTitle><AlertDialogDescription>O cliente será removido da listagem e das opções de novos cadastros. O lead de origem e o histórico de cobranças, pagamentos e notas fiscais serão preservados.</AlertDialogDescription></AlertDialogHeader>
        <AlertDialogFooter><AlertDialogCancel disabled={saving}>Cancelar</AlertDialogCancel><Button variant="destructive" onClick={() => void remove()} disabled={saving}>{saving ? "Excluindo…" : "Excluir cliente"}</Button></AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </>
}
