import type { Metadata } from "next"
import { redirect } from "next/navigation"
import { connection } from "next/server"
import { hasAnyUser } from "@/lib/auth/actions"
import { getCurrentUser } from "@/lib/auth/session"
import { LoginForm } from "@/components/auth/login-form"

export const metadata: Metadata = { title: "Entrar" }

const CREATED_NOTICE = "Acesso criado. Entre com seu e-mail e senha."

export default async function LoginPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await connection()
  if (!(await hasAnyUser())) redirect("/primeiro-acesso")
  if (await getCurrentUser()) redirect("/dashboard")

  const params = await searchParams
  // createFirstUserAction redireciona para ?conta=criada; ?criado=1 também é aceito.
  const created = params.conta === "criada" || params.criado === "1"
  return <LoginForm notice={created ? CREATED_NOTICE : undefined} />
}
