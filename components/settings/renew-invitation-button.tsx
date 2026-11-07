"use client"

import { useState } from "react"
import { toast } from "sonner"
import { renewInvitationAction } from "@/lib/auth/user-actions"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { copyToClipboard } from "@/lib/browser"

export function RenewInvitationButton({ id }: { id: string }) {
  const [busy, setBusy] = useState(false)
  const [link, setLink] = useState("")
  const renew = async () => {
    setBusy(true)
    try {
      const result = await renewInvitationAction(id)
      setLink(new URL(result.path, window.location.origin).href)
    } catch (error) { toast.error(error instanceof Error ? error.message : "Não foi possível renovar o convite.") }
    finally { setBusy(false) }
  }
  return <>
    <Button size="sm" variant="outline" disabled={busy} onClick={() => void renew()}>{busy ? "Gerando…" : "Renovar convite"}</Button>
    <Dialog open={Boolean(link)} onOpenChange={open => !open && setLink("")}>
      <DialogContent>
        <DialogHeader><DialogTitle>Novo convite criado</DialogTitle><DialogDescription>Compartilhe este link com o usuário. Ele vale por 48 horas e substitui os convites anteriores.</DialogDescription></DialogHeader>
        <Input aria-label="Link do convite" readOnly value={link} />
        <Button onClick={() => void copyToClipboard(link)}>Copiar link</Button>
      </DialogContent>
    </Dialog>
  </>
}
