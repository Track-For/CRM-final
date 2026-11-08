"use client"
import Link from "next/link"
import { useActionState } from "react"
import { requestPasswordRecovery, resetPassword } from "@/lib/auth/recovery"
import { Input } from "@/components/ui/input"
import { AuthField, AuthHeading, FormMessage, PasswordInput, SubmitButton, authInputClass } from "./auth-ui"

export function RecoveryForm({ token }: { token?: string }) {
  const [state, action, pending] = useActionState(token ? resetPassword : requestPasswordRecovery, {})
  return <>
    <AuthHeading title={token ? "Criar nova senha" : "Recuperar acesso"} description={token ? "O link é de uso único e vale por 30 minutos." : "Informe seu e-mail para receber o link de recuperação."} />
    <form action={action} className="flex flex-col gap-4">
      {state.error && <FormMessage tone="error">{state.error}</FormMessage>}
      {state.message && <FormMessage tone="success">{state.message}</FormMessage>}
      {!(token && state.ok) && <>
        {token ? <><input type="hidden" name="token" value={token} />
          <AuthField id="password" label="Nova senha"><PasswordInput id="password" name="password" autoComplete="new-password" minLength={8} maxLength={200} required /></AuthField>
          <AuthField id="confirmPassword" label="Confirme a nova senha"><PasswordInput id="confirmPassword" name="confirmPassword" autoComplete="new-password" minLength={8} maxLength={200} required /></AuthField>
        </> : <AuthField id="email" label="E-mail"><Input className={authInputClass} id="email" name="email" type="email" autoComplete="email" maxLength={254} required /></AuthField>}
        <SubmitButton pending={pending} pendingLabel="Aguarde...">{token ? "Salvar nova senha" : "Enviar link de recuperação"}</SubmitButton>
      </>}
      <Link className="text-center text-sm text-primary underline" href="/login">Voltar para entrar</Link>
    </form>
  </>
}
