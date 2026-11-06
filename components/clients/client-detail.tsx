"use client"

import { useMemo, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { ProjectExecutionDrawer } from "@/components/projects/project-execution-drawer"
import { projectProgress } from "@/lib/projects/plan"
import { Progress } from "@/components/ui/progress"
import { DeleteClientButton } from "@/components/clients/delete-client-button"
import { CheckSquare, FileSignature, MessageCircle, Pencil, Plus, Receipt, Repeat, Users, Wallet } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { EmptyState } from "@/components/shared/empty-state"
import { PageHeader } from "@/components/shared/page-header"
import { InfoRow, Panel } from "@/components/shared/panel"
import { StatCard, StatGrid } from "@/components/shared/stat-card"
import { EnumBadge, StatusBadge } from "@/components/shared/status-badge"
import { UserAvatar } from "@/components/shared/user-avatar"
import { ClientFormDialog } from "@/components/clients/client-form-dialog"
import { AsaasSyncButton } from "@/components/finance/asaas-sync-button"
import { ChargeDrawer } from "@/components/finance/charge-drawer"
import { ChargeTable } from "@/components/finance/charge-table"
import { SubscriptionFormDialog } from "@/components/finance/subscription-form-dialog"
import { useRelatedInvoices } from "@/components/invoices/related-invoices"
import { InvoiceDrawer } from "@/components/invoices/legacy/invoice-drawer"
import { InvoiceFormDialog } from "@/components/invoices/legacy/invoice-form-dialog"
import { openWhatsapp } from "@/lib/browser"
import {
  INVOICE_STATUS_LABEL,
  INVOICE_STATUS_TONE,
  PAYMENT_METHOD_LABEL,
  PROJECT_STATUS_LABEL,
  PROJECT_STATUS_TONE,
  PROJECT_TYPE_LABEL,
  SUBSCRIPTION_STATUS_LABEL,
  SUBSCRIPTION_STATUS_TONE,
} from "@/lib/constants"
import { useCharges, useClient, useContracts, useDeals, useInvoices, useLead, useProjects, useSubscriptions } from "@/lib/data"
import { clientSummary } from "@/lib/data/client-summary"
import { daysUntil, formatDate, formatDays, formatMoney, whatsappLink } from "@/lib/format"
import { useUiStore } from "@/lib/store/ui-store"
import { MonthlyBilling } from "@/components/clients/monthly-billing"
import { PaymentPlanDialog } from "@/components/clients/payment-plan-dialog"
import type { Contract } from "@/types"

const CONTRACT_STATUS: Record<Contract["status"], { label: string; tone: "warning" | "success" | "neutral" }> = {
  aguardando_assinatura: { label: "Aguardando assinatura", tone: "warning" },
  vigente: { label: "Vigente", tone: "success" },
  encerrado: { label: "Encerrado", tone: "neutral" },
}

export function ClientDetail({ id }: { id: string }) {
  const router = useRouter()
  const client = useClient(id)
  const lead = useLead(client?.leadId)
  const allProjects = useProjects()
  const allDeals = useDeals()
  const allSubs = useSubscriptions()
  const allCharges = useCharges()
  const allInvoices = useInvoices()
  const allContracts = useContracts()
  const role = useUiStore((s) => s.role)
  const canFinance = role === "admin" || role === "financeiro"
  useRelatedInvoices(canFinance)
  const openQuickCreate = useUiStore((s) => s.openQuickCreate)
  const [editOpen, setEditOpen] = useState(false)
  const [subOpen, setSubOpen] = useState(false)
  const [invoiceOpen, setInvoiceOpen] = useState(false)
  const [chargeId, setChargeId] = useState<string | null>(null)
  const [invoiceId, setInvoiceId] = useState<string | null>(null)
  const [planDealId, setPlanDealId] = useState<string | null>(null)
  const [dismissedPlanId, setDismissedPlanId] = useState<string | null>(null)
  const missingPlanDeal = allDeals.find(deal => deal.stage === "ganho" && !deal.paymentPlan && (deal.clientId === id || (!!client?.leadId && deal.leadId === client.leadId)))
  const [tab, setTab] = useState("projetos")
  const [projectId, setProjectId] = useState<string | null>(null)

  const data = useMemo(() => {
    const summary = client ? clientSummary(client, allDeals, allProjects, allSubs, allCharges) : { projects: [], subscriptions: [], charges: [], paid: 0, open: 0, unbilled: 0, monthly: 0, monthlyFromDeals: false }
    const { charges } = summary
    const invoices = allInvoices.filter((i) => i.clientId === id).sort((a, b) => b.issuedAt.localeCompare(a.issuedAt))
    const contracts = allContracts.filter((c) => c.clientId === id)
    return {
      ...summary,
      invoices,
      contracts,
      overdue: charges.filter((c) => c.status === "vencido").length,
    }
  }, [id, client, allDeals, allProjects, allSubs, allCharges, allInvoices, allContracts])

  if (!client || client.deletedAt) {
    return (
      <EmptyState
        icon={Users}
        title="Cliente não encontrado"
        description="O cliente pode ter sido removido."
        action={
          <Button asChild size="sm" variant="outline">
            <Link href="/clientes">Voltar para clientes</Link>
          </Button>
        }
        className="mt-10"
      />
    )
  }

  const a = client.address
  const message = `Olá, ${client.contactName.split(" ")[0]}! Aqui é da Track For.`

  return (
    <>
      <ProjectExecutionDrawer clientId={id} projectId={projectId} onOpenChange={open => { if (!open) setProjectId(null) }} onBilling={() => { setProjectId(null); setTab("cobrancas") }} />
      <PageHeader
        backHref="/clientes"
        backLabel="Clientes"
        title={
          <span className="flex items-center gap-2">
            {client.name}
            <StatusBadge tone={client.status === "ativo" ? "success" : "neutral"}>{client.status === "ativo" ? "Ativo" : "Inativo"}</StatusBadge>
          </span>
        }
        description={
          <span>
            {client.legalName} · <span className="num">{client.document}</span>
          </span>
        }
        actions={
          <>
            <Button variant="outline" onClick={() => setEditOpen(true)}>
              <Pencil />
              Editar
            </Button>
            <Button variant="outline" onClick={() => openQuickCreate("task", { clientId: client.id })}>
              <CheckSquare />
              Tarefa
            </Button>
            {canFinance && <DeleteClientButton client={client} onDeleted={() => router.push("/clientes")} />}
            <Button onClick={() => openWhatsapp(whatsappLink(client.whatsapp, message))}>
              <MessageCircle />
              WhatsApp
            </Button>
          </>
        }
      />

      <div className="space-y-4">
        <StatGrid>
          <StatCard label="Projetos" value={data.projects.length} icon={FileSignature} hint={`${data.projects.filter((p) => p.status === "em_andamento").length} em andamento`} />
          <StatCard label="Mensalidade" value={formatMoney(data.monthly)} icon={Repeat} highlight hint={data.monthlyFromDeals ? "Valor contratado nos negócios ganhos" : `${data.subscriptions.filter((s) => s.status === "ativa").length} ativa(s)`} />
          <StatCard label="Total pago" value={formatMoney(data.paid)} icon={Receipt} hint={<>{data.charges.filter((c) => c.status === "pago").length} cobrança(s){canFinance && <Button variant="link" size="sm" className="h-auto p-0 ml-2" onClick={() => setTab("cobrancas")}>Registrar pagamento</Button>}</>} />
          <StatCard label="Em aberto" value={formatMoney(data.open)} icon={Wallet} hint={<>{data.unbilled > 0 ? `${formatMoney(data.unbilled)} ainda sem cobrança vinculada` : data.overdue ? `${data.overdue} vencida(s)` : "Sem atrasos"}{canFinance && <Button variant="link" size="sm" className="h-auto p-0 ml-2" onClick={() => setTab("cobrancas")}>Ver cobranças</Button>}</>} className={data.overdue ? "border-[#4a1818]" : undefined} />
        </StatGrid>

        <div className="grid gap-4 xl:grid-cols-[360px_1fr]">
          <div className="space-y-4">
            <Panel title="Dados fiscais e de cobrança" actions={<Button variant="ghost" size="icon-sm" aria-label="Editar dados" onClick={() => setEditOpen(true)}><Pencil /></Button>}>
              <InfoRow label="Razão social">{client.legalName}</InfoRow>
              <InfoRow label={client.documentType === "cnpj" ? "CNPJ" : "CPF"} mono>{client.document}</InfoRow>
              <InfoRow label="Inscrição municipal" mono>{client.municipalRegistration ?? "—"}</InfoRow>
              <InfoRow label="Endereço">
                {a.street}, {a.number}
                {a.complement ? ` — ${a.complement}` : ""}
                <br />
                {a.district}, {a.city}/{a.state}
              </InfoRow>
              <InfoRow label="CEP" mono>{a.zip}</InfoRow>
            </Panel>
            <Panel title="Contato">
              <InfoRow label="Nome">{client.contactName}</InfoRow>
              <InfoRow label="WhatsApp" mono>{client.whatsapp}</InfoRow>
              <InfoRow label="E-mail">{client.email || "—"}</InfoRow>
              <InfoRow label="Responsável">
                <UserAvatar userId={client.ownerId} showName />
              </InfoRow>
              <InfoRow label="Cliente desde" mono>{formatDate(client.createdAt)}</InfoRow>
              {lead && (
                <InfoRow label="Lead de origem">
                  <Link href={`/leads/${lead.id}`} className="text-primary hover:underline">
                    {lead.name}
                  </Link>
                </InfoRow>
              )}
            </Panel>
          </div>

          <Tabs value={tab} onValueChange={setTab} className="min-w-0">
            <TabsList className="w-full justify-start overflow-x-auto sm:w-fit">
              <TabsTrigger value="projetos">Projetos</TabsTrigger>
              <TabsTrigger value="mensalidades">Mensalidades</TabsTrigger>
              {canFinance && <TabsTrigger value="cobrancas">Cobranças</TabsTrigger>}
              {canFinance && <TabsTrigger value="notas">Notas fiscais</TabsTrigger>}
              <TabsTrigger value="contratos">Contratos</TabsTrigger>
            </TabsList>

            <TabsContent value="projetos" className="mt-3 space-y-2">
              {data.projects.length === 0 ? (
                <EmptyState title="Nenhum projeto" compact />
              ) : (
                data.projects.map((p) => {
                  const days = daysUntil(p.deliveryDate)
                  return (
                    <div key={p.id} className="flex flex-col gap-2 rounded-xl border bg-card p-4 sm:flex-row sm:items-center">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <button type="button" className="text-left font-medium hover:text-primary hover:underline" onClick={() => setProjectId(p.id)}>{p.name}</button>
                          <EnumBadge value={p.status} labels={PROJECT_STATUS_LABEL} tones={PROJECT_STATUS_TONE} />
                        </div>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          {PROJECT_TYPE_LABEL[p.projectType]} · início <span className="num">{formatDate(p.startDate)}</span> · entrega <span className="num">{p.deliveryDate ? formatDate(p.deliveryDate) : "A definir"}</span>
                          {p.deliveryDate && p.status !== "entregue" && days >= 0 && ` (em ${formatDays(days)})`}
                          {p.deliveryDate && p.status !== "entregue" && days < 0 && <span className="text-danger"> (atrasado {formatDays(-days)})</span>}
                        </p>
                        {p.stages?.length ? <div className="mt-3 max-w-sm space-y-1.5"><p className="text-xs text-muted-foreground">{projectProgress(p.stages).done}/{p.stages.length} etapas concluídas · {projectProgress(p.stages).percent}%</p><Progress value={projectProgress(p.stages).percent} aria-label={`Progresso de ${p.name}`} /></div> : <p className="mt-2 text-xs text-muted-foreground">Abra o projeto para definir as etapas de execução.</p>}
                      </div>
                      <div className="flex items-center gap-3 sm:flex-col sm:items-end">
                        <span className="num font-semibold">{formatMoney(p.value)}</span>
                        <Button variant="outline" size="sm" onClick={() => setProjectId(p.id)}>Acompanhar projeto</Button>
                      </div>
                      {p.dealId && (
                        <Button asChild variant="ghost" size="xs">
                          <Link href={`/vendas/${p.dealId}`}>Ver negócio</Link>
                        </Button>
                      )}
                    </div>
                  )
                })
              )}
            </TabsContent>

            <TabsContent value="mensalidades" className="mt-3 space-y-2">
              <div className="flex justify-end">
                <Button size="sm" variant="outline" onClick={() => setSubOpen(true)}>
                  <Plus />
                  Nova mensalidade
                </Button>
              </div>
              {data.subscriptions.length === 0 ? (
                <EmptyState title="Sem mensalidades" description="Cadastre hospedagem, manutenção ou tráfego recorrente." compact />
              ) : (
                data.subscriptions.map((s) => (
                  <div key={s.id} className="flex flex-wrap items-center gap-3 rounded-xl border bg-card p-4">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-medium">{s.description}</p>
                        <EnumBadge value={s.status} labels={SUBSCRIPTION_STATUS_LABEL} tones={SUBSCRIPTION_STATUS_TONE} />
                      </div>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {PAYMENT_METHOD_LABEL[s.method]} · todo dia <span className="num">{s.billingDay}</span>
                        {s.status === "ativa" ? (
                          <>
                            {" "}
                            · próxima <span className="num">{formatDate(s.nextBillingDate)}</span>
                          </>
                        ) : s.cancelReason ? (
                          ` · ${s.cancelReason}`
                        ) : null}
                      </p>
                    </div>
                    <span className="num font-semibold">{formatMoney(s.amount)}/mês</span>
                  </div>
                ))
              )}
            </TabsContent>

            {canFinance && (
              <TabsContent value="cobrancas" className="mt-3">
                <div className="mb-3 space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm text-muted-foreground">Abra uma cobrança para registrar o pagamento. Cobranças do Asaas são atualizadas pela plataforma.</p>
                    <AsaasSyncButton />

                  </div>
                  {data.subscriptions.map(subscription => <MonthlyBilling key={subscription.id} subscription={subscription} onOpenCharge={setChargeId} />)}
                  {allDeals.filter(deal => deal.stage === "ganho" && (deal.clientId === id || (!!client.leadId && deal.leadId === client.leadId))).map(deal => <div key={deal.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3"><span className="text-sm">{deal.title}</span><Button size="sm" variant="outline" onClick={() => setPlanDealId(deal.id)}>{deal.paymentPlan ? "Editar plano de cobrança" : "Personalizar cobrança"}</Button></div>)}
                  {allDeals.filter(deal => (deal.clientId === id || (!!client.leadId && deal.leadId === client.leadId)) && deal.paymentPlan).map(deal => <div key={deal.id} className="space-y-3 rounded-lg border p-3">
                    <p className="font-medium">Pagamento por etapas · {deal.title} · {PAYMENT_METHOD_LABEL[deal.paymentPlan!.method]}</p>
                    {deal.paymentPlan!.method === "pix" && <p className="break-all text-sm text-muted-foreground">Chave Pix: {deal.paymentPlan!.pixKey}</p>}
                    {deal.paymentPlan!.milestones.map(milestone => {
                      const charge = data.charges.find(item => item.dealId === deal.id && item.milestoneId === milestone.id && item.status !== "cancelado")
                      return <div key={milestone.id} className="flex flex-wrap items-center justify-between gap-2">
                        <p className="text-sm">{milestone.label} · {milestone.percent}% · {formatMoney(milestone.amount)} · {milestone.dueDate ? formatDate(milestone.dueDate) : "Data a definir"}</p>
                        <Button size="sm" variant="outline" disabled={!charge} onClick={() => charge && setChargeId(charge.id)}>{charge ? "Abrir cobrança" : "Aguardando sincronização"}</Button>
                      </div>
                    })}
                  </div>)}

                </div>
                <ChargeTable charges={data.charges} onOpen={(c) => setChargeId(c.id)} hideClient pageSize={10} />
              </TabsContent>
            )}

            {canFinance && (
              <TabsContent value="notas" className="mt-3 space-y-2">
                <div className="flex justify-end">
                  <Button size="sm" variant="outline" onClick={() => setInvoiceOpen(true)}>
                    <Plus />
                    Emitir NFS-e
                  </Button>
                </div>
                {data.invoices.length === 0 ? (
                  <EmptyState title="Nenhuma nota fiscal" compact />
                ) : (
                  data.invoices.map((i) => (
                    <button key={i.id} type="button" onClick={() => setInvoiceId(i.id)} className="flex w-full flex-wrap items-center gap-3 rounded-xl border bg-card p-4 text-left hover:bg-accent">
                      <div className="min-w-0 flex-1">
                        <p className="num font-medium">{i.number ? `NFS-e ${i.number}` : "Sem número"}</p>
                        <p className="truncate text-xs text-muted-foreground">{i.serviceDescription}</p>
                      </div>
                      <span className="num text-xs text-muted-foreground">{formatDate(i.issuedAt)}</span>
                      <span className="num font-semibold">{formatMoney(i.amount)}</span>
                      <EnumBadge value={i.status} labels={INVOICE_STATUS_LABEL} tones={INVOICE_STATUS_TONE} />
                    </button>
                  ))
                )}
              </TabsContent>
            )}

            <TabsContent value="contratos" className="mt-3 space-y-2">
              {data.contracts.length === 0 ? (
                <EmptyState title="Nenhum contrato" compact />
              ) : (
                data.contracts.map((c) => (
                  <div key={c.id} className="flex flex-wrap items-center gap-3 rounded-xl border bg-card p-4">
                    <FileSignature className="size-5 text-muted-foreground" />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-medium">{c.title}</p>
                        <StatusBadge tone={CONTRACT_STATUS[c.status].tone}>{CONTRACT_STATUS[c.status].label}</StatusBadge>
                      </div>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        Vigência <span className="num">{formatDate(c.startDate)}</span> a <span className="num">{formatDate(c.endDate)}</span>
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="num font-semibold">{formatMoney(c.value)}</p>
                      {c.monthly > 0 && <p className="num text-xs text-muted-foreground">+ {formatMoney(c.monthly)}/mês</p>}
                    </div>
                  </div>
                ))
              )}
            </TabsContent>
          </Tabs>
        </div>
      </div>

      {canFinance && !planDealId && missingPlanDeal && dismissedPlanId !== missingPlanDeal.id && <PaymentPlanDialog key={missingPlanDeal.id} deal={missingPlanDeal} onClose={() => setDismissedPlanId(missingPlanDeal.id)} />}
      {planDealId && allDeals.find(deal => deal.id === planDealId) && <PaymentPlanDialog key={planDealId} deal={allDeals.find(deal => deal.id === planDealId)!} onClose={() => setPlanDealId(null)} />}
      <ClientFormDialog open={editOpen} onOpenChange={setEditOpen} client={client} />
      <SubscriptionFormDialog open={subOpen} onOpenChange={setSubOpen} clientId={client.id} />
      <InvoiceFormDialog open={invoiceOpen} onOpenChange={setInvoiceOpen} defaults={{ clientId: client.id }} />
      <ChargeDrawer chargeId={chargeId} onOpenChange={(o) => !o && setChargeId(null)} />
      <InvoiceDrawer invoiceId={invoiceId} onOpenChange={(o) => !o && setInvoiceId(null)} />
    </>
  )
}
