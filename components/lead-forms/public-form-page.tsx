"use client"
import { useEffect, useState } from "react"
import { FormRenderer } from "@/components/lead-forms/form-renderer"
import { getPublicFormAction, submitPublicFormAction } from "@/lib/forms/public-actions"
import { EmptyState } from "@/components/shared/empty-state"
import { Button } from "@/components/ui/button"
import type { PublicForm } from "@/types"
export function PublicFormPage({ slug }: { slug: string }) {
  const [form, setForm] = useState<PublicForm | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [requestId] = useState(() => crypto.randomUUID())
  useEffect(() => {
    let active = true
    getPublicFormAction(slug).then(value => { if (active) setForm(value) }).catch(() => { if (active) setError("Não foi possível carregar o formulário.") }).finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [slug])
  return <main className="flex min-h-dvh items-center justify-center px-4 py-10"><div className="w-full max-w-lg">{loading ? <p role="status">Carregando formulário…</p> : error ? <EmptyState title={error} action={<Button onClick={() => window.location.reload()}>Tentar novamente</Button>} /> : !form ? <EmptyState title="Formulário indisponível" description="Este formulário não existe ou foi desativado." /> : <FormRenderer form={form} onSubmit={async values => {
    const params = new URLSearchParams(window.location.search)
    const utm = Object.fromEntries(["source", "medium", "campaign", "term", "content"].flatMap(key => { const value = params.get(`utm_${key}`); return value ? [[key, value.slice(0, 300)]] : [] }))
    await submitPublicFormAction(slug, values, requestId, utm)
  }} />}</div></main>
}
