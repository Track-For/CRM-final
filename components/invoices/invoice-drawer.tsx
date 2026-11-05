"use client"

import { useState, useTransition } from "react"
import Link from "next/link"
import { Ban, FileCode, FileDown, Info, Loader2, MessageCircle, RefreshCw, RotateCcw, TriangleAlert } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { EntityDrawer } from "@/components/shared/entity-drawer"
import { InfoRow } from "@/components/shared/panel"
import { EnumBadge, StatusBadge } from "@/components/shared/status-badge"
import { CancelInvoiceDialog } from "@/components/invoices/cancel-invoice-dialog"
import { InvoiceFormDialog } from "@/components/invoices/invoice-form-dialog"
import {
  CANCEL_REASON_LABEL,
  ENVIRONMENT_LABEL,
  FISCAL_STATUS_LABEL,
  FISCAL_STATUS_TONE,
  PENDING_STATUSES,
  fileUrl,
  issOf,
  netOf,
  serviceItemLabel,
} from "@/components/invoices/fiscal-meta"
import { refreshInvoiceAction, type FiscalSettingsView, type InvoiceView } from "@/lib/fiscal/actions"
import { openWhatsapp } from "@/lib/browser"
import { useClient } from "@/lib/data"
import { formatDate, formatDateTime, formatMoney, maskCep, maskDocument, whatsappLink } from "@/lib/format"

interface InvoiceDrawerProps {
  invoice: InvoiceView | null
  onOpenChange: (open: boolean) => void
  settings: FiscalSettingsView
  onChange: (invoice: InvoiceView) => void
}

export function InvoiceDrawer({ invoice, onOpenChange, settings, onChange }: InvoiceDrawerProps) {
  const client = useClient(invoice?.clientId ?? undefined)
  const [cancelOpen, setCancelOpen] = useState(false)
  const [fixOpen, setFixOpen] = useState(false)
  const [refreshing, startRefresh] = useTransition()

  if (!invoice) return null
  const t = invoice.tomador
  const label = invoice.number ? `NFS-e ${invoice.number}` : "NFS-e sem número"
  const iss = issOf(invoice)
  const net = netOf(invoice)
  const r = invoice.retentions ?? {}
  const pending = PENDING_STATUSES.includes(invoice.status)
  const phone = t.phone || client?.whatsapp
  const a = t.address
  const warnings = invoice.warnings ?? []

  const refresh = () =>
    startRefresh(async () => {
      try {
        const res = await refreshInvoiceAction(invoice.id)
        if (res.invoice) onChange(res.invoice)
        if (!res.ok) toast.error(res.error ?? "Não foi possível consultar a prefeitura")
        else if (res.invoice && res.invoice.status === invoice.status) toast.info("Ainda em processamento na prefeitura")
        else if (res.invoice) toast.success(`Status: ${FISCAL_STATUS_LABEL[res.invoice.status]}`)
      } catch {
        toast.error("Não foi possível falar com o servidor. Tente de novo.")
      }
    })

  const sendWhatsapp = () => {
    if (!phone) return
    const first = (client?.contactName || t.name).split(" ")[0]
    const text = `Olá, ${first}! Segue a ${label} da ${settings.municipalityName ? `prefeitura de ${settings.municipalityName}` : "prefeitura"}, no valor de ${formatMoney(invoice.amount)}. Código de verificação: ${invoice.verificationCode ?? "—"}.`
    openWhatsapp(whatsappLink(phone, text))
  }

  const retentionRows = (
    [
      ["IR", r.ir],
      ["PIS", r.pis],
      ["COFINS", r.cofins],
      ["CSLL", r.csll],
      ["INSS", r.inss],
    ] as const
  ).filter(([, val]) => (val ?? 0) > 0)

  return (
    <>
      <EntityDrawer
        open
        onOpenChange={onOpenChange}
        title={label}
        badge={
          <>
            <EnumBadge value={invoice.status} labels={FISCAL_STATUS_LABEL} tones={FISCAL_STATUS_TONE} />
            {invoice.environment === "homologacao" && <StatusBadge tone="warning">Homologação</StatusBadge>}
          </>
        }
        description={t.name}
        footer={
          <>
            {pending && (
              <Button variant="outline" onClick={refresh} disabled={refreshing}>
                {refreshing ? <Loader2 className="animate-spin" /> : <RefreshCw />}
                Atualizar status
              </Button>
            )}
            {invoice.status === "emitida" && (
              <Button variant="destructive" onClick={() => setCancelOpen(true)}>
                <Ban />
                Cancelar nota
              </Button>
            )}
            {invoice.status === "rejeitada" && (
              <Button onClick={() => setFixOpen(true)} disabled={!settings.connected}>
                <RotateCcw />
                Corrigir e reenviar
              </Button>
            )}
            {invoice.status === "emitida" && (
              <Button onClick={sendWhatsapp} disabled={!phone} title={phone ? undefined : "Tomador sem telefone cadastrado"}>
                <MessageCircle />
                Enviar no WhatsApp
              </Button>
            )}
          </>
        }
      >
        <div className="space-y-5">
          {invoice.status === "rejeitada" && (
            <Alert tone="danger" title="Nota rejeitada">
              <span className="num">{invoice.errorMessage ?? "A prefeitura não devolveu o motivo. Revise os dados e reenvie."}</span>
            </Alert>
          )}
          {invoice.status === "processando" && <Alert tone="info" title="Aguardando a prefeitura">O status é consultado sozinho a cada 10 segundos enquanto esta tela estiver aberta.</Alert>}
          {invoice.status === "cancelando" && <Alert tone="warning" title="Cancelamento em andamento">A prefeitura ainda está processando o pedido de cancelamento.</Alert>}
          {invoice.status === "cancelada" && (
            <Alert tone="neutral" title={`Cancelada${invoice.canceledAt ? ` em ${formatDateTime(invoice.canceledAt)}` : ""}`}>
              {invoice.cancelReasonCode ? `${CANCEL_REASON_LABEL[invoice.cancelReasonCode] ?? "Motivo"}: ` : ""}
              {invoice.cancelJustification ?? ""}
            </Alert>
          )}
          {warnings.length > 0 && (
            <Alert tone="warning" title="Avisos da prefeitura">
              <ul className="list-disc space-y-0.5 pl-4">
                {warnings.map((w, i) => (
                  <li key={i}>{w}</li>
                ))}
              </ul>
            </Alert>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-lg border bg-surface p-3">
              <p className="text-xs text-muted-foreground">Valor do serviço</p>
              <p className="num mt-1 text-lg font-semibold text-primary">{formatMoney(invoice.amount)}</p>
            </div>
            <div className="rounded-lg border bg-surface p-3">
              <p className="text-xs text-muted-foreground">Valor líquido</p>
              <p className="num mt-1 text-lg font-semibold">{formatMoney(net)}</p>
            </div>
          </div>

          {(invoice.hasPdf || invoice.hasXml) && (
            <div className="flex flex-wrap gap-2">
              {invoice.hasPdf && (
                <Button variant="outline" size="sm" asChild>
                  <a href={fileUrl(invoice.id, "pdf")} download>
                    <FileDown />
                    Baixar PDF
                  </a>
                </Button>
              )}
              {invoice.hasXml && (
                <Button variant="outline" size="sm" asChild>
                  <a href={fileUrl(invoice.id, "xml")} download>
                    <FileCode />
                    Baixar XML
                  </a>
                </Button>
              )}
            </div>
          )}

          <DrawerSection title="Nota">
            <InfoRow label="Número" mono>{invoice.number ?? "—"}</InfoRow>
            <InfoRow label="Código de verificação" mono>{invoice.verificationCode ?? "—"}</InfoRow>
            {invoice.accessKey && (
              <InfoRow label="Chave" mono>
                <span className="break-all">{invoice.accessKey}</span>
              </InfoRow>
            )}
            <InfoRow label="Protocolo" mono>{invoice.protocolo ?? "—"}</InfoRow>
            <InfoRow label="Lote" mono>{invoice.codLote ?? (invoice.lote != null ? String(invoice.lote) : "—")}</InfoRow>
            <InfoRow label="RPS" mono>{invoice.rpsNumber != null ? `${invoice.rpsSeries ?? ""} ${invoice.rpsNumber}`.trim() : "—"}</InfoRow>
            <InfoRow label="Ambiente">{ENVIRONMENT_LABEL[invoice.environment]}</InfoRow>
            <InfoRow label="Competência" mono>{formatDate(invoice.competenceDate)}</InfoRow>
            <InfoRow label="Emissão" mono>{invoice.issuedAt ? formatDateTime(invoice.issuedAt) : "—"}</InfoRow>
            <InfoRow label="Criada em" mono>{formatDateTime(invoice.createdAt)}</InfoRow>
          </DrawerSection>

          <DrawerSection title="Tomador">
            <InfoRow label="Nome">
              {client ? (
                <Link href={`/clientes/${client.id}`} className="hover:text-primary">
                  {t.name}
                </Link>
              ) : (
                t.name
              )}
            </InfoRow>
            <InfoRow label={t.documentType === "cnpj" ? "CNPJ" : "CPF"} mono>{maskDocument(t.document)}</InfoRow>
            {t.municipalRegistration && <InfoRow label="Inscrição municipal" mono>{t.municipalRegistration}</InfoRow>}
            {t.email && <InfoRow label="E-mail">{t.email}</InfoRow>}
            <InfoRow label="Endereço">
              {a.street}, {a.number}
              {a.complement ? ` · ${a.complement}` : ""} · {a.district} · {a.city}/{a.uf} · <span className="num">{maskCep(a.cep)}</span>
            </InfoRow>
            <InfoRow label="Código IBGE" mono>{a.ibgeCode}</InfoRow>
          </DrawerSection>

          <DrawerSection title="Serviço e impostos">
            <InfoRow label="Item LC 116">{serviceItemLabel(invoice.serviceItem)}</InfoRow>
            {invoice.municipalTaxCode && <InfoRow label="Tributação municipal" mono>{invoice.municipalTaxCode}</InfoRow>}
            {invoice.cnae && <InfoRow label="CNAE" mono>{invoice.cnae}</InfoRow>}
            {invoice.nbs && <InfoRow label="NBS" mono>{invoice.nbs}</InfoRow>}
            {invoice.values?.BaseCalculo != null && <InfoRow label="Base de cálculo" mono>{formatMoney(invoice.values.BaseCalculo)}</InfoRow>}
            <InfoRow label="Alíquota ISS" mono>{String(invoice.values?.Aliquota ?? invoice.issRate).replace(".", ",")}%</InfoRow>
            <InfoRow label="ISS" mono>
              {formatMoney(iss)}
              {invoice.issRetained ? " (retido)" : ""}
            </InfoRow>
            {retentionRows.map(([name, val]) => (
              <InfoRow key={name} label={`Retenção ${name}`} mono>
                {formatMoney(val ?? 0)}
              </InfoRow>
            ))}
            {!invoice.values && <p className="pt-1 text-xs text-muted-foreground">Valores estimados pela alíquota até a prefeitura devolver o cálculo.</p>}
          </DrawerSection>

          <div>
            <p className="mb-1.5 text-xs text-muted-foreground">Discriminação do serviço</p>
            <p className="rounded-lg border bg-surface p-3 text-sm whitespace-pre-wrap">{invoice.serviceDescription}</p>
          </div>
        </div>
      </EntityDrawer>
      {invoice.status === "emitida" && <CancelInvoiceDialog open={cancelOpen} onOpenChange={setCancelOpen} invoice={invoice} onSaved={onChange} />}
      {invoice.status === "rejeitada" && <InvoiceFormDialog open={fixOpen} onOpenChange={setFixOpen} settings={settings} invoice={invoice} onSaved={onChange} />}
    </>
  )
}

function DrawerSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <p className="mb-1 text-[10px] font-medium tracking-widest text-muted-foreground uppercase">{title}</p>
      <div className="divide-y">{children}</div>
    </section>
  )
}

const alertTone = {
  danger: { box: "border-[#4a1818] bg-danger-soft", title: "text-danger", Icon: TriangleAlert },
  warning: { box: "border-[#4a330b] bg-warning-soft", title: "text-warning", Icon: TriangleAlert },
  info: { box: "border-[#17305a] bg-info-soft", title: "text-info", Icon: Info },
  neutral: { box: "border-border bg-surface", title: "text-foreground", Icon: Info },
}

function Alert({ tone, title, children }: { tone: keyof typeof alertTone; title: string; children?: React.ReactNode }) {
  const s = alertTone[tone]
  return (
    <div className={`flex gap-3 rounded-lg border p-3 text-sm ${s.box}`}>
      <s.Icon className={`mt-0.5 size-4 shrink-0 ${s.title}`} aria-hidden />
      <div className="min-w-0">
        <p className={`font-medium ${s.title}`}>{title}</p>
        {children && <div className="mt-0.5 text-xs break-words text-muted-foreground">{children}</div>}
      </div>
    </div>
  )
}
