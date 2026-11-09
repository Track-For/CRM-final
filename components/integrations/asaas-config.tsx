"use client"

import { useActionState, useState, useTransition } from "react"
import { Copy, CreditCard, ExternalLink, Eye, EyeOff, FlaskConical, Loader2, RefreshCw, Save, ShieldAlert, Unplug } from "lucide-react"
import { toast } from "@/lib/store/save-feedback"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { FormMessage } from "@/components/auth/auth-ui"
import { FormField, FormGrid } from "@/components/shared/form-field"
import { OptionSelect } from "@/components/shared/option-select"
import { PageHeader } from "@/components/shared/page-header"
import { InfoRow, Panel } from "@/components/shared/panel"
import { StatusBadge } from "@/components/shared/status-badge"
import { SecretInput } from "@/components/integrations/secret-input"
import type { ActionState } from "@/lib/auth/actions"
import { disconnectBillingAction, regenerateWebhookTokenAction, saveBillingSettingsAction, testBillingConnectionAction, type BillingSettingsView } from "@/lib/boleto/actions"
import { copyToClipboard } from "@/lib/browser"
import { formatDateTime, formatRelative } from "@/lib/format"
import { cn } from "@/lib/utils"

type Env = BillingSettingsView["environment"]

const SANDBOX_URL = "https://sandbox.asaas.com/"

const ENV_LABEL: Record<Env, string> = { sandbox: "Sandbox (teste, sem valor)", producao: "Produção (boletos reais)" }
const ENV_OPTIONS: { value: Env; label: string }[] = [
  { value: "sandbox", label: ENV_LABEL.sandbox },
  { value: "producao", label: ENV_LABEL.producao },
]

const WEBHOOK_EVENTS = [
  "PAYMENT_CREATED",
  "PAYMENT_CONFIRMED",
  "PAYMENT_RECEIVED",
  "PAYMENT_OVERDUE",
  "PAYMENT_UPDATED",
  "PAYMENT_DELETED",
  "PAYMENT_RESTORED",
  "PAYMENT_REFUNDED",
  "PAYMENT_BANK_SLIP_CANCELLED",
]

const KEY_STEPS: React.ReactNode[] = [
  <>
    Para testar, crie uma conta em{" "}
    <a href={SANDBOX_URL} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-0.5 text-primary hover:underline">
      sandbox.asaas.com <ExternalLink className="size-3" />
    </a>
    . Ela é separada da conta de produção.
  </>,
  "No painel do Asaas, abra Integrações e gere uma chave de API.",
  "Cole a chave aqui e escolha o ambiente dela: $aact_hmlg_ é sandbox e $aact_prod_ é produção.",
  "Salve e clique em Testar conexão.",
  "A chave expira em 6 meses e é desativada depois de 3 meses sem uso. Quando isso acontecer, gere outra e cole aqui.",
]

const percentText = (n: number) => String(n).replace(".", ",")
const percentInput = (value: string) => value.replace(/[^\d.,]/g, "")
const percentValue = (value: string) => value.replace(",", ".")

function StepList({ steps }: { steps: React.ReactNode[] }) {
  return (
    <ol className="space-y-3 text-sm">
      {steps.map((step, i) => (
        <li key={i} className="flex gap-3">
          <span className={cn("num flex size-5 shrink-0 items-center justify-center rounded-full border text-[11px] font-medium", i === 0 ? "border-primary/35 bg-brand-soft text-primary" : "bg-surface text-muted-foreground")}>{i + 1}</span>
          <span className="min-w-0 break-words text-muted-foreground">{step}</span>
        </li>
      ))}
    </ol>
  )
}

export function AsaasConfig({ settings }: { settings: BillingSettingsView }) {
  const [apiKey, setApiKey] = useState("")
  const [showKey, setShowKey] = useState(false)
  const [environment, setEnvironment] = useState<Env>(settings.environment)
  const [confirmProd, setConfirmProd] = useState(false)
  const [fine, setFine] = useState(percentText(settings.finePercent))
  const [interest, setInterest] = useState(percentText(settings.interestPercent))
  const [confirmDisconnect, setConfirmDisconnect] = useState(false)
  const [confirmRegenerate, setConfirmRegenerate] = useState(false)

  const [state, formAction, saving] = useActionState(async (prev: ActionState, formData: FormData): Promise<ActionState> => {
    let res: ActionState
    try {
      res = await saveBillingSettingsAction(prev, formData)
    } catch {
      res = { error: "Não foi possível falar com o servidor. Tente de novo." }
    }
    if (res.ok) {
      setApiKey("")
      setShowKey(false)
      toast.success(res.message ?? "Configurações salvas")
    }
    return res
  }, {})

  const [testing, startTest] = useTransition()
  const [disconnecting, startDisconnect] = useTransition()
  const [regenerating, startRegenerate] = useTransition()

  const test = () =>
    startTest(async () => {
      try {
        const res = await testBillingConnectionAction()
        if (res.ok) toast.success(res.message ?? "Conexão funcionando")
        else toast.error(res.error ?? "Falha ao testar a conexão")
      } catch {
        toast.error("Não foi possível falar com o servidor. Tente de novo.")
      }
    })

  const disconnect = () =>
    startDisconnect(async () => {
      try {
        const res = await disconnectBillingAction()
        if (res.ok) toast.success(res.message ?? "Asaas desconectado")
        else toast.error(res.error ?? "Não foi possível desconectar")
      } catch {
        toast.error("Não foi possível falar com o servidor. Tente de novo.")
      }
      setConfirmDisconnect(false)
    })

  const regenerate = () =>
    startRegenerate(async () => {
      try {
        const res = await regenerateWebhookTokenAction()
        if (res.ok) toast.success(res.message ?? "Token regenerado")
        else toast.error(res.error ?? "Não foi possível regenerar o token")
      } catch {
        toast.error("Não foi possível falar com o servidor. Tente de novo.")
      }
      setConfirmRegenerate(false)
    })

  const changeEnvironment = (env: Env) => {
    if (env === "producao" && environment !== "producao") setConfirmProd(true)
    else setEnvironment(env)
  }

  const goingToProduction = environment === "producao" && settings.environment !== "producao"

  const webhookSteps: React.ReactNode[] = [
    "No painel do Asaas, abra Integrações e depois Webhooks, e adicione um novo.",
    "Cole a URL e o token mostrados acima. O token vai no campo de token de autenticação.",
    <>
      Marque os eventos de cobrança:
      <span className="mt-2 flex flex-wrap gap-1">
        {WEBHOOK_EVENTS.map((event) => (
          <code key={event} className="num rounded border bg-surface px-1.5 py-0.5 text-[11px] break-all text-foreground">
            {event}
          </code>
        ))}
      </span>
    </>,
    "Deixe o webhook ativo e salve. Cada ambiente do Asaas tem o seu cadastro: repita o passo ao trocar de sandbox para produção.",
  ]

  return (
    <>
      <PageHeader
        backHref="/integracoes"
        backLabel="Integrações"
        title={
          <span className="inline-flex items-center gap-3">
            <span className="flex size-9 items-center justify-center rounded-lg border bg-surface">
              <CreditCard className="size-4.5 text-primary" />
            </span>
            Asaas
          </span>
        }
        description={
          <span className="inline-flex flex-wrap items-center gap-2">
            <StatusBadge tone={settings.connected ? "success" : "neutral"}>{settings.connected ? "Conectado" : "Desconectado"}</StatusBadge>
            <span>Pagamentos</span>
            {settings.connected && <span>· {ENV_LABEL[settings.environment]}</span>}
            {settings.updatedAt && <span>· atualizado {formatRelative(settings.updatedAt)}</span>}
          </span>
        }
        actions={
          settings.connected && (
            <>
              <Button variant="outline" size="sm" onClick={test} disabled={testing}>
                {testing ? <Loader2 className="animate-spin" /> : <FlaskConical />}
                {testing ? "Testando..." : "Testar conexão"}
              </Button>
              <Button variant="outline" size="sm" onClick={() => setConfirmDisconnect(true)} disabled={disconnecting}>
                <Unplug /> Desconectar
              </Button>
            </>
          )
        }
      />

      {settings.connected && settings.environment === "sandbox" && (
        <div role="status" className="mb-6 flex items-start gap-3 rounded-xl border border-[#4a330b] bg-warning-soft p-3 text-sm">
          <FlaskConical className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden />
          <div className="min-w-0">
            <p className="font-medium text-warning">Sandbox (teste, sem valor)</p>
            <p className="text-xs text-muted-foreground">Os boletos saem no ambiente de testes do Asaas, e o pagamento é confirmado à mão no painel do sandbox. Troque para produção quando estiver tudo certo.</p>
          </div>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0 space-y-6">
          <form action={formAction} className="space-y-6" noValidate>
            <input type="hidden" name="environment" value={environment} />
            <input type="hidden" name="finePercent" value={percentValue(fine)} />
            <input type="hidden" name="interestPercent" value={percentValue(interest)} />

            {state.error && (
              <FormMessage id="asaas-error" tone="error">
                {state.error}
              </FormMessage>
            )}

            <Panel title="Conexão" description="Boletos registrados no Asaas, com baixa automática. Só o boleto passa pelo Asaas por enquanto: Pix e cartão seguem como estão.">
              <FormGrid>
                <FormField
                  label="Chave de API"
                  htmlFor="asaas-key"
                  required={!settings.connected}
                  className="sm:col-span-2"
                  hint={settings.connected ? `Chave atual: •••• ${settings.apiKeyLast4 ?? "????"}. Deixe em branco para manter.` : "Fica guardada criptografada no servidor."}
                >
                  <div className="flex items-center gap-1">
                    <Input
                      id="asaas-key"
                      name="apiKey"
                      type={showKey ? "text" : "password"}
                      className="num flex-1"
                      value={apiKey}
                      onChange={(e) => setApiKey(e.target.value)}
                      placeholder={settings.connected ? `•••• ${settings.apiKeyLast4 ?? ""}  (manter atual)` : "Cole a chave aqui"}
                      autoComplete="off"
                      spellCheck={false}
                    />
                    <Button type="button" variant="outline" size="icon" onClick={() => setShowKey((v) => !v)} aria-label={showKey ? "Ocultar chave" : "Mostrar chave"} aria-pressed={showKey}>
                      {showKey ? <EyeOff /> : <Eye />}
                    </Button>
                  </div>
                </FormField>
                <FormField label="Ambiente" required htmlFor="asaas-env" className="sm:col-span-2">
                  <OptionSelect id="asaas-env" value={environment} onChange={changeEnvironment} options={ENV_OPTIONS} />
                </FormField>
              </FormGrid>
              {environment === "producao" && (
                <div className="mt-4 flex items-start gap-3 rounded-lg border border-[#4a1818] bg-danger-soft p-3 text-sm">
                  <ShieldAlert className="mt-0.5 size-4 shrink-0 text-danger" aria-hidden />
                  <div>
                    <p className="font-medium text-danger">{goingToProduction ? "Ao salvar, os próximos boletos serão reais" : "Emitindo em produção"}</p>
                    <p className="text-xs text-muted-foreground">Cada boleto é registrado no banco e pode ser pago de verdade pelo cliente.</p>
                  </div>
                </div>
              )}
            </Panel>

            <Panel title="Multa e juros" description="Valem para os próximos boletos. Deixe 0 para não cobrar.">
              <FormGrid>
                <FormField label="Multa por atraso (%)" htmlFor="asaas-fine">
                  <Input id="asaas-fine" inputMode="decimal" className="num" value={fine} onChange={(e) => setFine(percentInput(e.target.value))} />
                </FormField>
                <FormField label="Juros ao mês (%)" htmlFor="asaas-interest">
                  <Input id="asaas-interest" inputMode="decimal" className="num" value={interest} onChange={(e) => setInterest(percentInput(e.target.value))} />
                </FormField>
              </FormGrid>
            </Panel>

            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-end">
              <p className="text-xs text-muted-foreground sm:mr-auto">{settings.updatedAt ? `Última alteração em ${formatDateTime(settings.updatedAt)}` : "Ainda não configurado"}</p>
              <Button type="submit" disabled={saving} aria-busy={saving} className="w-full sm:w-auto">
                {saving ? <Loader2 className="animate-spin" /> : <Save />}
                {saving ? "Salvando..." : "Salvar"}
              </Button>
            </div>
          </form>

          <Panel title="Webhook" description="É por aqui que o Asaas avisa o CRM quando um boleto é pago, vence ou é cancelado.">
            {settings.webhookUrl ? (
              <div className="space-y-4">
                <FormField label="URL do webhook" htmlFor="asaas-webhook-url">
                  <div className="flex items-center gap-1">
                    <Input id="asaas-webhook-url" className="num flex-1" value={settings.webhookUrl} readOnly />
                    <Button type="button" variant="outline" size="icon" onClick={() => copyToClipboard(settings.webhookUrl, "URL copiada")} aria-label="Copiar URL do webhook">
                      <Copy />
                    </Button>
                  </div>
                </FormField>
                <WebhookToken token={settings.webhookToken} regenerating={regenerating} onRegenerate={() => setConfirmRegenerate(true)} />
                <StepList steps={webhookSteps} />
              </div>
            ) : (
              <div className="space-y-4">
                <div className="rounded-lg border bg-surface p-3 text-sm">
                  <p className="font-medium">O webhook só funciona depois de publicar o CRM</p>
                  <p className="mt-1 text-xs text-muted-foreground">O Asaas precisa de um endereço público para avisar o CRM. Até lá, o status de cada boleto vem do botão Atualizar status, na cobrança.</p>
                </div>
                <WebhookToken token={settings.webhookToken} regenerating={regenerating} onRegenerate={() => setConfirmRegenerate(true)} />
              </div>
            )}
          </Panel>
        </div>

        <div className="min-w-0 space-y-6">
          <Panel title="Status">
            <div className="divide-y">
              <InfoRow label="Conexão">
                <StatusBadge tone={settings.connected ? "success" : "neutral"}>{settings.connected ? "Conectado" : "Desconectado"}</StatusBadge>
              </InfoRow>
              <InfoRow label="Chave" mono>
                {settings.connected ? `•••• ${settings.apiKeyLast4 ?? ""}` : "—"}
              </InfoRow>
              <InfoRow label="Ambiente">{ENV_LABEL[settings.environment]}</InfoRow>
              <InfoRow label="Multa" mono>
                {percentText(settings.finePercent)}%
              </InfoRow>
              <InfoRow label="Juros ao mês" mono>
                {percentText(settings.interestPercent)}%
              </InfoRow>
            </div>
          </Panel>

          <Panel title="Como obter a chave" description="Teste no sandbox antes de usar a conta de produção.">
            <StepList steps={KEY_STEPS} />
          </Panel>

          <Panel title="Envio ao cliente">
            <p className="text-sm text-muted-foreground">O cadastro do cliente é criado ou reutilizado pelo CPF/CNPJ. Ao emitir uma cobrança, o CRM habilita o aviso do Asaas por e-mail ou, na ausência dele, por SMS. O botão Enviar no WhatsApp continua disponível para envio manual.</p>
          </Panel>
        </div>
      </div>

      <AlertDialog open={confirmProd} onOpenChange={setConfirmProd}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Emitir em produção?</AlertDialogTitle>
            <AlertDialogDescription>Em produção os boletos são registrados no banco e podem ser pagos de verdade. A chave precisa ser da conta de produção, com prefixo $aact_prod_. Confirme que um boleto de teste no sandbox deu certo.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Continuar no sandbox</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={() => setEnvironment("producao")}>
              Usar produção
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={confirmDisconnect} onOpenChange={(o) => !disconnecting && setConfirmDisconnect(o)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Desconectar o Asaas?</AlertDialogTitle>
            <AlertDialogDescription>A chave é apagada do CRM e não será possível emitir, consultar ou cancelar boletos até colar uma chave de novo. Os boletos já emitidos continuam valendo no Asaas.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={disconnecting}>Voltar</AlertDialogCancel>
            <Button variant="destructive" onClick={disconnect} disabled={disconnecting}>
              {disconnecting ? <Loader2 className="animate-spin" /> : <Unplug />}
              Desconectar
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={confirmRegenerate} onOpenChange={(o) => !regenerating && setConfirmRegenerate(o)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Regenerar o token do webhook?</AlertDialogTitle>
            <AlertDialogDescription>O token atual para de valer na hora. Até colar o novo no painel do Asaas, os avisos dele serão recusados e o status só muda pelo botão Atualizar status.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={regenerating}>Voltar</AlertDialogCancel>
            <Button variant="destructive" onClick={regenerate} disabled={regenerating}>
              {regenerating ? <Loader2 className="animate-spin" /> : <RefreshCw />}
              Regenerar
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}

function WebhookToken({ token, regenerating, onRegenerate }: { token: string | null; regenerating: boolean; onRegenerate: () => void }) {
  if (!token) return <p className="text-xs text-muted-foreground">O token do webhook é gerado quando você salva a configuração.</p>
  return (
    <FormField label="Token de autenticação" htmlFor="asaas-webhook-token" hint={regenerating ? "Regenerando..." : undefined}>
      <SecretInput id="asaas-webhook-token" value={token} readOnly onRegenerate={onRegenerate} />
    </FormField>
  )
}
