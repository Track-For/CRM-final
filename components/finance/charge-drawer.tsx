"use client"

import { useState, useTransition } from "react"
import Link from "next/link"
import { AlertTriangle, Ban, CheckCircle2, Copy, ExternalLink, FlaskConical, Loader2, MessageCircle, Receipt, RefreshCw } from "lucide-react"
import { toast } from "sonner"
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import { EntityDrawer } from "@/components/shared/entity-drawer"
import { InfoRow } from "@/components/shared/panel"
import { EnumBadge } from "@/components/shared/status-badge"
import { applyBoletoUpdate, chargeWhatsappUrl, isRegisteredBoleto, isUnregisteredBoleto, useChargeActions } from "@/components/finance/finance-actions"
import { ChangeChargeDateButton } from "@/components/finance/change-charge-date-button"
import { DeleteChargeButton } from "@/components/finance/delete-charge-button"
import { PixQr } from "@/components/finance/payment-visuals"
import { ReasonDialog } from "@/components/finance/reason-dialog"
import { InvoiceFormDialog } from "@/components/invoices/legacy/invoice-form-dialog"
import { refreshAsaasChargesAction } from "@/lib/boleto/import-actions"
import { getDatabase } from "@/lib/data/api"
import { useCrm } from "@/lib/data"
import { cancelBoletoAction, syncBoletoAction } from "@/lib/boleto/actions"
import { copyToClipboard, openWhatsapp } from "@/lib/browser"
import { CHARGE_STATUS_LABEL, CHARGE_STATUS_TONE, PAYMENT_METHOD_LABEL } from "@/lib/constants"
import { useClient, useEntity, useInvoices } from "@/lib/data"
import { useUiStore } from "@/lib/store/ui-store"
import { formatDate, formatMoney } from "@/lib/format"
import type { Charge } from "@/types"

function CopyRow({ label, value, copiedLabel }: { label: string; value: string; copiedLabel: string }) {
  return (
    <div className="space-y-1">
      <p className="text-xs text-muted-foreground">{label}</p>
      <div className="flex items-start gap-2">
        <p className="num min-w-0 flex-1 rounded-md border bg-surface p-2 text-xs break-all">{value}</p>
        <Button variant="outline" size="icon-sm" aria-label={`Copiar ${label.toLowerCase()}`} onClick={() => copyToClipboard(value, copiedLabel)}>
          <Copy />
        </Button>
      </div>
    </div>
  )
}

function RegisteredBoleto({ charge }: { charge: Charge }) {
  return (
    <section className="space-y-3 rounded-xl border p-4">
      <p className="text-sm font-semibold">Boleto</p>
      {charge.gatewayEnvironment === "sandbox" && (
        <p className="flex items-start gap-2 rounded-lg border border-[#4a330b] bg-warning-soft p-2 text-xs text-warning">
          <FlaskConical className="mt-0.5 size-3.5 shrink-0" aria-hidden />
          Sandbox (teste, sem valor)
        </p>
      )}
      {charge.digitableLine ? (
        <CopyRow label="Linha digitável" value={charge.digitableLine} copiedLabel="Linha digitável copiada" />
      ) : (
        <p className="rounded-md border bg-surface p-2 text-xs text-muted-foreground">A linha digitável ainda não chegou. Clique em Atualizar status ou use o link do boleto.</p>
      )}
      {charge.barcode && <CopyRow label="Código de barras" value={charge.barcode} copiedLabel="Código de barras copiado" />}
      {charge.nossoNumero && (
        <InfoRow label="Nosso número" mono>
          {charge.nossoNumero}
        </InfoRow>
      )}
      {(charge.bankSlipUrl || charge.invoiceUrl) && (
        <div className="grid gap-2 sm:grid-cols-2">
          {charge.bankSlipUrl && (
            <Button variant="outline" size="sm" asChild>
              <a href={charge.bankSlipUrl} target="_blank" rel="noopener noreferrer">
                <ExternalLink />
                Abrir boleto
              </a>
            </Button>
          )}
          {charge.invoiceUrl && (
            <Button variant="outline" size="sm" asChild>
              <a href={charge.invoiceUrl} target="_blank" rel="noopener noreferrer">
                <ExternalLink />
                Abrir fatura
              </a>
            </Button>
          )}
        </div>
      )}
    </section>
  )
}

/** Detalhe da cobrança: boleto, Pix copia e cola e ações. */
export function ChargeDrawer({ chargeId, onOpenChange }: { chargeId: string | null; onOpenChange: (open: boolean) => void }) {
  const charge = useEntity("charges", chargeId)
  const client = useClient(charge?.clientId)
  const invoices = useInvoices()
  const openQuickCreate = useUiStore(state => state.openQuickCreate)
  const { markPaid, cancel } = useChargeActions()
  const [cancelOpen, setCancelOpen] = useState(false)
  const [cancelBoletoOpen, setCancelBoletoOpen] = useState(false)
  const [invoiceOpen, setInvoiceOpen] = useState(false)
  const [syncing, startSync] = useTransition()
  const [canceling, startCancel] = useTransition()

  if (!charge || charge.deletedAt) return null
  const open = charge.status === "pendente" || charge.status === "vencido"
  const invoice = invoices.find((i) => i.chargeId === charge.id && i.status !== "cancelada")
  const registered = isRegisteredBoleto(charge)
  const unregistered = isUnregisteredBoleto(charge)
  const managed = !!charge.gatewayId || charge.importedFromAsaas

  const sync = () =>
    startSync(async () => {
      try {
        if (charge.importedFromAsaas) {
          const result = await refreshAsaasChargesAction()
          if (!result.ok) { toast.error(result.error); return }
          useCrm.setState(await getDatabase())
          toast.success("Cobranças atualizadas pelo Asaas")
          return
        }
        const res = await syncBoletoAction(charge.id)
        if (res.ok && res.charge) {
          applyBoletoUpdate(res.charge)
          toast.success("Status atualizado", { description: CHARGE_STATUS_LABEL[res.charge.status] })
        } else toast.error(res.error ?? "Não foi possível atualizar o status")
      } catch {
        toast.error("Não foi possível falar com o servidor. Tente de novo.")
      }
    })

  const cancelBoleto = () =>
    startCancel(async () => {
      try {
        const res = await cancelBoletoAction(charge.id)
        // Na recusa por pagamento recente o servidor também devolve a cobrança, já como paga.
        if (res.charge) {
          applyBoletoUpdate(res.charge)
          setCancelBoletoOpen(false)
        }
        if (res.ok) toast.success(`${charge.number} cancelada`, { description: "O boleto deixou de valer no Asaas" })
        else toast.error(res.error ?? "Não foi possível cancelar o boleto")
      } catch {
        toast.error("Não foi possível falar com o servidor. Tente de novo.")
      }
    })

  return (
    <>
      <EntityDrawer
        open={Boolean(chargeId)}
        onOpenChange={onOpenChange}
        title={<span className="num">{charge.number}</span>}
        badge={<EnumBadge value={charge.status} labels={CHARGE_STATUS_LABEL} tones={CHARGE_STATUS_TONE} />}
        description={charge.description}
        footer={
          <>
            <DeleteChargeButton charge={charge} onDeleted={() => onOpenChange(false)} />
            {open && !charge.gatewayId && charge.method === "asaas" && <Button onClick={() => { onOpenChange(false); openQuickCreate("charge", { chargeId: charge.id, clientId: charge.clientId, dealId: charge.dealId, subscriptionId: charge.subscriptionId, milestoneId: charge.milestoneId, amount: String(charge.amount), description: charge.description, method: "asaas", dueDate: charge.dueDate }) }}>Emitir e enviar pelo Asaas</Button>}
            {open && !managed && (
              <Button variant="destructive" onClick={() => setCancelOpen(true)}>
                <Ban />
                Cancelar
              </Button>
            )}
            {open && registered && !charge.importedFromAsaas && (
              <Button variant="destructive" onClick={() => setCancelBoletoOpen(true)} disabled={canceling || syncing}>
                <Ban />
                Cancelar boleto
              </Button>
            )}
            {charge.status === "pago" && !invoice && (
              <Button variant="outline" onClick={() => setInvoiceOpen(true)}>
                <Receipt />
                Emitir NF
              </Button>
            )}
            {open && !managed && (
              <Button variant="outline" onClick={() => markPaid(charge)}>
                <CheckCircle2 />
                Marcar como pago
              </Button>
            )}
            {managed && charge.status !== "cancelado" && (
              <Button variant="outline" onClick={sync} disabled={syncing || canceling} aria-busy={syncing}>
                {syncing ? <Loader2 className="animate-spin" /> : <RefreshCw />}
                {syncing ? "Atualizando..." : "Atualizar status"}
              </Button>
            )}
            {open && !unregistered && (
              <Button onClick={() => openWhatsapp(chargeWhatsappUrl(charge, client))}>
                <MessageCircle />
                Enviar no WhatsApp
              </Button>
            )}
          </>
        }
      >
        <div className="space-y-5">
          {charge.gatewayId && <section className="space-y-2 rounded-xl border p-3 text-sm">
            <p>Dados sincronizados do Asaas. Pagamentos e cancelamentos são atualizados pela plataforma.</p>
            {!registered && charge.invoiceUrl && <Button variant="outline" size="sm" asChild><a href={charge.invoiceUrl} target="_blank" rel="noopener noreferrer"><ExternalLink />Abrir fatura no Asaas</a></Button>}
          </section>}
          <div className="grid grid-cols-2 gap-3">
            <div className="min-w-0 rounded-lg border bg-surface p-3">
              <p className="text-xs text-muted-foreground">Valor</p>
              <p className="num mt-1 text-base font-semibold break-words text-primary sm:text-xl">{formatMoney(charge.amount)}</p>
            </div>
            <div className="min-w-0 rounded-lg border bg-surface p-3">
              <p className="text-xs text-muted-foreground">Vencimento</p>
              <p className={charge.status === "vencido" ? "num mt-1 text-base font-semibold text-danger sm:text-xl" : "num mt-1 text-base font-semibold sm:text-xl"}>{charge.dueDate ? formatDate(charge.dueDate) : "A definir"}</p>
              <div className="mt-2"><ChangeChargeDateButton key={charge.id} charge={charge} /></div>
            </div>
          </div>

          <div>
            <InfoRow label="Cliente">
              {client ? (
                <Link href={`/clientes/${client.id}`} className="hover:text-primary">
                  {client.name}
                </Link>
              ) : (
                "—"
              )}
            </InfoRow>
            <InfoRow label="CPF/CNPJ" mono>{client?.document ?? "—"}</InfoRow>
            <InfoRow label="Forma de pagamento">{PAYMENT_METHOD_LABEL[charge.method]}</InfoRow>
            <InfoRow label="Parcela" mono>{charge.installment}/{charge.installments}</InfoRow>
            <InfoRow label="Pago em" mono>{formatDate(charge.paidAt)}</InfoRow>
            <InfoRow label="Nota fiscal" mono>{invoice ? (invoice.number ? `NFS-e ${invoice.number}` : "Processando") : "—"}</InfoRow>
          </div>

          {charge.status !== "cancelado" && (
            <>
              {registered && <RegisteredBoleto charge={charge} />}

              {unregistered && (
                <section className="flex items-start gap-3 rounded-xl border p-4">
                  <AlertTriangle className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
                  <div>
                    <p className="text-sm font-semibold">Boleto não registrado</p>
                    <p className="mt-1 text-xs text-muted-foreground">Esta cobrança não passou pelo Asaas e não tem linha digitável válida. Para cobrar o cliente, emita um novo boleto.</p>
                  </div>
                </section>
              )}

              {charge.method === "pix" && charge.pixKey && <CopyRow label="Chave Pix" value={charge.pixKey} copiedLabel="Chave Pix copiada" />}
              {charge.method === "pix" && charge.pixCode && (
                <section className="space-y-3 rounded-xl border p-4">
                  <p className="text-sm font-semibold">Pix</p>
                  <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-start">
                    <PixQr value={charge.pixCode} size={140} />
                    <div className="w-full min-w-0 flex-1 space-y-2">
                      <p className="text-xs text-muted-foreground">Pix copia e cola</p>
                      <p className="num line-clamp-4 rounded-md border bg-surface p-2 text-[11px] break-all">{charge.pixCode}</p>
                      <Button variant="outline" size="sm" className="w-full" onClick={() => copyToClipboard(charge.pixCode, "Código Pix copiado")}>
                        <Copy />
                        Copiar código Pix
                      </Button>
                    </div>
                  </div>
                </section>
              )}
            </>
          )}
        </div>
      </EntityDrawer>
      <ReasonDialog
        open={cancelOpen}
        onOpenChange={setCancelOpen}
        title={`Cancelar ${charge.number}`}
        description="O boleto e o Pix deixam de valer. O lançamento vinculado é removido."
        label="Motivo do cancelamento"
        confirmLabel="Cancelar cobrança"
        onConfirm={() => cancel(charge)}
      />
      <AlertDialog open={cancelBoletoOpen} onOpenChange={(o) => !canceling && setCancelBoletoOpen(o)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancelar o boleto {charge.number}?</AlertDialogTitle>
            <AlertDialogDescription>O boleto é apagado no Asaas e deixa de poder ser pago. O lançamento vinculado é removido. Isso não é estorno: um boleto já pago só pode ser estornado pelo painel do Asaas.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={canceling}>Voltar</AlertDialogCancel>
            <Button variant="destructive" onClick={cancelBoleto} disabled={canceling} aria-busy={canceling}>
              {canceling ? <Loader2 className="animate-spin" /> : <Ban />}
              Cancelar boleto
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <InvoiceFormDialog
        open={invoiceOpen}
        onOpenChange={setInvoiceOpen}
        defaults={{ clientId: charge.clientId, chargeId: charge.id, amount: charge.amount, description: charge.description }}
      />
    </>
  )
}
