"use client"

import { Suspense, useEffect } from "react"
import { useSearchParams } from "next/navigation"
import { FileX2 } from "lucide-react"
import { Skeleton } from "@/components/ui/skeleton"
import { Logo } from "@/components/layout/logo"
import { EmptyState } from "@/components/shared/empty-state"
import { FormRenderer, type FormValues } from "@/components/lead-forms/form-renderer"
import { PROJECT_TYPE_LABEL, REVENUE_LABEL } from "@/lib/constants"
import { api, newId, useCrm, useForms, useUsers } from "@/lib/data"
import type { Lead, ProjectType, PublicForm, RevenueRange } from "@/types"

function reverseLookup<T extends string>(map: Record<T, string>, label: string | undefined): T | undefined {
  if (!label) return undefined
  return (Object.keys(map) as T[]).find((k) => map[k] === label)
}

function FormSkeleton() {
  return (
    <div className="w-full space-y-4 rounded-2xl border bg-card p-8">
      <Skeleton className="h-8 w-32" />
      <Skeleton className="h-7 w-3/4" />
      <Skeleton className="h-4 w-full" />
      {Array.from({ length: 5 }).map((_, i) => (
        <Skeleton key={i} className="h-9 w-full" />
      ))}
      <Skeleton className="h-10 w-full" />
    </div>
  )
}

function PublicFormContent({ form }: { form: PublicForm }) {
  const searchParams = useSearchParams()
  const add = useCrm((s) => s.add)
  const update = useCrm((s) => s.update)
  const logActivity = useCrm((s) => s.logActivity)
  const users = useUsers()

  const handleSubmit = async (values: FormValues) => {
    const sellers = users.filter((u) => u.active && u.role === "comercial")
    const owner = sellers.length ? sellers[(form.submissions + 1) % sellers.length] : users[0]
    const now = new Date().toISOString()
    const utm = {
      source: searchParams.get("utm_source") ?? undefined,
      medium: searchParams.get("utm_medium") ?? undefined,
      campaign: searchParams.get("utm_campaign") ?? undefined,
      term: searchParams.get("utm_term") ?? undefined,
      content: searchParams.get("utm_content") ?? undefined,
    }
    const lead: Lead = {
      id: newId("lead"),
      name: values.name || "Lead sem nome",
      whatsapp: values.whatsapp ?? "",
      email: values.email ?? "",
      company: values.company ?? "",
      projectType: reverseLookup<ProjectType>(PROJECT_TYPE_LABEL, values.projectType) ?? "outros",
      revenue: reverseLookup<RevenueRange>(REVENUE_LABEL, values.revenue) ?? "sem_faturamento",
      source: form.defaultSource,
      temperature: "morno",
      status: "novo",
      ownerId: owner?.id ?? "",
      utm: Object.fromEntries(Object.entries(utm).filter(([, v]) => v)),
      formId: form.id,
      createdAt: now,
      updatedAt: now,
    }
    await api.actions.submitPublicForm(form.slug, values)
    add("leads", lead)
    update("forms", form.id, { submissions: form.submissions + 1 })
    logActivity({
      type: "formulario",
      title: `Lead entrou pelo formulário ${form.name}`,
      description: values.message || (utm.campaign ? `Campanha ${utm.campaign}` : undefined),
      leadId: lead.id,
      authorId: lead.ownerId,
    })
  }

  return <FormRenderer form={form} onSubmit={handleSubmit} />
}

export function PublicFormPage({ slug }: { slug: string }) {
  const bootstrap = useCrm((s) => s.bootstrap)
  const status = useCrm((s) => s.status)
  const forms = useForms()

  useEffect(() => {
    void bootstrap()
  }, [bootstrap])

  const form = forms.find((f) => f.slug === slug && f.active)

  return (
    <div className="flex min-h-dvh items-center justify-center px-4 py-10">
      <div className="w-full max-w-lg">
        {status !== "ready" ? (
          <FormSkeleton />
        ) : !form ? (
          <div className="space-y-6">
            <Logo className="justify-center" />
            <EmptyState
              icon={FileX2}
              title="Formulário indisponível"
              description="Este formulário não existe ou foi desativado. Fale com a Track For pelo WhatsApp para receber o link atualizado."
            />
          </div>
        ) : (
          <Suspense fallback={<FormSkeleton />}>
            <PublicFormContent form={form} />
          </Suspense>
        )}
        <p className="mt-6 text-center text-[11px] text-muted-foreground">Track For — sites, lojas virtuais, sistemas, apps e gestão de tráfego</p>
      </div>
    </div>
  )
}
