import type { Metadata } from "next"
import { redirect } from "next/navigation"
import { getPendingChallenge } from "@/lib/auth/actions"
import { VerifyForm } from "@/components/auth/verify-form"

export const metadata: Metadata = { title: "Verificação" }

export default async function VerificarPage() {
  const challenge = await getPendingChallenge()
  if (!challenge) redirect("/login")
  return <VerifyForm maskedEmail={challenge.maskedEmail} hasTotp={challenge.hasTotp} emailSent={challenge.emailSent} />
}
