"use client"
import { useState } from "react"
import { useParams, useRouter } from "next/navigation"
import { acceptInvitationAction } from "@/lib/auth/user-actions"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
export default function AcceptInvitation() {
  const { token } = useParams<{ token: string }>()
  const router = useRouter()
  const [error, setError] = useState("")
  const [busy, setBusy] = useState(false)
  return <main className="mx-auto max-w-md px-6 py-20"><h1 className="mb-6 text-2xl font-semibold">Ativar seu acesso</h1><form className="space-y-4" onSubmit={async event => { event.preventDefault(); const data = new FormData(event.currentTarget); setBusy(true); setError(""); try { await acceptInvitationAction(token, String(data.get("password"))); router.replace("/login") } catch (error) { setError(error instanceof Error ? error.message : "Não foi possível ativar o acesso.") } finally { setBusy(false) } }}><label className="grid gap-2">Crie sua senha<Input name="password" type="password" autoComplete="new-password" minLength={12} maxLength={128} required /></label><p className="text-sm text-muted-foreground">Use ao menos 12 caracteres. Depois da ativação, entre com seu e-mail, senha e código de verificação.</p>{error && <p role="alert" className="text-sm text-destructive">{error}</p>}<Button disabled={busy}>{busy ? "Ativando…" : "Ativar acesso"}</Button></form></main>
}
