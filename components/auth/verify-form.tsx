"use client"

import { useActionState, useEffect, useState } from "react"
import Link from "next/link"
import { ArrowLeft, Mail, RefreshCw, Smartphone } from "lucide-react"
import { sendEmailCodeAction, verifyTwoFactorAction, type ActionState } from "@/lib/auth/actions"
import { Button } from "@/components/ui/button"
import { AuthField, AuthHeading, FormMessage, OtpInput, SubmitButton } from "@/components/auth/auth-ui"
import { cn } from "@/lib/utils"

type Method = "totp" | "email"

const RESEND_SECONDS = 60
const initialState: ActionState = {}

interface VerifyFormProps {
  maskedEmail: string
  hasTotp: boolean
  emailSent: boolean
}

function MethodOption({ active, icon: Icon, title, description, onClick }: { active: boolean; icon: typeof Mail; title: string; description: string; onClick: () => void }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={active}
      onClick={onClick}
      className={cn(
        "flex min-w-0 items-start gap-3 rounded-lg border bg-surface p-3 text-left transition-colors outline-none hover:border-[#333] focus-visible:ring-3 focus-visible:ring-ring/50",
        active && "border-primary/35 bg-brand-soft",
      )}
    >
      <Icon className={cn("mt-0.5 size-4 shrink-0", active ? "text-primary" : "text-muted-foreground")} aria-hidden />
      <span className="min-w-0">
        <span className={cn("block text-sm font-medium", active && "text-primary")}>{title}</span>
        <span className="block text-xs text-muted-foreground">{description}</span>
      </span>
    </button>
  )
}

export function VerifyForm({ maskedEmail, hasTotp, emailSent }: VerifyFormProps) {
  const [method, setMethod] = useState<Method>(hasTotp ? "totp" : "email")
  const [code, setCode] = useState("")
  const [sent, setSent] = useState(emailSent)
  // Se o código acabou de ser enviado no login, começa já em contagem.
  const [cooldown, setCooldown] = useState(emailSent && !hasTotp ? RESEND_SECONDS : 0)

  const [verifyState, verifyAction, verifying] = useActionState(async (prev: ActionState, formData: FormData) => {
    const result = await verifyTwoFactorAction(prev, formData)
    if (result?.error) setCode("")
    return result ?? {}
  }, initialState)

  const [sendState, sendAction, sending] = useActionState(async (prev: ActionState, formData: FormData) => {
    const result = (await sendEmailCodeAction(prev, formData)) ?? {}
    if (!result.error) {
      setSent(true)
      setCooldown(RESEND_SECONDS)
    }
    return result
  }, initialState)

  useEffect(() => {
    if (cooldown <= 0) return
    const id = window.setTimeout(() => setCooldown((s) => Math.max(0, s - 1)), 1000)
    return () => window.clearTimeout(id)
  }, [cooldown])

  const switchMethod = (next: Method) => {
    setMethod(next)
    setCode("")
  }

  const isEmail = method === "email"
  const description = isEmail
    ? sent
      ? `Enviamos um código de 6 dígitos para ${maskedEmail}.`
      : `Vamos enviar um código de 6 dígitos para ${maskedEmail}.`
    : "Abra o Google Authenticator e digite o código de 6 dígitos do Track For CRM."
  const error = verifyState.error
  const canVerify = !isEmail || sent

  return (
    <>
      <AuthHeading title="Verificação em duas etapas" description={description} />

      {hasTotp && (
        <div role="radiogroup" aria-label="Método de verificação" className="mb-5 grid grid-cols-1 gap-2 min-[400px]:grid-cols-2">
          <MethodOption active={!isEmail} icon={Smartphone} title="App autenticador" description="Google Authenticator" onClick={() => switchMethod("totp")} />
          <MethodOption active={isEmail} icon={Mail} title="Código por e-mail" description={maskedEmail} onClick={() => switchMethod("email")} />
        </div>
      )}

      <div className="flex flex-col gap-4">
        {error && (
          <FormMessage id="code-error" tone="error">
            {error}
          </FormMessage>
        )}
        {isEmail && sendState.error && <FormMessage tone="error">{sendState.error}</FormMessage>}
        {isEmail && !sendState.error && sendState.message && <FormMessage tone="success">{sendState.message}</FormMessage>}

        {canVerify ? (
          <form action={verifyAction} className="flex flex-col gap-4">
            <input type="hidden" name="method" value={method} />
            <AuthField id="code" label={isEmail ? "Código recebido por e-mail" : "Código do app autenticador"}>
              <OtpInput
                key={method}
                id="code"
                name="code"
                required
                autoFocus
                value={code}
                onValueChange={setCode}
                aria-invalid={error ? true : undefined}
                aria-describedby={error ? "code-error" : undefined}
              />
            </AuthField>
            <SubmitButton pending={verifying} pendingLabel="Verificando..." disabled={verifying || code.length !== 6}>
              Verificar
            </SubmitButton>
          </form>
        ) : null}

        {isEmail && (
          <form action={sendAction}>
            {sent ? (
              <Button type="submit" variant="ghost" size="sm" disabled={sending || cooldown > 0} className="w-full text-muted-foreground">
                <RefreshCw className={cn(sending && "animate-spin")} aria-hidden />
                {cooldown > 0 ? (
                  <span>
                    Reenviar código em <span className="num">{cooldown}s</span>
                  </span>
                ) : sending ? (
                  "Enviando..."
                ) : (
                  "Reenviar código"
                )}
              </Button>
            ) : (
              <SubmitButton pending={sending} pendingLabel="Enviando...">
                <Mail aria-hidden />
                Enviar código por e-mail
              </SubmitButton>
            )}
          </form>
        )}
      </div>

      <div className="mt-6 flex flex-col gap-2 border-t pt-4 text-sm min-[400px]:flex-row min-[400px]:items-center min-[400px]:justify-between">
        {hasTotp ? (
          <button
            type="button"
            onClick={() => switchMethod(isEmail ? "totp" : "email")}
            className="w-fit rounded text-muted-foreground underline-offset-4 outline-none hover:text-foreground hover:underline focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            Usar outro método
          </button>
        ) : (
          <span />
        )}
        <Link
          href="/login"
          className="inline-flex w-fit items-center gap-1 rounded text-muted-foreground outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          <ArrowLeft className="size-3.5" aria-hidden />
          Voltar ao login
        </Link>
      </div>
    </>
  )
}
