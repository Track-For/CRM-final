import type { Metadata } from "next"
import { RecoveryForm } from "@/components/auth/recovery-form"

export const metadata: Metadata = { title: "Recuperar acesso", referrer: "no-referrer", robots: { index: false, follow: false } }
export default async function RecoveryPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams
  return <RecoveryForm token={token} />
}
