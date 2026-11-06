"use client"
import { toast } from "sonner"
import { useEffect, useState } from "react"
import { getFiscalSettings, getInvoice, listInvoices, type FiscalSettingsView, type InvoiceView } from "@/lib/fiscal/actions"
import { InvoiceFormDialog as FiscalForm, type InvoiceDefaults } from "@/components/invoices/invoice-form-dialog"
import { InvoiceDrawer as FiscalDrawer } from "@/components/invoices/invoice-drawer"
import { EntityDrawer } from "@/components/shared/entity-drawer"
import { Button } from "@/components/ui/button"
import { useCrm } from "@/lib/data"
import type { Invoice } from "@/types"

function syncInvoice(invoice: InvoiceView) {
  const mapped: Invoice = { id: invoice.id, number: invoice.number, clientId: invoice.clientId || "", chargeId: invoice.chargeId || undefined, serviceDescription: invoice.serviceDescription, serviceCode: invoice.serviceItem, issRate: invoice.issRate, amount: invoice.amount, status: invoice.status === "cancelando" ? "processando" : invoice.status === "rascunho" ? "rejeitada" : invoice.status, issuedAt: invoice.issuedAt || invoice.createdAt, verificationCode: invoice.verificationCode || undefined, retentions: { ir: invoice.retentions.ir || 0, pis: invoice.retentions.pis || 0, cofins: invoice.retentions.cofins || 0, csll: invoice.retentions.csll || 0, inss: invoice.retentions.inss || 0, issRetido: invoice.issRetained } }
  useCrm.setState(state => ({ invoices: [...state.invoices.filter(item => item.id !== mapped.id), mapped] }))
}
export function useRelatedInvoices(enabled: boolean) {
  useEffect(() => {
    if (!enabled) return
    let active = true
    let warned = false
    const load = () => listInvoices().then(items => { if (active) { useCrm.setState({ invoices: [] }); items.forEach(syncInvoice) } }).catch(() => { if (active && !warned) { warned = true; toast.error("Não foi possível consultar as notas fiscais.") } })
    void load()
    const timer = window.setInterval(() => { if (!document.hidden) void load() }, 10000)
    return () => { active = false; window.clearInterval(timer) }
  }, [enabled])
}
export function RelatedInvoiceForm({ open, onOpenChange, defaults }: { open: boolean; onOpenChange: (open: boolean) => void; defaults?: InvoiceDefaults }) {
  const [settings, setSettings] = useState<FiscalSettingsView | null>(null)
  const [error, setError] = useState("")
  useEffect(() => { if (open) { getFiscalSettings().then(setSettings).catch(() => setError("Não foi possível carregar a configuração fiscal.")) } }, [open])
  if (!open) return null
  if (!settings) return <EntityDrawer open onOpenChange={onOpenChange} title="Emitir NFS-e"><p role="status">{error || "Carregando configuração…"}</p></EntityDrawer>
  return <FiscalForm open={open} onOpenChange={onOpenChange} defaults={defaults} settings={settings} onSaved={syncInvoice} />
}
export function RelatedInvoiceDrawer({ invoiceId, onOpenChange }: { invoiceId: string | null; onOpenChange: (open: boolean) => void }) {
  const [data, setData] = useState<{ invoice: InvoiceView; settings: FiscalSettingsView } | null>(null)
  const [error, setError] = useState("")
  useEffect(() => {
    if (!invoiceId) return
    let active = true
    Promise.all([getInvoice(invoiceId), getFiscalSettings()]).then(([invoice, settings]) => { if (active) { if (invoice) setData({ invoice, settings }); else setError("Nota fiscal não encontrada ou sem permissão.") } }).catch(() => { if (active) setError("Não foi possível carregar a nota fiscal.") })
    return () => { active = false }
  }, [invoiceId])
  if (!invoiceId) return null
  if (!data || data.invoice.id !== invoiceId) return <EntityDrawer open onOpenChange={onOpenChange} title="Nota fiscal"><p role="status">{error || "Carregando nota…"}</p><Button variant="outline" onClick={() => onOpenChange(false)}>Fechar</Button></EntityDrawer>
  return <FiscalDrawer invoice={data.invoice} settings={data.settings} onOpenChange={onOpenChange} onChange={invoice => { setData({ ...data, invoice }); syncInvoice(invoice) }} />
}
