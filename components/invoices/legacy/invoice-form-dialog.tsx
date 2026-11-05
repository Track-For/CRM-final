"use client"

// Versão mock (Zustand) usada pela ficha do cliente e pelo financeiro enquanto clientes e cobranças não
// estão no banco. A tela de Notas fiscais usa a versão real em components/invoices/*.

import { useEffect } from "react"
import { Controller, useForm, useWatch } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { toast } from "sonner"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import { FormDialog } from "@/components/forms/form-dialog"
import { EntityCombobox } from "@/components/shared/entity-combobox"
import { FormField } from "@/components/shared/form-field"
import { MoneyInput } from "@/components/shared/money-input"
import { OptionSelect } from "@/components/shared/option-select"
import { InfoRow } from "@/components/shared/panel"
import { scheduleInvoiceIssue } from "@/components/finance/finance-actions"
import { newId, useClients, useCompany, useCrm } from "@/lib/data"
import { useEntityOptions } from "@/lib/data/options"
import { formatMoney } from "@/lib/format"
import { v } from "@/lib/validation"
import type { Invoice } from "@/types"

export const SERVICE_CODES = [
  { value: "1.05", label: "1.05 — Licenciamento e desenvolvimento de software" },
  { value: "1.03", label: "1.03 — Processamento, hospedagem e armazenamento de dados" },
  { value: "1.07", label: "1.07 — Suporte técnico em informática" },
  { value: "17.06", label: "17.06 — Propaganda e publicidade, gestão de mídia" },
]

const ISS_RATES = ["2", "3", "4", "5"].map((r) => ({ value: r, label: `${r}%` }))

const schema = z.object({
  clientId: v.required("Tomador"),
  serviceDescription: z.string().trim().min(10, "Descreva o serviço com pelo menos 10 caracteres"),
  serviceCode: v.required("Código do serviço"),
  issRate: z.string(),
  amount: v.money("Valor do serviço"),
  ir: z.number().min(0),
  pis: z.number().min(0),
  cofins: z.number().min(0),
  csll: z.number().min(0),
  inss: z.number().min(0),
  issRetido: z.boolean(),
})
type Values = z.infer<typeof schema>

export interface InvoiceDefaults {
  clientId?: string
  chargeId?: string
  amount?: number
  description?: string
}

interface InvoiceFormDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  defaults?: InvoiceDefaults
  /** Nota rejeitada sendo corrigida e reenviada. */
  invoice?: Invoice
}

export function InvoiceFormDialog({ open, onOpenChange, defaults, invoice }: InvoiceFormDialogProps) {
  const add = useCrm((s) => s.add)
  const update = useCrm((s) => s.update)
  const clients = useClients()
  const company = useCompany()
  const { clientOptions } = useEntityOptions()

  const initial = (): Values => ({
    clientId: invoice?.clientId ?? defaults?.clientId ?? "",
    serviceDescription: invoice?.serviceDescription ?? defaults?.description ?? "",
    serviceCode: invoice?.serviceCode ?? "1.05",
    issRate: String(invoice?.issRate ?? 5),
    amount: invoice?.amount ?? defaults?.amount ?? 0,
    ir: invoice?.retentions.ir ?? 0,
    pis: invoice?.retentions.pis ?? 0,
    cofins: invoice?.retentions.cofins ?? 0,
    csll: invoice?.retentions.csll ?? 0,
    inss: invoice?.retentions.inss ?? 0,
    issRetido: invoice?.retentions.issRetido ?? false,
  })
  const { control, handleSubmit, reset, formState } = useForm<Values>({ resolver: zodResolver(schema), defaultValues: initial() })
  const errors = formState.errors

  useEffect(() => {
    if (open) reset(initial())
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, invoice?.id, defaults?.chargeId])

  const values = useWatch({ control }) as Partial<Values>
  const amount = values.amount ?? 0
  const iss = (amount * Number(values.issRate ?? 5)) / 100
  const federal = (values.ir ?? 0) + (values.pis ?? 0) + (values.cofins ?? 0) + (values.csll ?? 0) + (values.inss ?? 0)
  const totalRet = federal + (values.issRetido ? iss : 0)
  const net = amount - totalRet
  const tomador = clients.find((c) => c.id === values.clientId)

  const onSubmit = handleSubmit((val) => {
    if (net <= 0) {
      toast.error("As retenções não podem ser maiores que o valor do serviço")
      return
    }
    const data = {
      clientId: val.clientId,
      serviceDescription: val.serviceDescription,
      serviceCode: val.serviceCode,
      issRate: Number(val.issRate),
      amount: val.amount,
      retentions: { ir: val.ir, pis: val.pis, cofins: val.cofins, csll: val.csll, inss: val.inss, issRetido: val.issRetido },
      status: "processando" as const,
      issuedAt: new Date().toISOString(),
      rejectionReason: undefined,
    }
    let id: string
    if (invoice) {
      update("invoices", invoice.id, data)
      id = invoice.id
    } else {
      id = newId("nfs")
      add("invoices", { id, number: null, chargeId: defaults?.chargeId, ...data })
    }
    toast.info("NFS-e enviada para a prefeitura", { description: "Processando..." })
    scheduleInvoiceIssue(id)
    onOpenChange(false)
  })

  const money = (name: "ir" | "pis" | "cofins" | "csll" | "inss", label: string) => (
    <FormField label={label}>
      <Controller control={control} name={name} render={({ field }) => <MoneyInput value={field.value} onChange={field.onChange} />} />
    </FormField>
  )

  return (
    <FormDialog open={open} onOpenChange={onOpenChange} title={invoice ? "Corrigir e reenviar NFS-e" : "Emitir NFS-e"} description="Nota fiscal de serviço eletrônica via Brasil NFe." onSubmit={onSubmit} submitLabel={invoice ? "Reenviar" : "Emitir nota"} size="xl">
      <div className="grid gap-5 lg:grid-cols-[1fr_300px]">
        <div className="space-y-4">
          <FormField label="Tomador" required error={errors.clientId?.message}>
            <Controller control={control} name="clientId" render={({ field }) => <EntityCombobox options={clientOptions} value={field.value} onChange={(id) => field.onChange(id ?? "")} allowClear={false} invalid={!!errors.clientId} placeholder="Selecione o cliente" />} />
          </FormField>
          <FormField label="Discriminação do serviço" required error={errors.serviceDescription?.message}>
            <Controller control={control} name="serviceDescription" render={({ field }) => <Textarea {...field} rows={3} aria-invalid={!!errors.serviceDescription} />} />
          </FormField>
          <div className="grid gap-4 sm:grid-cols-[1fr_120px]">
            <FormField label="Código do serviço" required>
              <Controller control={control} name="serviceCode" render={({ field }) => <OptionSelect value={field.value} onChange={field.onChange} options={SERVICE_CODES} />} />
            </FormField>
            <FormField label="Alíquota ISS">
              <Controller control={control} name="issRate" render={({ field }) => <OptionSelect value={field.value} onChange={field.onChange} options={ISS_RATES} />} />
            </FormField>
          </div>
          <FormField label="Valor do serviço" required error={errors.amount?.message}>
            <Controller control={control} name="amount" render={({ field }) => <MoneyInput value={field.value} onChange={field.onChange} aria-invalid={!!errors.amount} />} />
          </FormField>
          <div>
            <p className="mb-2 text-xs font-medium text-muted-foreground">Retenções federais</p>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {money("ir", "IR")}
              {money("pis", "PIS")}
              {money("cofins", "COFINS")}
              {money("csll", "CSLL")}
              {money("inss", "INSS")}
            </div>
          </div>
          <label className="flex items-center justify-between gap-3 rounded-lg border bg-surface p-3 text-sm">
            <span>
              ISS retido pelo tomador
              <span className="block text-xs text-muted-foreground">O cliente recolhe o ISS e desconta do pagamento</span>
            </span>
            <Controller control={control} name="issRetido" render={({ field }) => <Switch checked={field.value} onCheckedChange={field.onChange} />} />
          </label>
        </div>

        <aside className="h-fit rounded-xl border bg-surface p-4 text-sm lg:sticky lg:top-0">
          <p className="text-[10px] font-medium tracking-widest text-muted-foreground uppercase">Pré-visualização</p>
          <p className="mt-1 font-semibold">NFS-e — Prefeitura de Salvador</p>
          <div className="mt-3 space-y-3 border-t pt-3">
            <div>
              <p className="text-xs text-muted-foreground">Prestador</p>
              <p className="font-medium">{company.legalName}</p>
              <p className="num text-xs text-muted-foreground">{company.cnpj}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Tomador</p>
              <p className="font-medium">{tomador?.legalName ?? "—"}</p>
              <p className="num text-xs text-muted-foreground">{tomador?.document ?? ""}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Discriminação</p>
              <p className="line-clamp-4 text-xs">{values.serviceDescription || "—"}</p>
            </div>
          </div>
          <div className="mt-3 border-t pt-2">
            <InfoRow label="Valor do serviço" mono>{formatMoney(amount)}</InfoRow>
            <InfoRow label={`ISS (${values.issRate ?? 5}%)`} mono>{formatMoney(iss)}</InfoRow>
            <InfoRow label="Retenções" mono>{formatMoney(totalRet)}</InfoRow>
          </div>
          <div className="mt-2 flex items-center justify-between border-t pt-3">
            <span className="text-muted-foreground">Valor líquido</span>
            <span className={net < 0 ? "num text-lg font-semibold text-danger" : "num text-lg font-semibold text-primary"}>{formatMoney(net)}</span>
          </div>
        </aside>
      </div>
    </FormDialog>
  )
}
