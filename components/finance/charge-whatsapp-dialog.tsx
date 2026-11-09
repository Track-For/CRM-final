"use client"

import { useEffect, useState } from "react"
import { toast } from "@/lib/store/save-feedback"
import { FormDialog } from "@/components/forms/form-dialog"
import { Textarea } from "@/components/ui/textarea"
import { useCompany } from "@/lib/data"
import { persistedChargeMessage } from "@/lib/finance/charge-plan"
import { getChargeWhatsappStatus, sendChargeWhatsapp } from "@/lib/finance/charge-actions"
import type { Charge, Client } from "@/types"

export function ChargeWhatsappDialog({ charge, client, onClose }: { charge: Charge; client: Client; onClose: () => void }) {
  const company = useCompany()
  const [message, setMessage] = useState(() => persistedChargeMessage({ charge, name: client.contactName || client.name, company: company.name || "nossa empresa", pixKey: company.pixKey }))
  const [connected, setConnected] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  useEffect(() => { getChargeWhatsappStatus().then(state => setConnected(state.connected)).catch(() => setConnected(false)) }, [])
  const submit = async () => {
    setBusy(true)
    try {
      const result = await sendChargeWhatsapp(charge.id, message)
      if (!result.ok) { setError(result.error || "Não foi possível enviar."); return }
      toast.success("Envio da cobrança confirmado pelo WhatsApp")
      onClose()
    } catch (e) { setError(e instanceof Error ? e.message : "Não foi possível enviar.") }
    finally { setBusy(false) }
  }
  return <FormDialog open onOpenChange={open => { if (!open && !busy) onClose() }} title="Enviar cobrança pelo WhatsApp" description={`Destinatário: ${client.contactName || client.name} — ${client.whatsapp}`} submitLabel={busy ? "Enviando..." : "Enviar pelo WhatsApp"} submitting={busy || !connected || !message.trim()} onSubmit={event => { event.preventDefault(); void submit() }}>
    <Textarea aria-label="Mensagem da cobrança" rows={10} value={message} disabled={busy} onChange={event => setMessage(event.target.value)} />
    {!connected && <p className="text-sm text-muted-foreground">Conecte o WhatsApp do CRM para enviar. A cobrança permanece salva.</p>}
    {error && <p role="alert" className="text-sm text-danger">{error}</p>}
  </FormDialog>
}
