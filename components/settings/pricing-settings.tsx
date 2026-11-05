"use client"

import { useEffect, useState } from "react"
import { Controller, useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { Pencil, Plus, Trash2 } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import { FormDialog } from "@/components/forms/form-dialog"
import { FormField, FormGrid } from "@/components/shared/form-field"
import { MoneyInput } from "@/components/shared/money-input"
import { OptionSelect } from "@/components/shared/option-select"
import { Panel } from "@/components/shared/panel"
import { StatusBadge } from "@/components/shared/status-badge"
import { PROJECT_TYPE_LABEL, toOptions } from "@/lib/constants"
import { newId, useAddons, useCatalog, useCrm, useHostingPlans, usePricingRules } from "@/lib/data"
import { formatDays, formatMoney } from "@/lib/format"
import { v } from "@/lib/validation"
import type { CatalogItem, PricingRules } from "@/types"

/* ----------------------------- Catálogo ----------------------------- */

const itemSchema = z.object({
  name: v.required("Nome"),
  description: z.string(),
  projectType: v.select(["app", "sistema", "site", "anuncio", "outros"], "o tipo"),
  basePrice: v.money("Preço"),
  monthlyFee: z.number().min(0),
  firstMonthPrice: z.number().min(0),
  deadline: z.string().refine((s) => s === "" || (/^\d+$/.test(s) && Number(s) > 0), "Informe um número de dias ou deixe vazio"),
  priceFrom: z.boolean(),
  includedPages: z.number({ error: "Informe um número" }).int("Use um número inteiro").min(0, "Não pode ser negativo"),
  active: z.boolean(),
})
type ItemValues = z.infer<typeof itemSchema>

function CatalogItemDialog({ item, open, onOpenChange }: { item?: CatalogItem; open: boolean; onOpenChange: (o: boolean) => void }) {
  const add = useCrm((s) => s.add)
  const update = useCrm((s) => s.update)
  const toValues = (): ItemValues => ({
    name: item?.name ?? "",
    description: item?.description ?? "",
    projectType: item?.projectType ?? "site",
    basePrice: item?.basePrice ?? 0,
    monthlyFee: item?.monthlyFee ?? 0,
    firstMonthPrice: item?.firstMonthPrice ?? 0,
    deadline: item?.deadlineDays != null ? String(item.deadlineDays) : "",
    priceFrom: item?.priceFrom ?? false,
    includedPages: item?.includedPages ?? 1,
    active: item?.active ?? true,
  })
  const { register, control, handleSubmit, reset, formState } = useForm<ItemValues>({ resolver: zodResolver(itemSchema), defaultValues: toValues() })
  const e = formState.errors

  useEffect(() => {
    if (open) reset(toValues())
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, item?.id])

  const onSubmit = handleSubmit((vals) => {
    const data: Omit<CatalogItem, "id"> = {
      name: vals.name,
      description: vals.description,
      projectType: vals.projectType,
      basePrice: vals.basePrice,
      monthlyFee: vals.monthlyFee,
      firstMonthPrice: vals.firstMonthPrice || undefined,
      deadlineDays: vals.deadline ? Number(vals.deadline) : null,
      priceFrom: vals.priceFrom,
      includedPages: vals.includedPages,
      active: vals.active,
    }
    if (item) update("catalog", item.id, data)
    else add("catalog", { id: newId("cat"), ...data })
    toast.success(item ? "Item atualizado" : "Item adicionado ao catálogo")
    onOpenChange(false)
  })

  return (
    <FormDialog open={open} onOpenChange={onOpenChange} title={item ? "Editar item do catálogo" : "Novo item do catálogo"} onSubmit={onSubmit}>
      <FormGrid>
        <FormField label="Nome" required error={e.name?.message} className="sm:col-span-2">
          <Input {...register("name")} aria-invalid={!!e.name} />
        </FormField>
        <FormField label="Descrição" className="sm:col-span-2">
          <Textarea rows={2} {...register("description")} />
        </FormField>
        <FormField label="Tipo de projeto" required>
          <Controller control={control} name="projectType" render={({ field }) => <OptionSelect value={field.value} onChange={field.onChange} options={toOptions(PROJECT_TYPE_LABEL)} />} />
        </FormField>
        <FormField label="Prazo (dias)" error={e.deadline?.message} hint="Vazio = a combinar">
          <Input inputMode="numeric" className="num" {...register("deadline")} placeholder="Ex.: 15" />
        </FormField>
        <FormField label="Preço" required error={e.basePrice?.message}>
          <Controller control={control} name="basePrice" render={({ field }) => <MoneyInput value={field.value} onChange={field.onChange} />} />
        </FormField>
        <FormField label="Mensalidade">
          <Controller control={control} name="monthlyFee" render={({ field }) => <MoneyInput value={field.value} onChange={field.onChange} />} />
        </FormField>
        <FormField label="Valor do 1º mês" hint="Para recorrentes (ex.: tráfego). Zero = não usa">
          <Controller control={control} name="firstMonthPrice" render={({ field }) => <MoneyInput value={field.value} onChange={field.onChange} />} />
        </FormField>
        <FormField label="Páginas incluídas" error={e.includedPages?.message}>
          <Input type="number" min={0} className="num" {...register("includedPages", { valueAsNumber: true })} />
        </FormField>
        <label className="flex items-center gap-2 text-sm">
          <Controller control={control} name="priceFrom" render={({ field }) => <Switch checked={field.value} onCheckedChange={field.onChange} />} />
          Preço &ldquo;a partir de&rdquo;
        </label>
        <label className="flex items-center gap-2 text-sm">
          <Controller control={control} name="active" render={({ field }) => <Switch checked={field.value} onCheckedChange={field.onChange} />} />
          Ativo no orçamento
        </label>
      </FormGrid>
    </FormDialog>
  )
}

function CatalogPanel() {
  const catalog = useCatalog()
  const remove = useCrm((s) => s.remove)
  const [editing, setEditing] = useState<CatalogItem | undefined>()
  const [open, setOpen] = useState(false)

  return (
    <Panel
      title="Catálogo de projetos"
      description="Base do formulário de precificação em Orçamentos."
      actions={
        <Button
          size="sm"
          onClick={() => {
            setEditing(undefined)
            setOpen(true)
          }}
        >
          <Plus /> Item
        </Button>
      }
      contentClassName="p-0"
    >
      <div className="divide-y">
        {catalog.map((c) => (
          <div key={c.id} className="flex flex-col gap-2 p-4 sm:flex-row sm:items-center">
            <div className="min-w-0 flex-1">
              <p className="flex flex-wrap items-center gap-2 font-medium">
                {c.name}
                {!c.active && <StatusBadge>Inativo</StatusBadge>}
              </p>
              <p className="truncate text-xs text-muted-foreground">
                {PROJECT_TYPE_LABEL[c.projectType]} · {c.description}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
              <span className="num font-medium text-primary">
                {c.priceFrom && <span className="font-sans text-xs text-muted-foreground">a partir de </span>}
                {c.firstMonthPrice ? `${formatMoney(c.firstMonthPrice)} no 1º mês` : formatMoney(c.basePrice)}
              </span>
              <span className="num text-muted-foreground">{c.monthlyFee ? `+ ${formatMoney(c.monthlyFee)}/mês` : "sem mensalidade"}</span>
              <span className="num text-muted-foreground">{formatDays(c.deadlineDays)}</span>
              <div className="flex gap-1">
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => {
                    setEditing(c)
                    setOpen(true)
                  }}
                  aria-label="Editar"
                >
                  <Pencil />
                </Button>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  className="text-danger"
                  onClick={() => {
                    remove("catalog", c.id)
                    toast.success("Item removido do catálogo")
                  }}
                  aria-label="Remover"
                >
                  <Trash2 />
                </Button>
              </div>
            </div>
          </div>
        ))}
      </div>
      <CatalogItemDialog item={editing} open={open} onOpenChange={setOpen} />
    </Panel>
  )
}

/* -------------------------- Adicionais / Planos -------------------------- */

function AddonsPanel() {
  const addons = useAddons()
  const add = useCrm((s) => s.add)
  const update = useCrm((s) => s.update)
  const remove = useCrm((s) => s.remove)
  return (
    <Panel
      title="Adicionais do escopo"
      description="Checkboxes com valor no passo de escopo."
      actions={
        <Button size="sm" variant="outline" onClick={() => add("addons", { id: newId("add"), name: "Novo adicional", price: 500, active: true })}>
          <Plus /> Adicional
        </Button>
      }
    >
      <div className="space-y-2">
        {addons.map((a) => (
          <div key={a.id} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 sm:grid-cols-[minmax(0,1fr)_150px_auto_auto]">
            <Input defaultValue={a.name} onBlur={(e) => e.target.value.trim() && e.target.value !== a.name && update("addons", a.id, { name: e.target.value.trim() })} aria-label="Nome do adicional" />
            <div className="order-3 col-span-1 sm:order-none">
              <MoneyInput value={a.price} onChange={(price) => update("addons", a.id, { price })} aria-label="Preço" />
            </div>
            <Switch checked={a.active} onCheckedChange={(active) => update("addons", a.id, { active })} aria-label="Ativo" />
            <Button variant="ghost" size="icon-sm" className="order-4 text-danger sm:order-none" onClick={() => remove("addons", a.id)} aria-label="Remover">
              <Trash2 />
            </Button>
          </div>
        ))}
      </div>
    </Panel>
  )
}

function PlansPanel() {
  const plans = useHostingPlans()
  const add = useCrm((s) => s.add)
  const update = useCrm((s) => s.update)
  const remove = useCrm((s) => s.remove)
  return (
    <Panel
      title="Planos de mensalidade"
      description="Hospedagem e manutenção oferecidos no orçamento."
      actions={
        <Button size="sm" variant="outline" onClick={() => add("hostingPlans", { id: newId("plan"), name: "Novo plano", monthly: 250, description: "" })}>
          <Plus /> Plano
        </Button>
      }
    >
      <div className="space-y-3">
        {plans.map((p) => (
          <div key={p.id} className="grid gap-2 rounded-lg border bg-surface p-3 sm:grid-cols-[minmax(0,1fr)_150px_auto]">
            <Input defaultValue={p.name} onBlur={(e) => e.target.value.trim() && update("hostingPlans", p.id, { name: e.target.value.trim() })} aria-label="Nome do plano" />
            <MoneyInput value={p.monthly} onChange={(monthly) => update("hostingPlans", p.id, { monthly })} aria-label="Valor mensal" />
            <Button variant="ghost" size="icon" className="text-danger" onClick={() => remove("hostingPlans", p.id)} aria-label="Remover">
              <Trash2 />
            </Button>
            <Input className="sm:col-span-3" defaultValue={p.description} placeholder="O que está incluso" onBlur={(e) => update("hostingPlans", p.id, { description: e.target.value })} aria-label="Descrição" />
          </div>
        ))}
      </div>
    </Panel>
  )
}

/* ------------------------------- Regras ------------------------------- */

const rulesSchema = z.object({
  minPrice: v.money("Preço mínimo"),
  expressPercent: z.number({ error: "Informe um percentual" }).min(0, "Mínimo 0%").max(200, "Máximo 200%"),
  cashDiscountPercent: z.number({ error: "Informe um percentual" }).min(0, "Mínimo 0%").max(50, "Máximo 50%"),
  maxInstallments: z.number({ error: "Informe um número" }).int().min(1, "Mínimo 1 parcela").max(24, "Máximo 24 parcelas"),
  extraPagePrice: z.number().min(0),
  extraLanguagePercent: z.number({ error: "Informe um percentual" }).min(0).max(200, "Máximo 200%"),
  quoteValidityDays: z.number({ error: "Informe um número" }).int().min(1, "Mínimo 1 dia").max(120, "Máximo 120 dias"),
})

function RulesPanel() {
  const rules = usePricingRules()
  const setSingleton = useCrm((s) => s.setSingleton)
  const { register, control, handleSubmit, reset, formState } = useForm<PricingRules>({ resolver: zodResolver(rulesSchema), defaultValues: rules })
  const e = formState.errors
  const onSubmit = handleSubmit((values) => {
    setSingleton("pricingRules", values)
    reset(values)
    toast.success("Regras de precificação salvas")
  })
  const pct = (name: "expressPercent" | "cashDiscountPercent" | "extraLanguagePercent") => (
    <div className="relative">
      <Input type="number" className="num pr-7" {...register(name, { valueAsNumber: true })} />
      <span className="pointer-events-none absolute top-1/2 right-2.5 -translate-y-1/2 text-xs text-muted-foreground">%</span>
    </div>
  )
  return (
    <form onSubmit={onSubmit} noValidate>
      <Panel
        title="Regras de precificação"
        description="Aplicadas em tempo real no resumo do orçamento."
        actions={
          <Button type="submit" size="sm" disabled={!formState.isDirty}>
            Salvar
          </Button>
        }
      >
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <FormField label="Preço mínimo do projeto" error={e.minPrice?.message} hint="Alerta abaixo deste valor">
            <Controller control={control} name="minPrice" render={({ field }) => <MoneyInput value={field.value} onChange={field.onChange} />} />
          </FormField>
          <FormField label="Acréscimo do prazo expresso" error={e.expressPercent?.message}>
            {pct("expressPercent")}
          </FormField>
          <FormField label="Desconto à vista" error={e.cashDiscountPercent?.message}>
            {pct("cashDiscountPercent")}
          </FormField>
          <FormField label="Máximo de parcelas sem juros" error={e.maxInstallments?.message}>
            <Input type="number" className="num" {...register("maxInstallments", { valueAsNumber: true })} />
          </FormField>
          <FormField label="Valor por página extra" error={e.extraPagePrice?.message}>
            <Controller control={control} name="extraPagePrice" render={({ field }) => <MoneyInput value={field.value} onChange={field.onChange} />} />
          </FormField>
          <FormField label="Acréscimo por idioma extra" error={e.extraLanguagePercent?.message}>
            {pct("extraLanguagePercent")}
          </FormField>
          <FormField label="Validade da proposta (dias)" error={e.quoteValidityDays?.message}>
            <Input type="number" className="num" {...register("quoteValidityDays", { valueAsNumber: true })} />
          </FormField>
        </div>
      </Panel>
    </form>
  )
}

export function PricingSettings() {
  return (
    <div className="space-y-6">
      <RulesPanel />
      <CatalogPanel />
      <div className="grid gap-6 xl:grid-cols-2">
        <AddonsPanel />
        <PlansPanel />
      </div>
    </div>
  )
}
