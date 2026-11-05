import type { Metadata } from "next"
import { redirect } from "next/navigation"
import { connection } from "next/server"
import { hasAnyUser } from "@/lib/auth/actions"
import { FirstUserForm } from "@/components/auth/first-user-form"

export const metadata: Metadata = { title: "Primeiro acesso" }

export default async function PrimeiroAcessoPage() {
  await connection()
  if (await hasAnyUser()) redirect("/login")
  return <FirstUserForm />
}
