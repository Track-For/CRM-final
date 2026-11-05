"use client"

// Versão mock (Zustand) usada pela ficha do cliente e pelo financeiro enquanto clientes e cobranças não
// estão no banco. A tela de Notas fiscais usa a versão real em components/invoices/*.

import { useState } from "react"
import Link from "next/link"
import { Ban, FileCode, FileDown, MessageCircle, RotateCcw, TriangleAlert } from "lucide-react"
import { Button } from "@/components/ui/button"
import { EntityDrawer } from "@/components/shared/entity-drawer"
import { InfoRow } from "@/components/shared/panel"
import { EnumBadge } from "@/components/shared/status-badge"
import { ReasonDialog } from "@/components/finance/reason-dialog"
import { InvoiceFormDialog, SERVICE_CODES } from "@/components/invoices/legacy/invoice-form-dialog"
import { mockAction, openWhatsapp } from "@/lib/browser"
import { INVOICE_STATUS_LABEL, INVOICE_STATUS_TONE } from "@/lib/constants"
import { useClient, useCrm, useEntity } from "@/lib/data"
import { formatDateTime, formatMoney, whatsappLink } from "@/lib/format"

export function InvoiceDrawer({ invoiceId, onOpenChange }: { invoiceId: string | null; onOpenChange: (open: boolean) => void }) {
  const invoice = useEntity("invoices", invoiceId)
  const client = useClient(invoice?.clientId)
  const update = useCrm((s) => s.update)
  const [cancelOpen, setCancelOpen] = useState(false)
  const [fixOpen, setFixOpen] = useState(false)

  if (!invoice) return null
  const iss = (invoice.amount * invoice.issRate) / 100
  const r = invoice.retentions
  const retentions = r.ir + r.pis + r.cofins + r.csll + r.inss + (r.issRetido ? iss : 0)
  const label = invoice.number ? `NFS-e ${invoice.number}` : "NFS-e sem número"

  const sendWhatsapp = () => {
    if (!client) return
    const text = `Olá, ${client.contactName.split(" ")[0]}! Segue a ${label} da Track For no valor de ${formatMoney(invoice.amount)}. Código de verificação: ${invoice.verificationCode ?? "—"}.`
    openWhatsapp(whatsappLink(client.whatsapp, text))
  }

  return (
    <>
      <EntityDrawer
        open={Boolean(invoiceId)}
        onOpenChange={onOpenChange}
        title={label}
        badge={<EnumBadge value={invoice.status} labels={INVOICE_STATUS_LABEL} tones={INVOICE_STATUS_TONE} />}
        description={client ? client.legalName : undefined}
        footer={
          <>
            {invoice.status === "emitida" && (
              <Button variant="destructive" onClick={() => setCancelOpen(true)}>
                <Ban />
                Cancelar nota
              </Button>
            )}
            {invoice.status === "rejeitada" && (
              <Button onClick={() => setFixOpen(true)}>
                <RotateCcw />
                Corrigir e reenviar
              </Button>
            )}
            {invoice.status === "emitida" && (
              <Button onClick={sendWhatsapp}>
                <MessageCircle />
                Enviar no WhatsApp
              </Button>
            )}
          </>
        }
      >
        <div className="space-y-5">
          {invoice.status === "rejeitada" && invoice.rejectionReason && (
            <div className="flex gap-3 rounded-lg border border-[#4a1818] bg-danger-soft p-3 text-sm">
              <TriangleAlert className="mt-0.5 size-4 shrink-0 text-danger" />
              <div>
                <p className="font-medium text-danger">Nota rejeitada pela prefeitura</p>
                <p className="num mt-0.5 text-xs">{invoice.rejectionReason}</p>
              </div>
            </div>
          )}
          {invoice.status === "processando" && <p className="rounded-lg border border-[#17305a] bg-info-soft p-3 text-sm text-info">Aguardando retorno da prefeitura. Isso costuma levar poucos segundos.</p>}

          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-lg border bg-surface p-3">
              <p className="text-xs text-muted-foreground">Valor do serviço</p>
              <p className="num mt-1 text-lg font-semibold text-primary">{formatMoney(invoice.amount)}</p>
            </div>
            <div className="rounded-lg border bg-surface p-3">
              <p className="text-xs text-muted-foreground">Valor líquido</p>
              <p className="num mt-1 text-lg font-semibold">{formatMoney(invoice.amount - retentions)}</p>
            </div>
          </div>

          <div>
            <InfoRow label="Número" mono>{invoice.number ?? "—"}</InfoRow>
            <InfoRow label="Código de verificação" mono>{invoice.verificationCode ?? "—"}</InfoRow>
            <InfoRow label="Data de emissão" mono>{formatDateTime(invoice.issuedAt)}</InfoRow>
            <InfoRow label="Tomador">
              {client ? (
                <Link href={`/clientes/${client.id}`} className="hover:text-primary">
                  {client.name}
                </Link>
              ) : (
                "—"
              )}
            </InfoRow>
            <InfoRow label="CPF/CNPJ" mono>{client?.document ?? "—"}</InfoRow>
            <InfoRow label="Código do serviço">{SERVICE_CODES.find((s) => s.value === invoice.serviceCode)?.label ?? invoice.serviceCode}</InfoRow>
            <InfoRow label="Alíquota ISS" mono>{invoice.issRate}%</InfoRow>
            <InfoRow label="ISS" mono>{formatMoney(iss)}{r.issRetido ? " (retido)" : ""}</InfoRow>
            <InfoRow label="Retenções federais" mono>{formatMoney(r.ir + r.pis + r.cofins + r.csll + r.inss)}</InfoRow>
          </div>

          <div>
            <p className="mb-1.5 text-xs text-muted-foreground">Discriminação do serviço</p>
            <p className="rounded-lg border bg-surface p-3 text-sm">{invoice.serviceDescription}</p>
          </div>

          {invoice.status !== "processando" && invoice.status !== "rejeitada" && (
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" onClick={() => mockAction("PDF da nota baixado", `${label}.pdf`)}>
                <FileDown />
                Baixar PDF
              </Button>
              <Button variant="outline" size="sm" onClick={() => mockAction("XML da nota baixado", `${label}.xml`)}>
                <FileCode />
                Baixar XML
              </Button>
            </div>
          )}
        </div>
      </EntityDrawer>
      <ReasonDialog
        open={cancelOpen}
        onOpenChange={setCancelOpen}
        title={`Cancelar ${label}`}
        description="O cancelamento é enviado para a prefeitura e não pode ser desfeito."
        label="Motivo do cancelamento"
        confirmLabel="Cancelar nota"
        onConfirm={(reason) => {
          update("invoices", invoice.id, { status: "cancelada", rejectionReason: reason })
          mockAction("Nota cancelada", reason)
        }}
      />
      <InvoiceFormDialog open={fixOpen} onOpenChange={setFixOpen} invoice={invoice} />
    </>
  )
}
