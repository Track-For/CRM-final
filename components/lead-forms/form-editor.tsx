"use client"

import { useState } from "react"
import Link from "next/link"
import { closestCenter, DndContext, KeyboardSensor, PointerSensor, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core"
import { arrayMove, SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import { z } from "zod"
import { ArrowDown, ArrowUp, Copy, ExternalLink, GripVertical, Plus, Trash2 } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import { FormField, FormGrid } from "@/components/shared/form-field"
import { MaskedInput } from "@/components/shared/money-input"
import { OptionSelect } from "@/components/shared/option-select"
import { PageHeader } from "@/components/shared/page-header"
import { Panel } from "@/components/shared/panel"
import { StatusBadge } from "@/components/shared/status-badge"
import { FormRenderer } from "@/components/lead-forms/form-renderer"
import { publicUrl } from "@/components/lead-forms/forms-list"
import { SOURCE_LABEL, toOptions } from "@/lib/constants"
import { copyToClipboard } from "@/lib/browser"
import { newId, useCrm, useForms } from "@/lib/data"
import { maskPhone, onlyDigits } from "@/lib/format"
import { cn } from "@/lib/utils"
import type { FormFieldConfig, FormFieldType, PublicForm } from "@/types"

const FIELD_TYPES: { value: FormFieldType; label: string }[] = [
  { value: "text", label: "Texto" },
  { value: "email", label: "E-mail" },
  { value: "tel", label: "WhatsApp / telefone" },
  { value: "select", label: "Lista de opções" },
  { value: "textarea", label: "Texto longo" },
]

/** Chaves reconhecidas pelo CRM ao criar o lead. */
const KNOWN_KEYS = [
  { value: "name", label: "Nome (name)" },
  { value: "whatsapp", label: "WhatsApp (whatsapp)" },
  { value: "email", label: "E-mail (email)" },
  { value: "company", label: "Empresa (company)" },
  { value: "projectType", label: "Tipo de projeto (projectType)" },
  { value: "revenue", label: "Faturamento (revenue)" },
  { value: "message", label: "Mensagem (message)" },
]

const editorSchema = z.object({
  name: z.string().trim().min(1, "Nome interno é obrigatório"),
  slug: z
    .string()
    .trim()
    .min(3, "Slug deve ter ao menos 3 caracteres")
    .regex(/^[a-z0-9-]+$/, "Slug aceita apenas letras minúsculas, números e hífen"),
  title: z.string().trim().min(1, "Título é obrigatório"),
  submitLabel: z.string().trim().min(1, "Texto do botão é obrigatório"),
  successTitle: z.string().trim().min(1, "Título da tela final é obrigatório"),
  ctaLabel: z.string().trim().min(1, "Texto do botão de call é obrigatório"),
  whatsappNumber: z.string().refine((v) => onlyDigits(v).length >= 10, "WhatsApp inválido"),
  fields: z
    .array(z.object({ label: z.string().trim().min(1, "Todo campo precisa de rótulo"), key: z.string().trim().min(1, "Todo campo precisa de chave") }))
    .min(1, "Adicione ao menos um campo"),
})

function slugify(v: string) {
  return v
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
}

export function FormEditor({ initial }: { initial: PublicForm }) {
  const [draft, setDraft] = useState<PublicForm>(initial)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [previewMode, setPreviewMode] = useState<"form" | "success">("form")
  const update = useCrm((s) => s.update)
  const forms = useForms()
  const dirty = JSON.stringify(draft) !== JSON.stringify(initial)

  const set = <K extends keyof PublicForm>(key: K, value: PublicForm[K]) => setDraft((d) => ({ ...d, [key]: value }))
  const setField = (id: string, patch: Partial<FormFieldConfig>) => setDraft((d) => ({ ...d, fields: d.fields.map((f) => (f.id === id ? { ...f, ...patch } : f)) }))
  const moveField = (from: number, to: number) => setDraft((d) => ({ ...d, fields: arrayMove(d.fields, from, to) }))

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }))
  const onDragEnd = (e: DragEndEvent) => {
    if (!e.over || e.active.id === e.over.id) return
    const from = draft.fields.findIndex((f) => f.id === e.active.id)
    const to = draft.fields.findIndex((f) => f.id === e.over!.id)
    moveField(from, to)
  }

  const addField = () => {
    const used = new Set(draft.fields.map((f) => f.key))
    const key = KNOWN_KEYS.find((k) => !used.has(k.value))?.value ?? `campo_${draft.fields.length + 1}`
    setDraft((d) => ({ ...d, fields: [...d.fields, { id: newId("ff"), key, label: "", type: "text", required: false }] }))
  }

  const save = () => {
    const result = editorSchema.safeParse(draft)
    const next: Record<string, string> = {}
    if (!result.success) {
      for (const issue of result.error.issues) {
        const path = issue.path[0] === "fields" && typeof issue.path[1] === "number" ? `field-${draft.fields[issue.path[1]]?.id}` : String(issue.path[0])
        if (!next[path]) next[path] = issue.message
      }
    }
    const keys = draft.fields.map((f) => f.key)
    draft.fields.forEach((f, i) => {
      if (keys.indexOf(f.key) !== i) next[`field-${f.id}`] = "Chave repetida em outro campo"
    })
    if (forms.some((f) => f.id !== draft.id && f.slug === draft.slug)) next.slug = "Já existe um formulário com este slug"
    setErrors(next)
    if (Object.keys(next).length) {
      toast.error("Revise os campos destacados", { description: Object.values(next)[0] })
      return
    }
    update("forms", draft.id, draft)
    toast.success("Formulário salvo")
  }

  return (
    <>
      <PageHeader
        backHref="/formularios"
        backLabel="Formulários"
        title={draft.name || "Formulário"}
        description={
          <span className="inline-flex flex-wrap items-center gap-2">
            <StatusBadge tone={draft.active ? "success" : "neutral"}>{draft.active ? "Ativo" : "Inativo"}</StatusBadge>
            <span className="num text-xs">/f/{draft.slug}</span>
          </span>
        }
        actions={
          <>
            <Button variant="outline" size="sm" onClick={() => copyToClipboard(publicUrl(draft.slug), "Link copiado")}>
              <Copy /> Copiar link
            </Button>
            <Button variant="outline" size="sm" asChild>
              <Link href={`/f/${initial.slug}`} target="_blank">
                <ExternalLink /> Abrir
              </Link>
            </Button>
            <Button variant="ghost" size="sm" disabled={!dirty} onClick={() => setDraft(initial)}>
              Descartar
            </Button>
            <Button size="sm" onClick={save} disabled={!dirty}>
              Salvar
            </Button>
          </>
        }
      />

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_420px]">
        <div className="min-w-0 space-y-6">
          <Panel title="Configurações gerais">
            <FormGrid>
              <FormField label="Nome interno" required error={errors.name}>
                <Input value={draft.name} onChange={(e) => set("name", e.target.value)} aria-invalid={!!errors.name} />
              </FormField>
              <FormField label="Slug (endereço público)" required error={errors.slug} hint={`/f/${draft.slug}`}>
                <Input className="num" value={draft.slug} onChange={(e) => set("slug", slugify(e.target.value))} aria-invalid={!!errors.slug} />
              </FormField>
              <FormField label="Origem padrão do lead">
                <OptionSelect value={draft.defaultSource} onChange={(v) => set("defaultSource", v)} options={toOptions(SOURCE_LABEL)} />
              </FormField>
              <div className="flex items-center justify-between gap-3 rounded-lg border bg-surface px-3 py-2">
                <div>
                  <p className="text-sm font-medium">Formulário ativo</p>
                  <p className="text-xs text-muted-foreground">Inativo exibe aviso de indisponível</p>
                </div>
                <Switch checked={draft.active} onCheckedChange={(v) => set("active", v)} aria-label="Formulário ativo" />
              </div>
              <FormField label="Título" required error={errors.title} className="sm:col-span-2">
                <Input value={draft.title} onChange={(e) => set("title", e.target.value)} aria-invalid={!!errors.title} />
              </FormField>
              <FormField label="Descrição" className="sm:col-span-2">
                <Textarea rows={2} value={draft.description} onChange={(e) => set("description", e.target.value)} />
              </FormField>
              <FormField label="Texto do botão de envio" required error={errors.submitLabel}>
                <Input value={draft.submitLabel} onChange={(e) => set("submitLabel", e.target.value)} aria-invalid={!!errors.submitLabel} />
              </FormField>
            </FormGrid>
          </Panel>

          <Panel
            title="Campos"
            description="Arraste para reordenar. A chave define em qual campo do lead o valor será gravado."
            actions={
              <Button size="sm" variant="outline" onClick={addField}>
                <Plus /> Campo
              </Button>
            }
          >
            {errors.fields && <p className="mb-3 text-xs text-danger">{errors.fields}</p>}
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
              <SortableContext items={draft.fields.map((f) => f.id)} strategy={verticalListSortingStrategy}>
                <div className="space-y-3">
                  {draft.fields.map((field, index) => (
                    <SortableField
                      key={field.id}
                      field={field}
                      index={index}
                      total={draft.fields.length}
                      error={errors[`field-${field.id}`]}
                      onChange={(patch) => setField(field.id, patch)}
                      onMove={(to) => moveField(index, to)}
                      onRemove={() => setDraft((d) => ({ ...d, fields: d.fields.filter((f) => f.id !== field.id) }))}
                    />
                  ))}
                </div>
              </SortableContext>
            </DndContext>
          </Panel>

          <Panel title="Tela final" description="Exibida depois do envio, com botão para marcar call no WhatsApp.">
            <FormGrid>
              <FormField label="Título" required error={errors.successTitle} className="sm:col-span-2">
                <Input value={draft.successTitle} onChange={(e) => set("successTitle", e.target.value)} onFocus={() => setPreviewMode("success")} />
              </FormField>
              <FormField label="Mensagem" className="sm:col-span-2">
                <Textarea rows={2} value={draft.successMessage} onChange={(e) => set("successMessage", e.target.value)} onFocus={() => setPreviewMode("success")} />
              </FormField>
              <FormField label="Texto do botão" required error={errors.ctaLabel}>
                <Input value={draft.ctaLabel} onChange={(e) => set("ctaLabel", e.target.value)} onFocus={() => setPreviewMode("success")} />
              </FormField>
              <FormField label="WhatsApp que recebe a call" required error={errors.whatsappNumber}>
                <MaskedInput mask={maskPhone} value={draft.whatsappNumber} onChange={(v) => set("whatsappNumber", v)} onFocus={() => setPreviewMode("success")} />
              </FormField>
            </FormGrid>
          </Panel>
        </div>

        <div className="min-w-0">
          <div className="space-y-3 xl:sticky xl:top-20">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-semibold">Pré-visualização</p>
              <Tabs value={previewMode} onValueChange={(v) => setPreviewMode(v as "form" | "success")}>
                <TabsList>
                  <TabsTrigger value="form">Formulário</TabsTrigger>
                  <TabsTrigger value="success">Tela final</TabsTrigger>
                </TabsList>
              </Tabs>
            </div>
            <div className="rounded-2xl border bg-background p-3 sm:p-4">
              <FormRenderer key={previewMode} form={draft} compact showSuccess={previewMode === "success"} onSubmit={() => setPreviewMode("success")} />
            </div>
            <p className="text-xs text-muted-foreground">O envio na pré-visualização não cria lead.</p>
          </div>
        </div>
      </div>
    </>
  )
}

interface SortableFieldProps {
  field: FormFieldConfig
  index: number
  total: number
  error?: string
  onChange: (patch: Partial<FormFieldConfig>) => void
  onMove: (to: number) => void
  onRemove: () => void
}

function SortableField({ field, index, total, error, onChange, onMove, onRemove }: SortableFieldProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: field.id })
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn("rounded-xl border bg-surface p-3", isDragging && "z-10 border-primary/35", error && "border-[#4a1818]")}
    >
      <div className="mb-3 flex items-center gap-2">
        <button type="button" className="cursor-grab touch-none text-muted-foreground hover:text-foreground" aria-label="Arrastar campo" {...attributes} {...listeners}>
          <GripVertical className="size-4" />
        </button>
        <span className="num text-xs text-muted-foreground">#{index + 1}</span>
        <span className="truncate text-sm font-medium">{field.label || "Novo campo"}</span>
        <div className="ml-auto flex items-center gap-1">
          <Button type="button" variant="ghost" size="icon-xs" disabled={index === 0} onClick={() => onMove(index - 1)} aria-label="Mover para cima">
            <ArrowUp />
          </Button>
          <Button type="button" variant="ghost" size="icon-xs" disabled={index === total - 1} onClick={() => onMove(index + 1)} aria-label="Mover para baixo">
            <ArrowDown />
          </Button>
          <Button type="button" variant="ghost" size="icon-xs" className="text-danger" onClick={onRemove} aria-label="Remover campo">
            <Trash2 />
          </Button>
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <FormField label="Rótulo" required>
          <Input value={field.label} onChange={(e) => onChange({ label: e.target.value })} aria-invalid={!!error && !field.label} />
        </FormField>
        <FormField label="Tipo">
          <OptionSelect value={field.type} onChange={(v) => onChange({ type: v, options: v === "select" ? (field.options ?? ["Opção 1", "Opção 2"]) : field.options })} options={FIELD_TYPES} />
        </FormField>
        <FormField label="Chave no lead" hint="Ex.: name, whatsapp, email, company">
          <Input className="num" list="known-keys" value={field.key} onChange={(e) => onChange({ key: e.target.value.replace(/[^a-zA-Z0-9_]/g, "") })} />
          <datalist id="known-keys">
            {KNOWN_KEYS.map((k) => (
              <option key={k.value} value={k.value}>
                {k.label}
              </option>
            ))}
          </datalist>
        </FormField>
        <FormField label="Placeholder">
          <Input value={field.placeholder ?? ""} onChange={(e) => onChange({ placeholder: e.target.value })} />
        </FormField>
        {field.type === "select" && (
          <FormField label="Opções (uma por linha)" className="sm:col-span-2">
            <Textarea rows={3} value={(field.options ?? []).join("\n")} onChange={(e) => onChange({ options: e.target.value.split("\n") })} />
          </FormField>
        )}
        <label className="flex items-center gap-2 text-sm sm:col-span-2">
          <Switch checked={field.required} onCheckedChange={(v) => onChange({ required: v })} size="sm" />
          Obrigatório
        </label>
      </div>
      {error && <p className="mt-2 text-xs text-danger">{error}</p>}
    </div>
  )
}
