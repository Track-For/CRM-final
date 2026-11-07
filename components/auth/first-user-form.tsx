"use client"

import { useActionState, useState } from "react"
import Link from "next/link"
import { Check, Circle } from "lucide-react"
import { createFirstUserAction, type ActionState } from "@/lib/auth/actions"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { AuthField, AuthHeading, FormMessage, PasswordInput, SubmitButton, authInputClass } from "@/components/auth/auth-ui"
import { cn } from "@/lib/utils"

const MIN_PASSWORD = 8
const initialState: ActionState = {}

function Requirement({ met, children }: { met: boolean; children: React.ReactNode }) {
  const Icon = met ? Check : Circle
  return (
    <li className={cn("flex items-center gap-1.5", met ? "text-success" : "text-muted-foreground")}>
      <Icon className={cn("shrink-0", met ? "size-3.5" : "size-2.5 mx-0.5")} aria-hidden />
      {children}
      <span className="sr-only">{met ? "(atendido)" : "(pendente)"}</span>
    </li>
  )
}

export function FirstUserForm() {
  const [state, formAction, pending] = useActionState(createFirstUserAction, initialState)
  const [name, setName] = useState("")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [confirm, setConfirm] = useState("")

  const longEnough = password.length >= MIN_PASSWORD
  const matches = confirm.length > 0 && password === confirm
  const mismatch = confirm.length > 0 && password !== confirm

  if (state.ok) {
    return (
      <>
        <AuthHeading title="Acesso criado" />
        <FormMessage tone="success">{state.message ?? "Acesso criado. Entre com seu e-mail e senha."}</FormMessage>
        <Button asChild size="lg" className="mt-5 h-10 w-full font-semibold">
          <Link href="/login?criado=1">Ir para o login</Link>
        </Button>
      </>
    )
  }

  return (
    <>
      <AuthHeading
        title="Primeiro acesso"
        description="Crie a conta de administrador do CRM. Depois do login, ative o Google Authenticator em Minha conta."
      />
      <form action={formAction} className="flex flex-col gap-4">
        {state.error && (
          <FormMessage id="first-user-error" tone="error">
            {state.error}
          </FormMessage>
        )}
        <AuthField id="name" label="Nome">
          <Input id="name" name="name" autoComplete="name" required autoFocus value={name} onChange={(e) => setName(e.target.value)} className={authInputClass} />
        </AuthField>
        <AuthField id="email" label="E-mail">
          <Input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            inputMode="email"
            required
            placeholder="voce@empresa.com.br"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={authInputClass}
          />
        </AuthField>
        <AuthField
          id="password"
          label="Senha"
          hint={
            <ul className="mt-0.5 space-y-1">
              <Requirement met={longEnough}>Mínimo de {MIN_PASSWORD} caracteres</Requirement>
              <Requirement met={matches}>Confirmação igual à senha</Requirement>
            </ul>
          }
        >
          <PasswordInput
            id="password"
            name="password"
            autoComplete="new-password"
            required
            minLength={MIN_PASSWORD}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            aria-describedby="password-hint"
            aria-invalid={password.length > 0 && !longEnough ? true : undefined}
          />
        </AuthField>
        <AuthField id="confirmPassword" label="Confirmar senha" error={mismatch ? "As senhas não coincidem." : undefined}>
          <PasswordInput
            id="confirmPassword"
            name="confirmPassword"
            autoComplete="new-password"
            required
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            aria-invalid={mismatch || undefined}
            aria-describedby={mismatch ? "confirmPassword-error" : undefined}
          />
        </AuthField>
        <SubmitButton pending={pending} pendingLabel="Criando acesso..." disabled={pending || !longEnough || !matches || !name.trim() || !email.trim()} className="mt-1">
          Criar administrador
        </SubmitButton>
      </form>
    </>
  )
}
