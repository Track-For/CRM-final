"use client"

import { useState } from "react"
import { Trash2 } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog"
import { deleteUserAction } from "@/lib/auth/user-actions"
import { useCrm } from "@/lib/data"
import type { User } from "@/types"

export function DeleteUserButton({ user, disabled }: { user: User; disabled: boolean }) {
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const remove = async () => {
    setSaving(true)
    try {
      await deleteUserAction(user.id)
      const state = useCrm.getState()
      state.replace("users", state.users.filter(item => item.id !== user.id))
      setOpen(false)
      toast.success("Usuário excluído")
    } catch (error) { toast.error(error instanceof Error ? error.message : "Não foi possível excluir o usuário.") }
    finally { setSaving(false) }
  }
  return <>
    <Button type="button" variant="ghost" size="icon-sm" className="text-destructive" disabled={disabled || saving} aria-label={`Excluir usuário ${user.name}`} title={disabled ? "Você não pode excluir seu próprio acesso" : "Excluir usuário"} onClick={() => setOpen(true)}><Trash2 /></Button>
    <AlertDialog open={open} onOpenChange={value => !saving && setOpen(value)}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Excluir {user.name}?</AlertDialogTitle>
          <AlertDialogDescription>Esta exclusão é permanente. O acesso, as sessões, os convites pendentes e as conexões pessoais deste usuário serão removidos. Leads, clientes, negócios, tarefas e documentos do CRM serão preservados. Para suspender o acesso temporariamente, use a opção de desativar.</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={saving}>Cancelar</AlertDialogCancel>
          <Button variant="destructive" disabled={saving} onClick={() => void remove()}>{saving ? "Excluindo…" : "Excluir usuário"}</Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </>
}
