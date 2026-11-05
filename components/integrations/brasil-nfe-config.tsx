"use client"

import { useActionState, useState, useTransition } from "react"
import Link from "next/link"
import { ExternalLink, Eye, EyeOff, FlaskConical, Loader2, Receipt, Save, ShieldAlert, Unplug } from "lucide-react"
import { toast } from "sonner"
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
import { Switch } from "@/components/ui/switch"
import { FormMessage } from "@/components/auth/auth-ui"
import { FormField, FormGrid } from "@/components/shared/form-field"
import { OptionSelect } from "@/components/shared/option-select"
import { PageHeader } from "@/components/shared/page-header"
import { InfoRow, Panel } from "@/components/shared/panel"
import { StatusBadge } from "@/components/shared/status-badge"
import { HomologationBanner } from "@/components/invoices/fiscal-banners"
import { BRASIL_NFE_SIGNUP_URL, ENVIRONMENT_LABEL, OTHER_SERVICE_ITEM, SALVADOR_IBGE, SERVICE_ITEMS, UF_OPTIONS, formatServiceItem, normalizeText, serviceItemOptions } from "@/components/invoices/fiscal-meta"
import type { ActionState } from "@/lib/auth/actions"
import { disconnectFiscalAction, saveFiscalSettingsAction, testFiscalConnectionAction, type FiscalSettingsView } from "@/lib/fiscal/actions"
import { formatDateTime, formatRelative, onlyDigits } from "@/lib/format"
import { cn } from "@/lib/utils"

type Env = FiscalSettingsView["environment"]

const ENV_OPTIONS: { value: Env; label: string }[] = [
  { value: "homologacao", label: "Homologação (testes, sem valor fiscal)" },
  { value: "producao", label: "Produção (notas com valor fiscal)" },
]

const STEPS: React.ReactNode[] = [
  <>
    Crie a conta em{" "}
    <a href={BRASIL_NFE_SIGNUP_URL} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-0.5 text-primary hover:underline">
      api.brasilnfe.com.br <ExternalLink className="size-3" />
    </a>
    .
  </>,
  "No painel, cadastre a empresa prestadora: CNPJ, inscrição municipal e regime tributário.",
  "Envie o certificado digital A1 (arquivo .pfx e senha) da empresa.",
  "Copie o token da empresa e cole no campo Token ao lado.",
  "Salve, clique em Testar conexão e emita uma nota de teste em homologação.",
]

const rateText = (n: number) => String(n).replace(".", ",")

export function BrasilNfeConfig({ settings }: { settings: FiscalSettingsView }) {
  const initialItem = SERVICE_ITEMS.some((o) => o.value === settings.defaultServiceItem)
  const [token, setToken] = useState("")
  const [showToken, setShowToken] = useState(false)
  const [environment, setEnvironment] = useState<Env>(settings.environment)
  const [confirmProd, setConfirmProd] = useState(false)
  const [municipalityName, setMunicipalityName] = useState(settings.municipalityName)
  const [uf, setUf] = useState(settings.uf)
  const [municipalityCode, setMunicipalityCode] = useState(settings.municipalityCode)
  const [itemChoice, setItemChoice] = useState(initialItem ? settings.defaultServiceItem : OTHER_SERVICE_ITEM)
  const [itemCustom, setItemCustom] = useState(initialItem ? "" : settings.defaultServiceItem)
  const [municipalTaxCode, setMunicipalTaxCode] = useState(settings.defaultMunicipalTaxCode ?? "")
  const [cnae, setCnae] = useState(settings.defaultCnae ?? "")
  const [nbs, setNbs] = useState(settings.defaultNbs ?? "")
  const [issRate, setIssRate] = useState(rateText(settings.defaultIssRate))
  const [rpsSeries, setRpsSeries] = useState(settings.rpsSeries)
  const [nextRps, setNextRps] = useState(String(settings.nextRpsNumber))
  const [sendEmail, setSendEmail] = useState(settings.sendEmailToClient)

  const [state, formAction, saving] = useActionState(async (prev: ActionState, formData: FormData): Promise<ActionState> => {
    let res: ActionState
    try {
      res = await saveFiscalSettingsAction(prev, formData)
    } catch {
      res = { error: "Não foi possível falar com o servidor. Tente de novo." }
    }
    if (res.ok) {
      setToken("")
      setShowToken(false)
      toast.success(res.message ?? "Configurações salvas")
    }
    return res
  }, {})

  const [testing, startTest] = useTransition()
  const [disconnecting, startDisconnect] = useTransition()
  const [confirmDisconnect, setConfirmDisconnect] = useState(false)

  const test = () =>
    startTest(async () => {
      try {
        const res = await testFiscalConnectionAction()
        if (res.ok) toast.success(res.message ?? "Conexão funcionando")
        else toast.error(res.error ?? "Falha ao testar a conexão")
      } catch {
        toast.error("Não foi possível falar com o servidor. Tente de novo.")
      }
    })

  const disconnect = () =>
    startDisconnect(async () => {
      try {
        const res = await disconnectFiscalAction()
        if (res.ok) toast.success(res.message ?? "Brasil NFe desconectado")
        else toast.error(res.error ?? "Não foi possível desconectar")
      } catch {
        toast.error("Não foi possível falar com o servidor. Tente de novo.")
      }
      setConfirmDisconnect(false)
    })

  const changeEnvironment = (env: Env) => {
    if (env === "producao" && environment !== "producao") setConfirmProd(true)
    else setEnvironment(env)
  }

  const serviceItem = itemChoice === OTHER_SERVICE_ITEM ? onlyDigits(itemCustom) : itemChoice
  const goingToProduction = environment === "producao" && settings.environment !== "producao"

  return (
    <>
      <PageHeader
        backHref="/integracoes"
        backLabel="Integrações"
        title={
          <span className="inline-flex items-center gap-3">
            <span className="flex size-9 items-center justify-center rounded-lg border bg-surface">
              <Receipt className="size-4.5 text-primary" />
            </span>
            Brasil NFe
          </span>
        }
        description={
          <span className="inline-flex flex-wrap items-center gap-2">
            <StatusBadge tone={settings.connected ? "success" : "neutral"}>{settings.connected ? "Conectado" : "Desconectado"}</StatusBadge>
            <span>Fiscal</span>
            {settings.connected && <span>· {ENVIRONMENT_LABEL[settings.environment]}</span>}
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

      {settings.connected && settings.environment === "homologacao" && <HomologationBanner className="mb-6" />}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <form action={formAction} className="min-w-0 space-y-6" noValidate>
          <input type="hidden" name="environment" value={environment} />
          <input type="hidden" name="uf" value={uf} />
          <input type="hidden" name="defaultServiceItem" value={serviceItem} />
          {sendEmail && <input type="hidden" name="sendEmailToClient" value="on" />}

          {state.error && (
            <FormMessage id="fiscal-error" tone="error">
              {state.error}
            </FormMessage>
          )}

          <Panel title="Conexão" description="Notas fiscais de serviço (NFS-e) emitidas direto para a prefeitura, com PDF e XML guardados no CRM.">
            <FormGrid>
              <FormField
                label="Token da empresa"
                htmlFor="fiscal-token"
                required={!settings.connected}
                className="sm:col-span-2"
                hint={settings.connected ? `Token atual: •••• ${settings.tokenLast4 ?? "????"}. Deixe em branco para manter.` : "Fica guardado criptografado no servidor."}
              >
                <div className="flex items-center gap-1">
                  <Input
                    id="fiscal-token"
                    name="token"
                    type={showToken ? "text" : "password"}
                    className="num flex-1"
                    value={token}
                    onChange={(e) => setToken(e.target.value)}
                    placeholder={settings.connected ? `•••• ${settings.tokenLast4 ?? ""}  (manter atual)` : "Cole o token aqui"}
                    autoComplete="off"
                    spellCheck={false}
                  />
                  <Button type="button" variant="outline" size="icon" onClick={() => setShowToken((v) => !v)} aria-label={showToken ? "Ocultar token" : "Mostrar token"} aria-pressed={showToken}>
                    {showToken ? <EyeOff /> : <Eye />}
                  </Button>
                </div>
              </FormField>
              <FormField label="Ambiente" required htmlFor="fiscal-env" className="sm:col-span-2">
                <OptionSelect id="fiscal-env" value={environment} onChange={changeEnvironment} options={ENV_OPTIONS} />
              </FormField>
            </FormGrid>
            {environment === "producao" && (
              <div className="mt-4 flex items-start gap-3 rounded-lg border border-[#4a1818] bg-danger-soft p-3 text-sm">
                <ShieldAlert className="mt-0.5 size-4 shrink-0 text-danger" aria-hidden />
                <div>
                  <p className="font-medium text-danger">{goingToProduction ? "Ao salvar, as próximas notas terão valor fiscal" : "Emitindo em produção"}</p>
                  <p className="text-xs text-muted-foreground">Cada nota gera ISS a recolher e só some com cancelamento na prefeitura.</p>
                </div>
              </div>
            )}
          </Panel>

          <Panel title="Município do prestador" description="Onde a empresa está inscrita e o serviço é prestado.">
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-6">
              <FormField label="Município" required htmlFor="fiscal-city" className="col-span-2 sm:col-span-3">
                <Input
                  id="fiscal-city"
                  name="municipalityName"
                  value={municipalityName}
                  onChange={(e) => setMunicipalityName(e.target.value)}
                  onBlur={() => {
                    if (normalizeText(municipalityName) === "salvador" && !onlyDigits(municipalityCode)) setMunicipalityCode(SALVADOR_IBGE)
                  }}
                />
              </FormField>
              <FormField label="UF" required>
                <OptionSelect value={uf} onChange={setUf} options={UF_OPTIONS} placeholder="UF" />
              </FormField>
              <FormField label="Código IBGE" required htmlFor="fiscal-ibge" hint="7 dígitos. Salvador: 2927408" className="sm:col-span-2">
                <Input id="fiscal-ibge" name="municipalityCode" inputMode="numeric" className="num" maxLength={7} value={municipalityCode} onChange={(e) => setMunicipalityCode(onlyDigits(e.target.value).slice(0, 7))} />
              </FormField>
            </div>
          </Panel>

          <Panel title="Padrões da nota" description="Usados para pré-preencher cada emissão. Dá para mudar nota a nota.">
            <FormGrid>
              <FormField label="Item da LC 116" required className="sm:col-span-2">
                <OptionSelect value={itemChoice} onChange={setItemChoice} options={serviceItemOptions()} />
              </FormField>
              {itemChoice === OTHER_SERVICE_ITEM && (
                <FormField label="Código do item (6 dígitos)" required htmlFor="fiscal-item" hint={serviceItem.length === 6 ? `Item ${formatServiceItem(serviceItem)}` : "Ex.: 1.07 = 010701"} className="sm:col-span-2">
                  <Input id="fiscal-item" inputMode="numeric" className="num" maxLength={6} value={itemCustom} onChange={(e) => setItemCustom(onlyDigits(e.target.value).slice(0, 6))} placeholder="010701" />
                </FormField>
              )}
              <FormField label="Código de tributação municipal" htmlFor="fiscal-ctm" hint="Opcional, depende da prefeitura">
                <Input id="fiscal-ctm" name="defaultMunicipalTaxCode" className="num" value={municipalTaxCode} onChange={(e) => setMunicipalTaxCode(e.target.value)} />
              </FormField>
              <FormField label="Alíquota ISS (%)" required htmlFor="fiscal-iss" hint="Salvador: 2% a 5%, conforme o item">
                <Input id="fiscal-iss" name="defaultIssRate" inputMode="decimal" className="num" value={issRate} onChange={(e) => setIssRate(e.target.value.replace(/[^\d.,]/g, ""))} />
              </FormField>
              <FormField label="CNAE" htmlFor="fiscal-cnae" hint="Opcional">
                <Input id="fiscal-cnae" name="defaultCnae" inputMode="numeric" className="num" value={cnae} onChange={(e) => setCnae(e.target.value)} />
              </FormField>
              <FormField label="NBS" htmlFor="fiscal-nbs" hint="Opcional">
                <Input id="fiscal-nbs" name="defaultNbs" inputMode="numeric" className="num" value={nbs} onChange={(e) => setNbs(e.target.value)} />
              </FormField>
            </FormGrid>
          </Panel>

          <Panel title="Numeração e envio">
            <FormGrid>
              <FormField label="Série do RPS" required htmlFor="fiscal-serie">
                <Input id="fiscal-serie" name="rpsSeries" className="num" maxLength={5} value={rpsSeries} onChange={(e) => setRpsSeries(e.target.value.toUpperCase())} />
              </FormField>
              <FormField label="Próximo número do RPS" required htmlFor="fiscal-rps" hint="Continue de onde o sistema anterior parou">
                <Input id="fiscal-rps" name="nextRpsNumber" inputMode="numeric" className="num" value={nextRps} onChange={(e) => setNextRps(onlyDigits(e.target.value))} />
              </FormField>
            </FormGrid>
            <label className="mt-4 flex items-center justify-between gap-3 rounded-lg border bg-surface p-3 text-sm">
              <span>
                Enviar a nota por e-mail ao tomador
                <span className="block text-xs text-muted-foreground">Envio feito pelo próprio Brasil NFe para o e-mail informado na nota</span>
              </span>
              <Switch checked={sendEmail} onCheckedChange={setSendEmail} aria-label="Enviar a nota por e-mail ao tomador" />
            </label>
          </Panel>

          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-end">
            <p className="text-xs text-muted-foreground sm:mr-auto">{settings.updatedAt ? `Última alteração em ${formatDateTime(settings.updatedAt)}` : "Ainda não configurado"}</p>
            <Button type="submit" disabled={saving} aria-busy={saving} className="w-full sm:w-auto">
              {saving ? <Loader2 className="animate-spin" /> : <Save />}
              {saving ? "Salvando..." : "Salvar"}
            </Button>
          </div>
        </form>

        <div className="space-y-6">
          <Panel title="Status">
            <div className="divide-y">
              <InfoRow label="Conexão">
                <StatusBadge tone={settings.connected ? "success" : "neutral"}>{settings.connected ? "Conectado" : "Desconectado"}</StatusBadge>
              </InfoRow>
              <InfoRow label="Token" mono>
                {settings.connected ? `•••• ${settings.tokenLast4 ?? ""}` : "—"}
              </InfoRow>
              <InfoRow label="Ambiente">{ENVIRONMENT_LABEL[settings.environment]}</InfoRow>
              <InfoRow label="Próximo RPS" mono>
                {settings.rpsSeries} {settings.nextRpsNumber}
              </InfoRow>
              <InfoRow label="Município" mono>
                {settings.municipalityName}/{settings.uf} · {settings.municipalityCode}
              </InfoRow>
            </div>
            {settings.connected && (
              <Button variant="outline" size="sm" className="mt-3 w-full" asChild>
                <Link href="/notas-fiscais">Ir para Notas fiscais</Link>
              </Button>
            )}
          </Panel>

          <Panel title="Como obter o token" description="Leva poucos minutos. Tudo funciona em homologação antes de valer de verdade.">
            <ol className="space-y-3 text-sm">
              {STEPS.map((step, i) => (
                <li key={i} className="flex gap-3">
                  <span className={cn("num flex size-5 shrink-0 items-center justify-center rounded-full border text-[11px] font-medium", i === 0 ? "border-primary/35 bg-brand-soft text-primary" : "bg-surface text-muted-foreground")}>{i + 1}</span>
                  <span className="min-w-0 text-muted-foreground">{step}</span>
                </li>
              ))}
            </ol>
          </Panel>
        </div>
      </div>

      <AlertDialog open={confirmProd} onOpenChange={setConfirmProd}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Emitir em produção?</AlertDialogTitle>
            <AlertDialogDescription>
              Em produção as notas têm valor fiscal: geram ISS a recolher e só podem ser desfeitas por cancelamento na prefeitura. Confirme que o CNPJ, a inscrição municipal e o certificado A1 estão certos no painel do Brasil NFe e que uma nota de teste em homologação deu certo.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Continuar em homologação</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={() => setEnvironment("producao")}>
              Usar produção
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={confirmDisconnect} onOpenChange={(o) => !disconnecting && setConfirmDisconnect(o)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Desconectar o Brasil NFe?</AlertDialogTitle>
            <AlertDialogDescription>O token é apagado do CRM e não será possível emitir, consultar ou cancelar notas até colar um token de novo. As notas já emitidas continuam salvas.</AlertDialogDescription>
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
    </>
  )
}
