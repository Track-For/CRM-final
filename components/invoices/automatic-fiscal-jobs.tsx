"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { retryAutomaticFiscalJob } from "@/lib/fiscal/automatic-actions"
import type { FiscalJob } from "@/lib/fiscal/automatic"

export function AutomaticFiscalJobs({ jobs }: { jobs: FiscalJob[] }) {
  const router = useRouter()
  const [busy, start] = useTransition()
  const [error, setError] = useState("")
  const pending = jobs.filter(job => job.status !== "completed")
  if (!pending.length) return null
  const retry = (id: string) => start(async () => {
    setError("")
    try { await retryAutomaticFiscalJob(id); router.refresh() }
    catch (e) { setError(e instanceof Error ? e.message : "Não foi possível retomar a emissão.") }
  })
  return <section className="rounded-xl border bg-surface p-4" aria-label="Emissões automáticas pendentes">
    <h2 className="font-medium">Emissões após pagamento</h2>
    <p className="mt-1 text-sm text-muted-foreground">Corrija as pendências no cadastro do cliente ou na <Link className="underline" href="/integracoes/brasil_nfe">integração Brasil NFe</Link> e tente novamente. Notas rejeitadas são corrigidas na lista de notas.</p>
    {error && <p role="alert" className="mt-2 text-sm text-danger">{error}</p>}
    <div className="mt-3 divide-y">{pending.map(job => <div key={job.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
      <div className="min-w-0"><p className="text-sm font-medium">{job.description}</p><p className="text-xs text-muted-foreground">{job.environment === "homologacao" ? "Homologação" : "Produção"} · {job.error || (job.status === "processing" ? "Emissão em andamento. Se foi interrompida, aguarde dois minutos antes de retomar." : "Aguardando emissão")}</p></div>
      {job.status !== "review" && <Button size="sm" variant="outline" disabled={busy} onClick={() => retry(job.id)}>{busy ? "Verificando…" : "Tentar novamente"}</Button>}
    </div>)}</div>
  </section>
}
