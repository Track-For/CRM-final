"use client"

import { useEffect, useState, useTransition } from "react"
import { Controller, useForm, useWatch, type UseFormSetValue } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { format } from "date-fns"
import { Loader2, Search } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import { FormDialog } from "@/components/forms/form-dialog"
import { EntityCombobox } from "@/components/shared/entity-combobox"
import { FormField } from "@/components/shared/form-field"
import { MaskedInput, MoneyInput } from "@/components/shared/money-input"
import { OptionSelect } from "@/components/shared/option-select"
import { InfoRow } from "@/components/shared/panel"
import { StatusBadge } from "@/components/shared/status-badge"
import { ENVIRONMENT_LABEL, OTHER_SERVICE_ITEM, SALVADOR_IBGE, SERVICE_ITEMS, UF_OPTIONS, federalRetentions, lookupCep, normalizeText, serviceItemOptions } from "@/components/invoices/fiscal-meta"
import { issueInvoiceAction, retryInvoiceAction, type FiscalSettingsView, type InvoiceView, type IssueInvoiceInput } from "@/lib/fiscal/actions"
import { useClients, useCompany } from "@/lib/data"
import { useEntityOptions } from "@/lib/data/options"
import { formatMoney, maskCep, maskDocument, maskPhone, onlyDigits } from "@/lib/format"
import { v } from "@/lib/validation"
import type { Client } from "@/types"

const digits = (n: number, msg: string) => z.string().trim().refine((s) => onlyDigits(s).length === n, msg)
const optionalText = z.string().trim()

const schema = z
  .object({
    clientId: v.required("Cliente"),
    document: v.cpfCnpj(),
    name: z.string().trim().min(2, "Nome ou razão social é obrigatório"),
    municipalRegistration: optionalText,
    email: z.string().trim().email("E-mail inválido").or(z.literal("")),
    phone: optionalText,
    cep: digits(8, "CEP deve ter 8 dígitos"),
    street: v.required("Logradouro"),
    number: v.required("Número"),
    complement: optionalText,
    district: v.required("Bairro"),
    city: v.required("Cidade"),
    uf: z.string().length(2, "Selecione a UF"),
    ibgeCode: digits(7, "Código IBGE deve ter 7 dígitos"),
    serviceDescription: z.string().trim().min(10, "Descreva o serviço com pelo menos 10 caracteres").max(2000, "Máximo de 2000 caracteres"),
    serviceItemChoice: v.required("Item da LC 116"),
    serviceItemCustom: optionalText,
    municipalTaxCode: optionalText,
    cnae: optionalText,
    nbs: optionalText,
    competenceDate: v.date("Competência"),
    amount: v.money("Valor do serviço"),
    issRate: z
      .string()
      .trim()
      .refine((s) => {
        const n = Number(s.replace(",", "."))
        return s !== "" && Number.isFinite(n) && n >= 0 && n <= 5
      }, "Alíquota entre 0 e 5%"),
    issRetained: z.boolean(),
    ir: z.number().min(0),
    pis: z.number().min(0),
    cofins: z.number().min(0),
    csll: z.number().min(0),
    inss: z.number().min(0),
  })
  .superRefine((val, ctx) => {
    if (val.serviceItemChoice === OTHER_SERVICE_ITEM && onlyDigits(val.serviceItemCustom).length !== 6) {
      ctx.addIssue({ code: "custom", path: ["serviceItemCustom"], message: "Informe o item com 6 dígitos (ex.: 010701)" })
    }
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
  settings: FiscalSettingsView
  defaults?: InvoiceDefaults
  /** Nota rejeitada sendo corrigida e reenviada. */
  invoice?: InvoiceView | null
  onSaved?: (invoice: InvoiceView) => void
}

const parseRate = (s: string) => Number(s.replace(",", "."))
const rateText = (n: number | null | undefined) => (n == null ? "" : String(n).replace(".", ","))

function itemChoice(code: string | null | undefined): { choice: string; custom: string } {
  if (!code) return { choice: "", custom: "" }
  return SERVICE_ITEMS.some((o) => o.value === code) ? { choice: code, custom: "" } : { choice: OTHER_SERVICE_ITEM, custom: code }
}

/** Preenche o tomador a partir do cadastro do cliente (tudo continua editável). */
function fillFromClient(client: Client, setValue: UseFormSetValue<Values>) {
  const opts = { shouldDirty: true, shouldValidate: false }
  const a = client.address
  setValue("document", maskDocument(client.document), opts)
  setValue("name", client.legalName || client.name, opts)
  setValue("municipalRegistration", client.municipalRegistration ?? "", opts)
  setValue("email", client.email ?? "", opts)
  setValue("phone", client.whatsapp ? maskPhone(client.whatsapp) : "", opts)
  setValue("cep", maskCep(a?.zip ?? ""), opts)
  setValue("street", a?.street ?? "", opts)
  setValue("number", a?.number ?? "", opts)
  setValue("complement", a?.complement ?? "", opts)
  setValue("district", a?.district ?? "", opts)
  setValue("city", a?.city ?? "", opts)
  setValue("uf", (a?.state ?? "").toUpperCase(), opts)
  setValue("ibgeCode", normalizeText(a?.city) === "salvador" ? SALVADOR_IBGE : "", opts)
}

export function InvoiceFormDialog({ open, onOpenChange, settings, defaults, invoice, onSaved }: InvoiceFormDialogProps) {
  const clients = useClients()
  const company = useCompany()
  const { clientOptions } = useEntityOptions()
  const [pending, startTransition] = useTransition()
  const [cepLoading, setCepLoading] = useState(false)
  const retry = Boolean(invoice)

  const initial = (): Values => {
    const t = invoice?.tomador
    const item = itemChoice(invoice?.serviceItem ?? settings.defaultServiceItem)
    const r = invoice?.retentions
    return {
      clientId: invoice?.clientId ?? defaults?.clientId ?? "",
      document: t ? maskDocument(t.document) : "",
      name: t?.name ?? "",
      municipalRegistration: t?.municipalRegistration ?? "",
      email: t?.email ?? "",
      phone: t?.phone ? maskPhone(t.phone) : "",
      cep: t ? maskCep(t.address.cep) : "",
      street: t?.address.street ?? "",
      number: t?.address.number ?? "",
      complement: t?.address.complement ?? "",
      district: t?.address.district ?? "",
      city: t?.address.city ?? "",
      uf: t?.address.uf ?? "",
      ibgeCode: t?.address.ibgeCode ?? "",
      serviceDescription: invoice?.serviceDescription ?? defaults?.description ?? "",
      serviceItemChoice: item.choice,
      serviceItemCustom: item.custom,
      municipalTaxCode: invoice?.municipalTaxCode ?? settings.defaultMunicipalTaxCode ?? "",
      cnae: invoice?.cnae ?? settings.defaultCnae ?? "",
      nbs: invoice?.nbs ?? settings.defaultNbs ?? "",
      competenceDate: invoice?.competenceDate?.slice(0, 10) ?? format(new Date(), "yyyy-MM-dd"),
      amount: invoice?.amount ?? defaults?.amount ?? 0,
      issRate: rateText(invoice?.issRate ?? settings.defaultIssRate),
      issRetained: invoice?.issRetained ?? false,
      ir: r?.ir ?? 0,
      pis: r?.pis ?? 0,
      cofins: r?.cofins ?? 0,
      csll: r?.csll ?? 0,
      inss: r?.inss ?? 0,
    }
  }

  const { control, handleSubmit, reset, setValue, getValues, formState } = useForm<Values>({ resolver: zodResolver(schema), defaultValues: initial() })
  const errors = formState.errors

  useEffect(() => {
    if (!open) return
    reset(initial())
    // Vindo de um cliente (ficha ou cobrança) sem nota anterior: pré-preenche o tomador.
    if (!invoice && defaults?.clientId) {
      const c = clients.find((x) => x.id === defaults.clientId)
      if (c) fillFromClient(c, setValue)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, invoice?.id, defaults?.clientId, defaults?.chargeId])

  const values = useWatch({ control }) as Partial<Values>
  const amount = values.amount ?? 0
  const rate = parseRate(values.issRate ?? "0") || 0
  const iss = (amount * rate) / 100
  const federal = federalRetentions({ ir: values.ir, pis: values.pis, cofins: values.cofins, csll: values.csll, inss: values.inss })
  const totalRet = federal + (values.issRetained ? iss : 0)
  const net = amount - totalRet
  const docDigits = onlyDigits(values.document ?? "")

  const runCep = async (cep: string, mode: "fill" | "ibge") => {
    if (onlyDigits(cep).length !== 8) return
    setCepLoading(true)
    const found = await lookupCep(cep)
    setCepLoading(false)
    if (!found) {
      if (mode === "fill") toast.error("CEP não encontrado", { description: "Preencha o endereço manualmente." })
      return
    }
    const opts = { shouldDirty: true, shouldValidate: formState.isSubmitted }
    if (mode === "fill") {
      if (found.street) setValue("street", found.street, opts)
      if (found.district) setValue("district", found.district, opts)
      setValue("city", found.city, opts)
      setValue("uf", found.uf, opts)
    }
    if (found.ibge) setValue("ibgeCode", found.ibge, opts)
  }

  const onClientChange = (id: string) => {
    const c = clients.find((x) => x.id === id)
    if (!c) return
    fillFromClient(c, setValue)
    if (normalizeText(c.address?.city) !== "salvador") void runCep(c.address?.zip ?? "", "ibge")
  }

  const onSubmit = handleSubmit((val) => {
    if (net <= 0) {
      toast.error("As retenções não podem ser maiores que o valor do serviço")
      return
    }
    const doc = onlyDigits(val.document)
    const input: IssueInvoiceInput = {
      clientId: val.clientId,
      chargeId: invoice?.chargeId ?? defaults?.chargeId ?? undefined,
      tomador: {
        documentType: doc.length === 14 ? "cnpj" : "cpf",
        document: doc,
        name: val.name,
        municipalRegistration: val.municipalRegistration || undefined,
        email: val.email || undefined,
        phone: onlyDigits(val.phone) || undefined,
        address: {
          cep: onlyDigits(val.cep),
          street: val.street,
          number: val.number,
          complement: val.complement || undefined,
          district: val.district,
          city: val.city,
          uf: val.uf,
          ibgeCode: onlyDigits(val.ibgeCode),
        },
      },
      serviceDescription: val.serviceDescription,
      serviceItem: val.serviceItemChoice === OTHER_SERVICE_ITEM ? onlyDigits(val.serviceItemCustom) : val.serviceItemChoice,
      municipalTaxCode: val.municipalTaxCode || undefined,
      cnae: onlyDigits(val.cnae) || undefined,
      nbs: val.nbs || undefined,
      amount: val.amount,
      issRate: parseRate(val.issRate),
      issRetained: val.issRetained,
      retentions: { ir: val.ir, pis: val.pis, cofins: val.cofins, csll: val.csll, inss: val.inss },
      competenceDate: val.competenceDate,
    }

    startTransition(async () => {
      let res: { ok: boolean; error?: string; invoice?: InvoiceView }
      try {
        res = invoice ? await retryInvoiceAction(invoice.id, input) : await issueInvoiceAction(input)
      } catch {
        res = { ok: false, error: "Não foi possível falar com o servidor. Tente de novo." }
      }
      if (res.invoice) onSaved?.(res.invoice)
      if (!res.ok && !res.invoice) {
        toast.error(res.error ?? "Não foi possível emitir a nota")
        return
      }
      const inv = res.invoice
      if (inv?.status === "emitida") toast.success(inv.number ? `NFS-e ${inv.number} emitida` : "NFS-e emitida", { description: "A prefeitura autorizou a nota." })
      else if (inv?.status === "rejeitada") toast.error("Nota rejeitada", { description: inv.errorMessage ?? res.error ?? "Veja o motivo e corrija." })
      else toast.info("NFS-e enviada para a prefeitura", { description: "Aguardando processamento. O status atualiza sozinho." })
      onOpenChange(false)
    })
  })

  const money = (name: "ir" | "pis" | "cofins" | "csll" | "inss", label: string) => (
    <FormField label={label}>
      <Controller control={control} name={name} render={({ field }) => <MoneyInput value={field.value} onChange={field.onChange} aria-label={label} />} />
    </FormField>
  )

  const text = (name: keyof Values, label: string, opts: { required?: boolean; placeholder?: string; className?: string; inputMode?: "numeric" | "email" | "text"; hint?: string; onBlur?: () => void } = {}) => (
    <FormField label={label} required={opts.required} error={errors[name]?.message} hint={opts.hint} htmlFor={`nf-${name}`} className={opts.className}>
      <Controller
        control={control}
        name={name}
        render={({ field }) => (
          <Input
            id={`nf-${name}`}
            name={field.name}
            ref={field.ref}
            value={String(field.value ?? "")}
            onChange={field.onChange}
            onBlur={() => {
              field.onBlur()
              opts.onBlur?.()
            }}
            placeholder={opts.placeholder}
            inputMode={opts.inputMode}
            aria-invalid={!!errors[name]}
            className={opts.inputMode === "numeric" ? "num" : undefined}
          />
        )}
      />
    </FormField>
  )

  return (
    <FormDialog
      open={open}
      onOpenChange={(o) => !pending && onOpenChange(o)}
      title={retry ? "Corrigir e reenviar NFS-e" : "Emitir NFS-e"}
      description={`Nota fiscal de serviço via Brasil NFe · ${ENVIRONMENT_LABEL[settings.environment]}${settings.environment === "homologacao" ? " (sem valor fiscal)" : ""}`}
      onSubmit={onSubmit}
      submitLabel={pending ? "Enviando..." : retry ? "Reenviar" : "Emitir nota"}
      submitting={pending}
      size="xl"
    >
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_260px]">
        <div className="min-w-0 space-y-6">
          <Section title="Tomador">
            <FormField label="Cliente" required error={errors.clientId?.message}>
              <Controller
                control={control}
                name="clientId"
                render={({ field }) => (
                  <EntityCombobox
                    options={clientOptions}
                    value={field.value}
                    onChange={(id) => {
                      field.onChange(id ?? "")
                      if (id) onClientChange(id)
                    }}
                    allowClear={false}
                    invalid={!!errors.clientId}
                    placeholder="Selecione o cliente"
                  />
                )}
              />
            </FormField>
            <p className="-mt-2 text-xs text-muted-foreground">Os dados abaixo vêm do cadastro do cliente e podem ser ajustados só para esta nota.</p>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <FormField label={docDigits.length > 11 ? "CNPJ" : "CPF/CNPJ"} required error={errors.document?.message} htmlFor="nf-document">
                <Controller control={control} name="document" render={({ field }) => <MaskedInput id="nf-document" className="num" mask={maskDocument} value={field.value} onChange={field.onChange} onBlur={field.onBlur} aria-invalid={!!errors.document} placeholder="000.000.000-00" />} />
              </FormField>
              {text("municipalRegistration", "Inscrição municipal", { inputMode: "numeric", hint: "Opcional" })}
              {text("name", docDigits.length > 11 ? "Razão social" : "Nome / razão social", { required: true, className: "sm:col-span-2" })}
              {text("email", "E-mail do tomador", { inputMode: "email", hint: settings.sendEmailToClient ? "O Brasil NFe envia a nota para este e-mail" : "Opcional" })}
              <FormField label="Telefone" htmlFor="nf-phone" hint="Opcional">
                <Controller control={control} name="phone" render={({ field }) => <MaskedInput id="nf-phone" className="num" mask={maskPhone} value={field.value} onChange={field.onChange} placeholder="(71) 90000-0000" />} />
              </FormField>
            </div>
          </Section>

          <Section title="Endereço do tomador">
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-6">
              <FormField label="CEP" required error={errors.cep?.message} htmlFor="nf-cep" className="col-span-2 sm:col-span-2">
                <Controller
                  control={control}
                  name="cep"
                  render={({ field }) => (
                    <div className="flex items-center gap-1">
                      <MaskedInput
                        id="nf-cep"
                        className="num"
                        mask={maskCep}
                        value={field.value}
                        onChange={(val) => {
                          const prev = onlyDigits(field.value)
                          field.onChange(val)
                          if (onlyDigits(val).length === 8 && onlyDigits(val) !== prev) void runCep(val, "fill")
                        }}
                        aria-invalid={!!errors.cep}
                        placeholder="00000-000"
                      />
                      <Button type="button" variant="outline" size="icon" onClick={() => void runCep(getValues("cep"), "fill")} disabled={cepLoading} aria-label="Buscar CEP">
                        {cepLoading ? <Loader2 className="animate-spin" /> : <Search />}
                      </Button>
                    </div>
                  )}
                />
              </FormField>
              {text("street", "Logradouro", { required: true, className: "col-span-2 sm:col-span-4" })}
              {text("number", "Número", { required: true, className: "sm:col-span-2", placeholder: "S/N" })}
              {text("complement", "Complemento", { className: "sm:col-span-4" })}
              {text("district", "Bairro", { required: true, className: "col-span-2 sm:col-span-3" })}
              {text("city", "Cidade", {
                required: true,
                className: "col-span-2 sm:col-span-3",
                onBlur: () => {
                  if (normalizeText(getValues("city")) === "salvador" && !onlyDigits(getValues("ibgeCode"))) setValue("ibgeCode", SALVADOR_IBGE, { shouldDirty: true })
                },
              })}
              <FormField label="UF" required error={errors.uf?.message} className="sm:col-span-2">
                <Controller control={control} name="uf" render={({ field }) => <OptionSelect value={field.value} onChange={field.onChange} options={UF_OPTIONS} placeholder="UF" invalid={!!errors.uf} />} />
              </FormField>
              {text("ibgeCode", "Código IBGE", { required: true, inputMode: "numeric", className: "sm:col-span-4", placeholder: "7 dígitos", hint: "Preenchido pela busca do CEP" })}
            </div>
          </Section>

          <Section title="Serviço">
            <FormField label="Discriminação do serviço" required error={errors.serviceDescription?.message} htmlFor="nf-desc">
              <Controller control={control} name="serviceDescription" render={({ field }) => <Textarea id="nf-desc" {...field} rows={3} aria-invalid={!!errors.serviceDescription} />} />
            </FormField>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <FormField label="Item da LC 116" required error={errors.serviceItemChoice?.message} className="sm:col-span-2">
                <Controller control={control} name="serviceItemChoice" render={({ field }) => <OptionSelect value={field.value} onChange={field.onChange} options={serviceItemOptions()} invalid={!!errors.serviceItemChoice} />} />
              </FormField>
              {values.serviceItemChoice === OTHER_SERVICE_ITEM && text("serviceItemCustom", "Código do item (6 dígitos)", { required: true, inputMode: "numeric", placeholder: "010701", className: "sm:col-span-2", hint: "Item e subitem sem ponto + desdobro. Ex.: 1.07 = 010701" })}
              {text("municipalTaxCode", "Código de tributação municipal", { hint: "Opcional, depende da prefeitura" })}
              {text("cnae", "CNAE", { inputMode: "numeric", hint: "Opcional" })}
              {text("nbs", "NBS", { inputMode: "numeric", hint: "Opcional" })}
              <FormField label="Competência" required error={errors.competenceDate?.message} htmlFor="nf-comp">
                <Controller control={control} name="competenceDate" render={({ field }) => <Input id="nf-comp" type="date" className="num" {...field} aria-invalid={!!errors.competenceDate} />} />
              </FormField>
            </div>
          </Section>

          <Section title="Valores e impostos">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-[1fr_140px]">
              <FormField label="Valor do serviço" required error={errors.amount?.message}>
                <Controller control={control} name="amount" render={({ field }) => <MoneyInput value={field.value} onChange={field.onChange} aria-invalid={!!errors.amount} aria-label="Valor do serviço" />} />
              </FormField>
              <FormField label="Alíquota ISS (%)" required error={errors.issRate?.message} htmlFor="nf-iss">
                <Controller control={control} name="issRate" render={({ field }) => <Input id="nf-iss" inputMode="decimal" className="num" value={field.value} onChange={(e) => field.onChange(e.target.value.replace(/[^\d.,]/g, ""))} onBlur={field.onBlur} aria-invalid={!!errors.issRate} />} />
              </FormField>
            </div>
            <label className="flex items-center justify-between gap-3 rounded-lg border bg-surface p-3 text-sm">
              <span>
                ISS retido pelo tomador
                <span className="block text-xs text-muted-foreground">O cliente recolhe o ISS e desconta do pagamento</span>
              </span>
              <Controller control={control} name="issRetained" render={({ field }) => <Switch checked={field.value} onCheckedChange={field.onChange} />} />
            </label>
            <div>
              <p className="mb-2 text-xs font-medium text-muted-foreground">Retenções federais (R$)</p>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {money("ir", "IR")}
                {money("pis", "PIS")}
                {money("cofins", "COFINS")}
                {money("csll", "CSLL")}
                {money("inss", "INSS")}
              </div>
            </div>
          </Section>
        </div>

        <aside className="h-fit rounded-xl border bg-surface p-4 text-sm lg:sticky lg:top-0">
          <div className="flex items-center justify-between gap-2">
            <p className="text-[10px] font-medium tracking-widest text-muted-foreground uppercase">Pré-visualização</p>
            <StatusBadge tone={settings.environment === "producao" ? "success" : "warning"}>{ENVIRONMENT_LABEL[settings.environment]}</StatusBadge>
          </div>
          <p className="mt-1 font-semibold">
            NFS-e — {settings.municipalityName || "Prefeitura"}
            {settings.uf ? `/${settings.uf}` : ""}
          </p>
          <div className="mt-3 space-y-3 border-t pt-3">
            <div>
              <p className="text-xs text-muted-foreground">Prestador</p>
              <p className="font-medium">{company.legalName}</p>
              <p className="text-xs text-muted-foreground">Empresa do token no Brasil NFe</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Tomador</p>
              <p className="font-medium break-words">{values.name || "—"}</p>
              <p className="num text-xs text-muted-foreground">{values.document ?? ""}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Serviço</p>
              <p className="text-xs">{SERVICE_ITEMS.find((s) => s.value === values.serviceItemChoice)?.label ?? (values.serviceItemCustom || "—")}</p>
              <p className="mt-1 line-clamp-4 text-xs text-muted-foreground">{values.serviceDescription || "—"}</p>
            </div>
          </div>
          <div className="mt-3 border-t pt-2">
            <InfoRow label="Valor do serviço" mono>
              {formatMoney(amount)}
            </InfoRow>
            <InfoRow label={`ISS (${rateText(rate)}%)`} mono>
              {formatMoney(iss)}
            </InfoRow>
            <InfoRow label="Retenções" mono>
              {formatMoney(totalRet)}
            </InfoRow>
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

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <fieldset className="min-w-0 space-y-4">
      <legend className="mb-3 text-[10px] font-medium tracking-widest text-muted-foreground uppercase">{title}</legend>
      {children}
    </fieldset>
  )
}
