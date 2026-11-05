"use client"

import { useActionState, useState, useTransition } from "react"
import { Check, Copy, KeyRound, Loader2, Mail, ShieldCheck, ShieldOff, Smartphone } from "lucide-react"
import { toast } from "sonner"
import {
  changePasswordAction,
  confirmTotpSetupAction,
  disableTotpAction,
  startTotpSetupAction,
  type ActionState,
} from "@/lib/auth/actions"
import { Button } from "@/components/ui/button"
import { Panel } from "@/components/shared/panel"
import { AuthField, FormMessage, OtpInput, PasswordInput } from "@/components/auth/auth-ui"

const initialState: ActionState = {}

function StatusPill({ active }: { active: boolean }) {
  return (
    <span
      className={
        active
          ? "inline-flex items-center gap-1 rounded-full border border-[#1c4a2c] bg-success-soft px-2 py-0.5 text-xs font-medium text-success"
          : "inline-flex items-center gap-1 rounded-full border bg-surface px-2 py-0.5 text-xs font-medium text-muted-foreground"
      }
    >
      {active ? <ShieldCheck className="size-3" aria-hidden /> : <ShieldOff className="size-3" aria-hidden />}
      {active ? "Ativo" : "Desativado"}
    </span>
  )
}

function groupSecret(secret: string) {
  return secret.replace(/(.{4})/g, "$1 ").trim()
}

function TotpSetup({ onEnabled, onCancel, secret, qrDataUrl }: { onEnabled: () => void; onCancel: () => void; secret: string; qrDataUrl: string }) {
  const [code, setCode] = useState("")
  const [copied, setCopied] = useState(false)
  const [state, formAction, pending] = useActionState(async (prev: ActionState, formData: FormData) => {
    const result = (await confirmTotpSetupAction(prev, formData)) ?? {}
    if (result.error) setCode("")
    else {
      toast.success(result.message ?? "Google Authenticator ativado")
      onEnabled()
    }
    return result
  }, initialState)

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(secret)
      setCopied(true)
      toast.success("Chave copiada")
      window.setTimeout(() => setCopied(false), 2000)
    } catch {
      toast.error("Não foi possível copiar. Selecione a chave manualmente.")
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <ol className="space-y-1 text-sm text-muted-foreground">
        <li>1. Abra o Google Authenticator e toque em adicionar.</li>
        <li>2. Escaneie o QR code ou digite a chave manualmente.</li>
        <li>3. Informe o código de 6 dígitos gerado pelo app.</li>
      </ol>
      <div className="flex flex-col items-start gap-4 sm:flex-row">
        <div className="shrink-0 rounded-lg bg-white p-2">
          {/* QR gerado no servidor como data URL; next/image não agrega aqui. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={qrDataUrl} alt="QR code para configurar o Google Authenticator" width={160} height={160} className="size-40" />
        </div>
        <div className="min-w-0 flex-1 space-y-1.5">
          <p className="text-xs text-muted-foreground">Chave para digitar manualmente</p>
          <div className="flex items-center gap-2 rounded-lg border bg-surface py-1.5 pr-1.5 pl-3">
            <code className="num min-w-0 flex-1 text-sm break-all select-all">{groupSecret(secret)}</code>
            <Button type="button" variant="ghost" size="icon-sm" onClick={copy} aria-label="Copiar chave">
              {copied ? <Check className="text-success" /> : <Copy />}
            </Button>
          </div>
        </div>
      </div>
      <form action={formAction} className="flex flex-col gap-3 sm:max-w-xs">
        {state.error && (
          <FormMessage id="totp-confirm-error" tone="error">
            {state.error}
          </FormMessage>
        )}
        <AuthField id="totp-confirm-code" label="Código do app">
          <OtpInput
            id="totp-confirm-code"
            name="code"
            required
            value={code}
            onValueChange={setCode}
            aria-invalid={state.error ? true : undefined}
            aria-describedby={state.error ? "totp-confirm-error" : undefined}
          />
        </AuthField>
        <div className="flex gap-2">
          <Button type="submit" disabled={pending || code.length !== 6} className="font-semibold">
            {pending && <Loader2 className="animate-spin" aria-hidden />}
            Confirmar e ativar
          </Button>
          <Button type="button" variant="ghost" onClick={onCancel} disabled={pending}>
            Cancelar
          </Button>
        </div>
      </form>
    </div>
  )
}

function TotpDisable({ onDisabled, onCancel }: { onDisabled: () => void; onCancel: () => void }) {
  const [code, setCode] = useState("")
  const [state, formAction, pending] = useActionState(async (prev: ActionState, formData: FormData) => {
    const result = (await disableTotpAction(prev, formData)) ?? {}
    if (result.error) setCode("")
    else {
      toast.success(result.message ?? "Google Authenticator desativado")
      onDisabled()
    }
    return result
  }, initialState)

  return (
    <form action={formAction} className="flex flex-col gap-3 sm:max-w-xs">
      <p className="text-sm text-muted-foreground">Confirme sua senha e um código atual do app para desativar.</p>
      {state.error && (
        <FormMessage id="totp-disable-error" tone="error">
          {state.error}
        </FormMessage>
      )}
      <AuthField id="totp-disable-password" label="Senha">
        <PasswordInput id="totp-disable-password" name="password" autoComplete="current-password" required aria-invalid={state.error ? true : undefined} />
      </AuthField>
      <AuthField id="totp-disable-code" label="Código do app">
        <OtpInput id="totp-disable-code" name="code" required value={code} onValueChange={setCode} aria-invalid={state.error ? true : undefined} />
      </AuthField>
      <div className="flex gap-2">
        <Button type="submit" variant="destructive" disabled={pending || code.length !== 6}>
          {pending && <Loader2 className="animate-spin" aria-hidden />}
          Desativar
        </Button>
        <Button type="button" variant="ghost" onClick={onCancel} disabled={pending}>
          Cancelar
        </Button>
      </div>
    </form>
  )
}

function AuthenticatorPanel({ initialEnabled }: { initialEnabled: boolean }) {
  const [enabled, setEnabled] = useState(initialEnabled)
  const [mode, setMode] = useState<"idle" | "setup" | "disable">("idle")
  const [setup, setSetup] = useState<{ secret: string; qrDataUrl: string } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [starting, startTransition] = useTransition()

  const start = () => {
    setError(null)
    startTransition(async () => {
      try {
        const result = await startTotpSetupAction()
        if (result.error || !result.secret) {
          setError(result.error ?? "Não foi possível iniciar a configuração.")
          return
        }
        setSetup({ secret: result.secret, qrDataUrl: result.qrDataUrl })
        setMode("setup")
      } catch {
        setError("Não foi possível iniciar a configuração.")
      }
    })
  }

  const reset = () => {
    setMode("idle")
    setSetup(null)
  }

  return (
    <Panel
      title={
        <span className="flex items-center gap-2">
          <Smartphone className="size-4 text-primary" aria-hidden />
          Google Authenticator
        </span>
      }
      description="Código de 6 dígitos gerado no celular, mesmo sem internet."
      actions={<StatusPill active={enabled} />}
    >
      {mode === "setup" && setup ? (
        <TotpSetup
          secret={setup.secret}
          qrDataUrl={setup.qrDataUrl}
          onCancel={reset}
          onEnabled={() => {
            setEnabled(true)
            reset()
          }}
        />
      ) : mode === "disable" ? (
        <TotpDisable
          onCancel={reset}
          onDisabled={() => {
            setEnabled(false)
            reset()
          }}
        />
      ) : (
        <div className="flex flex-col gap-3">
          <p className="text-sm text-muted-foreground">
            {enabled
              ? "No login, o app autenticador é oferecido como método padrão. O código por e-mail continua disponível como alternativa."
              : "Ative para confirmar o login com o app autenticador em vez de esperar o código por e-mail."}
          </p>
          {error && <FormMessage tone="error">{error}</FormMessage>}
          <div>
            {enabled ? (
              <Button variant="outline" onClick={() => setMode("disable")}>
                <ShieldOff />
                Desativar
              </Button>
            ) : (
              <Button onClick={start} disabled={starting} className="font-semibold">
                {starting ? <Loader2 className="animate-spin" aria-hidden /> : <ShieldCheck />}
                Ativar
              </Button>
            )}
          </div>
        </div>
      )}
    </Panel>
  )
}

function ChangePasswordPanel() {
  const [state, formAction, pending] = useActionState(async (prev: ActionState, formData: FormData) => {
    const result = (await changePasswordAction(prev, formData)) ?? {}
    if (!result.error) toast.success(result.message ?? "Senha alterada")
    return result
  }, initialState)

  return (
    <Panel
      title={
        <span className="flex items-center gap-2">
          <KeyRound className="size-4 text-primary" aria-hidden />
          Trocar senha
        </span>
      }
      description="Mínimo de 8 caracteres."
    >
      <form action={formAction} className="flex flex-col gap-3 sm:max-w-sm">
        {state.error && (
          <FormMessage id="password-change-error" tone="error">
            {state.error}
          </FormMessage>
        )}
        {!state.error && state.ok && <FormMessage tone="success">{state.message ?? "Senha alterada."}</FormMessage>}
        <AuthField id="currentPassword" label="Senha atual">
          <PasswordInput id="currentPassword" name="currentPassword" autoComplete="current-password" required aria-invalid={state.error ? true : undefined} />
        </AuthField>
        <AuthField id="newPassword" label="Nova senha">
          <PasswordInput id="newPassword" name="newPassword" autoComplete="new-password" required minLength={8} />
        </AuthField>
        <AuthField id="confirmNewPassword" label="Confirmar nova senha">
          <PasswordInput id="confirmNewPassword" name="confirmPassword" autoComplete="new-password" required minLength={8} />
        </AuthField>
        <div>
          <Button type="submit" disabled={pending} className="font-semibold">
            {pending && <Loader2 className="animate-spin" aria-hidden />}
            Salvar nova senha
          </Button>
        </div>
      </form>
    </Panel>
  )
}

export function SecuritySettings({ totpEnabled = false }: { totpEnabled?: boolean }) {
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <div className="flex flex-col gap-6">
        <AuthenticatorPanel initialEnabled={totpEnabled} />
        <Panel
          title={
            <span className="flex items-center gap-2">
              <Mail className="size-4 text-primary" aria-hidden />
              Verificação por e-mail
            </span>
          }
          description="Sempre disponível como método no login."
          actions={<StatusPill active />}
        >
          <p className="text-sm text-muted-foreground">
            A cada login, você pode receber um código de 6 dígitos no seu e-mail. Ele vale por poucos minutos e um novo envio só é liberado após 60 segundos.
          </p>
        </Panel>
      </div>
      <ChangePasswordPanel />
    </div>
  )
}
