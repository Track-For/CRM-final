"use client"

import { useActionState, useState } from "react"
import Link from "next/link"
import { loginAction, type ActionState } from "@/lib/auth/actions"
import { Input } from "@/components/ui/input"
import { AuthField, AuthHeading, FormMessage, PasswordInput, SubmitButton, authInputClass } from "@/components/auth/auth-ui"

const initialState: ActionState = {}

export function LoginForm({ notice }: { notice?: string }) {
  const [state, formAction, pending] = useActionState(loginAction, initialState)
  // Controlado para não perder o e-mail quando o React reseta o form após a action.
  const [email, setEmail] = useState("")
  const invalid = Boolean(state.error)

  return (
    <>
      <AuthHeading title="Entrar" description="Use seu e-mail e senha. Em seguida, confirme com o segundo fator." />
      <form action={formAction} className="flex flex-col gap-4">
        {state.error ? (
          <FormMessage id="login-error" tone="error">
            {state.error}
          </FormMessage>
        ) : notice ? (
          <FormMessage tone="success">{notice}</FormMessage>
        ) : null}
        <AuthField id="email" label="E-mail">
          <Input
            id="email"
            name="email"
            type="email"
            autoComplete="username"
            inputMode="email"
            required
            autoFocus
            placeholder="voce@empresa.com.br"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            aria-invalid={invalid || undefined}
            aria-describedby={invalid ? "login-error" : undefined}
            className={authInputClass}
          />
        </AuthField>
        <AuthField id="password" label="Senha">
          <PasswordInput
            id="password"
            name="password"
            autoComplete="current-password"
            required
            aria-invalid={invalid || undefined}
            aria-describedby={invalid ? "login-error" : undefined}
          />
        </AuthField>
        <SubmitButton pending={pending} pendingLabel="Entrando..." className="mt-1">
          Entrar
        </SubmitButton>
        <Link href="/recuperar-acesso" className="text-center text-sm text-primary underline">Esqueci minha senha</Link>
      </form>
    </>
  )
}
