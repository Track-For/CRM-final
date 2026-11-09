"use client"

import { useMemo } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Copy, ExternalLink, FormInput, MoreHorizontal, Pencil, Plus, Power, Trash2 } from "lucide-react"
import { toast } from "@/lib/store/save-feedback"
import { Button } from "@/components/ui/button"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { DataTable, type ColumnDef } from "@/components/shared/data-table"
import { EmptyState } from "@/components/shared/empty-state"
import { PageHeader } from "@/components/shared/page-header"
import { StatCard, StatGrid } from "@/components/shared/stat-card"
import { StatusBadge } from "@/components/shared/status-badge"
import { SOURCE_LABEL } from "@/lib/constants"
import { copyToClipboard } from "@/lib/browser"
import { newId, useCompany, useCrm, useForms, useLeads } from "@/lib/data"
import { formatDate, formatNumber, formatPercent } from "@/lib/format"
import type { PublicForm } from "@/types"

export function publicUrl(slug: string) {
  const origin = typeof window !== "undefined" ? window.location.origin : ""
  return `${origin}/f/${slug}`
}

function defaultFields(): PublicForm["fields"] {
  return [
    { id: newId("ff"), key: "name", label: "Nome completo", type: "text", placeholder: "Seu nome", required: true },
    { id: newId("ff"), key: "whatsapp", label: "WhatsApp", type: "tel", placeholder: "(71) 99999-9999", required: true },
    { id: newId("ff"), key: "email", label: "E-mail", type: "email", placeholder: "voce@empresa.com.br", required: false },
    {
      id: newId("ff"),
      key: "projectType",
      label: "Tipo de projeto",
      type: "select",
      required: true,
      options: ["Aplicativo", "Sistema", "Site ou Loja virtual", "Anúncio online", "Outros"],
    },
  ]
}

export function FormsList() {
  const router = useRouter()
  const forms = useForms()
  const leads = useLeads()
  const company = useCompany()
  const add = useCrm((s) => s.add)
  const update = useCrm((s) => s.update)
  const remove = useCrm((s) => s.remove)

  const leadCount = useMemo(() => {
    const map = new Map<string, number>()
    for (const l of leads) if (l.formId) map.set(l.formId, (map.get(l.formId) ?? 0) + 1)
    return map
  }, [leads])

  const createForm = (base?: PublicForm) => {
    const id = newId("form")
    const suffix = id.slice(-4)
    const form: PublicForm = base
      ? { ...base, id, name: `${base.name} (cópia)`, slug: `${base.slug}-${suffix}`, active: false, submissions: 0, fields: base.fields.map((f) => ({ ...f, id: newId("ff") })), createdAt: new Date().toISOString() }
      : {
          id,
          name: "Novo formulário",
          slug: `formulario-${suffix}`,
          active: false,
          title: "Fale com a Track For",
          description: "Preencha seus dados e receba uma proposta pelo WhatsApp.",
          fields: defaultFields(),
          submitLabel: "Enviar",
          successTitle: "Recebemos seus dados",
          successMessage: "Nossa equipe vai te chamar no WhatsApp em instantes.",
          ctaLabel: "Gostaria de marcar uma call",
          whatsappNumber: company.whatsapp,
          defaultSource: "site",
          submissions: 0,
          createdAt: new Date().toISOString(),
        }
    add("forms", form)
    toast.success(base ? "Formulário duplicado" : "Formulário criado")
    router.push(`/formularios/${form.id}`)
  }

  const totalSubmissions = forms.reduce((s, f) => s + f.submissions, 0)
  const totalLeads = forms.reduce((s, f) => s + (leadCount.get(f.id) ?? 0), 0)

  const actions = (f: PublicForm) => (
    <DropdownMenu>
      <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
        <Button variant="ghost" size="icon-sm" aria-label="Ações">
          <MoreHorizontal />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
        <DropdownMenuItem onSelect={() => router.push(`/formularios/${f.id}`)}>
          <Pencil /> Editar
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => copyToClipboard(publicUrl(f.slug), "Link copiado")}>
          <Copy /> Copiar link
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => window.open(`/f/${f.slug}`, "_blank", "noopener")} disabled={!f.active}>
          <ExternalLink /> Abrir página pública
        </DropdownMenuItem>
        <DropdownMenuItem
          onSelect={() => {
            update("forms", f.id, { active: !f.active })
            toast.success(f.active ? "Formulário desativado" : "Formulário ativado")
          }}
        >
          <Power /> {f.active ? "Desativar" : "Ativar"}
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => createForm(f)}>
          <Plus /> Duplicar
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          variant="destructive"
          onSelect={() => {
            remove("forms", f.id)
            toast.success("Formulário excluído")
          }}
        >
          <Trash2 /> Excluir
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )

  const columns: ColumnDef<PublicForm, unknown>[] = [
    {
      accessorKey: "name",
      header: "Formulário",
      cell: ({ row }) => (
        <div className="min-w-0">
          <p className="truncate font-medium">{row.original.name}</p>
          <p className="truncate text-xs text-muted-foreground">{row.original.title}</p>
        </div>
      ),
    },
    {
      accessorKey: "slug",
      header: "Link",
      cell: ({ row }) => (
        <button
          type="button"
          className="num inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-primary"
          onClick={(e) => {
            e.stopPropagation()
            void copyToClipboard(publicUrl(row.original.slug), "Link copiado")
          }}
        >
          /f/{row.original.slug}
          <Copy className="size-3" />
        </button>
      ),
    },
    {
      accessorKey: "active",
      header: "Status",
      cell: ({ row }) => <StatusBadge tone={row.original.active ? "success" : "neutral"}>{row.original.active ? "Ativo" : "Inativo"}</StatusBadge>,
    },
    { accessorKey: "defaultSource", header: "Origem", cell: ({ row }) => <span className="text-sm">{SOURCE_LABEL[row.original.defaultSource]}</span> },
    { accessorKey: "submissions", header: "Envios", cell: ({ row }) => <span className="num">{formatNumber(row.original.submissions)}</span> },
    { id: "leads", header: "Leads no CRM", accessorFn: (f) => leadCount.get(f.id) ?? 0, cell: ({ getValue }) => <span className="num">{getValue<number>()}</span> },
    { accessorKey: "createdAt", header: "Criado em", cell: ({ row }) => <span className="num text-xs text-muted-foreground">{formatDate(row.original.createdAt)}</span> },
    { id: "actions", header: "", enableSorting: false, size: 44, cell: ({ row }) => actions(row.original) },
  ]

  return (
    <>
      <PageHeader
        title="Formulários"
        description="Páginas públicas de captação que criam leads direto no CRM."
        actions={
          <Button onClick={() => createForm()}>
            <Plus /> Novo formulário
          </Button>
        }
      />
      <StatGrid className="mb-6">
        <StatCard label="Formulários ativos" value={`${forms.filter((f) => f.active).length}/${forms.length}`} icon={FormInput} />
        <StatCard label="Envios totais" value={formatNumber(totalSubmissions)} highlight />
        <StatCard label="Leads no CRM" value={formatNumber(totalLeads)} hint="vinculados a formulários" />
        <StatCard label="Aproveitamento" value={formatPercent(totalSubmissions ? totalLeads / totalSubmissions : 0)} hint="leads / envios" />
      </StatGrid>
      <DataTable
        columns={columns}
        data={forms}
        getRowId={(f) => f.id}
        onRowClick={(f) => router.push(`/formularios/${f.id}`)}
        empty={
          <EmptyState
            icon={FormInput}
            title="Nenhum formulário criado"
            description="Crie um formulário para captar leads de anúncios e do site."
            action={
              <Button size="sm" onClick={() => createForm()}>
                <Plus /> Criar formulário
              </Button>
            }
          />
        }
        mobileCard={(f) => (
          <div className="space-y-2">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate font-medium">{f.name}</p>
                <p className="num truncate text-xs text-muted-foreground">/f/{f.slug}</p>
              </div>
              <div className="flex items-center gap-1">
                <StatusBadge tone={f.active ? "success" : "neutral"}>{f.active ? "Ativo" : "Inativo"}</StatusBadge>
                {actions(f)}
              </div>
            </div>
            <div className="flex gap-4 text-xs text-muted-foreground">
              <span>
                <span className="num text-foreground">{f.submissions}</span> envios
              </span>
              <span>
                <span className="num text-foreground">{leadCount.get(f.id) ?? 0}</span> leads
              </span>
              <span>{SOURCE_LABEL[f.defaultSource]}</span>
            </div>
          </div>
        )}
      />
      <p className="mt-4 text-xs text-muted-foreground">
        Dica: adicione parâmetros UTM ao link (ex.: <span className="num">?utm_source=facebook&utm_campaign=sites</span>) para rastrear a origem no lead.{" "}
        <Link href="/leads" className="text-primary hover:underline">
          Ver leads
        </Link>
      </p>
    </>
  )
}
