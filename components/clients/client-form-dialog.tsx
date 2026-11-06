"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { Controller, useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { toast } from "sonner"
import { Input } from "@/components/ui/input"
import { FormDialog } from "@/components/forms/form-dialog"
import { FormField, FormGrid } from "@/components/shared/form-field"
import { MaskedInput } from "@/components/shared/money-input"
import { OptionSelect } from "@/components/shared/option-select"
import { newId, useCrm } from "@/lib/data"
import { useEntityOptions } from "@/lib/data/options"
import { maskCep, maskDocument, maskPhone, onlyDigits } from "@/lib/format"
import { saveClientAndSyncAsaasAction } from "@/lib/boleto/customer-actions"
import { v } from "@/lib/validation"
import type { Client } from "@/types"

const UF = ["AC", "AL", "AM", "AP", "BA", "CE", "DF", "ES", "GO", "MA", "MG", "MS", "MT", "PA", "PB", "PE", "PI", "PR", "RJ", "RN", "RO", "RR", "RS", "SC", "SE", "SP", "TO"]

const schema = z.object({
  name: v.required("Nome fantasia"),
  legalName: v.required("Razão social / nome completo"),
  document: v.cpfCnpj(),
  municipalRegistration: z.string().optional(),
  contactName: v.required("Contato"),
  whatsapp: v.phone(),
  email: v.emailOptional(),
  zip: z.string().refine((s) => onlyDigits(s).length === 8, "CEP inválido"),
  street: v.required("Logradouro"),
  number: v.required("Número"),
  complement: z.string().optional(),
  district: v.required("Bairro"),
  city: v.required("Cidade"),
  state: v.required("UF"),
  ownerId: v.required("Responsável"),
  status: v.select(["ativo", "inativo"], "o status"),
})
type Values = z.infer<typeof schema>

export function ClientFormDialog({ open, onOpenChange, client, onContinue }: { open: boolean; onOpenChange: (o: boolean) => void; client?: Client; onContinue?: (client: Client, syncAsaas: boolean) => void }) {
  const router = useRouter()
  const [syncAsaas, setSyncAsaas] = useState(!!onContinue || !client || !!client.asaasCustomerId)
  const [saving, setSaving] = useState(false)
  const [session, setSession] = useState(() => ({ open, clientId: client?.id, attemptId: newId("cli") }))
  if (session.open !== open || session.clientId !== client?.id) {
    setSession({ open, clientId: client?.id, attemptId: newId("cli") })
    if (open) setSyncAsaas(!!onContinue || !client || !!client.asaasCustomerId)
  }
  const add = useCrm((s) => s.add)
  const update = useCrm((s) => s.update)
  const currentUserId = useCrm((s) => s.currentUserId)
  const { userOptions } = useEntityOptions()

  const initial = (): Values => ({
    name: client?.name ?? "",
    legalName: client?.legalName ?? "",
    document: client?.document ?? "",
    municipalRegistration: client?.municipalRegistration ?? "",
    contactName: client?.contactName ?? "",
    whatsapp: client?.whatsapp ?? "",
    email: client?.email ?? "",
    zip: client?.address.zip ?? "",
    street: client?.address.street ?? "",
    number: client?.address.number ?? "",
    complement: client?.address.complement ?? "",
    district: client?.address.district ?? "",
    city: client?.address.city ?? "Salvador",
    state: client?.address.state ?? "BA",
    ownerId: client?.ownerId ?? currentUserId,
    status: client?.status ?? "ativo",
  })
  const { register, control, handleSubmit, reset, formState } = useForm<Values>({ resolver: zodResolver(schema), defaultValues: initial() })
  const errors = formState.errors

  useEffect(() => {
    if (open) {
      reset(initial())
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, client?.id])

  const onSubmit = handleSubmit(async (val) => {
    const data = {
      name: val.name,
      legalName: val.legalName,
      document: val.document,
      documentType: (onlyDigits(val.document).length > 11 ? "cnpj" : "cpf") as Client["documentType"],
      municipalRegistration: val.municipalRegistration || undefined,
      contactName: val.contactName,
      whatsapp: val.whatsapp,
      email: val.email ?? "",
      address: { zip: val.zip, street: val.street, number: val.number, complement: val.complement || undefined, district: val.district, city: val.city, state: val.state },
      ownerId: val.ownerId,
      status: val.status,
    }
    if (onContinue && client) {
      onContinue({ ...client, ...data, conversionReverted: false, deletedAt: undefined }, syncAsaas)
      return
    }
    if (syncAsaas) {
      setSaving(true)
      try {
        const candidate: Client = { ...client, ...data, id: client?.id || session.attemptId, createdAt: client?.createdAt || new Date().toISOString() }
        const result = await saveClientAndSyncAsaasAction(candidate)
        if (!result.ok) { toast.error(result.error); return }
        const state = useCrm.getState()
        state.replace("clients", [result.client, ...state.clients.filter(item => item.id !== result.client.id)])
        toast.success("Cliente salvo no CRM e vinculado ao Asaas")
        onOpenChange(false)
      } catch { toast.error("Não foi possível concluir o cadastro. Tente novamente.") }
      finally { setSaving(false) }
      return
    }
    if (client) {
      update("clients", client.id, data)
      toast.success("Dados do cliente atualizados")
    } else {
      const created: Client = { id: newId("cli"), ...data, createdAt: new Date().toISOString() }
      add("clients", created)
      toast.success("Cliente cadastrado", { action: { label: "Abrir ficha", onClick: () => router.push(`/clientes/${created.id}`) } })
    }
    onOpenChange(false)
  })

  const text = (name: keyof Values, label: string, opts: { required?: boolean; className?: string; placeholder?: string } = {}) => (
    <FormField label={label} required={opts.required} error={errors[name]?.message} className={opts.className}>
      <Input {...register(name)} placeholder={opts.placeholder} aria-invalid={!!errors[name]} />
    </FormField>
  )

  return (
    <FormDialog open={open} onOpenChange={value => !saving && onOpenChange(value)} title={onContinue ? "1 de 2 · Dados do cliente" : client ? "Editar cliente" : "Novo cliente"} description="Dados fiscais e de cobrança usados em cobranças e notas fiscais." onSubmit={onSubmit} submitting={saving} submitLabel={onContinue ? "Continuar para pagamento" : syncAsaas ? "Salvar no CRM e Asaas" : client ? "Salvar" : "Cadastrar"} size="xl">
      <label className="flex items-start gap-2 rounded-lg border p-3 text-sm"><input type="checkbox" checked={syncAsaas} disabled={saving} onChange={event => setSyncAsaas(event.target.checked)} /><span>Cadastrar ou vincular este cliente também no Asaas. O CPF/CNPJ evita criar outro cadastro quando ele já existe.</span></label>
      <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Identificação</p>
      <FormGrid>
        {text("name", "Nome fantasia", { required: true })}
        {text("legalName", "Razão social / nome completo", { required: true })}
        <FormField label="CPF/CNPJ" required error={errors.document?.message}>
          <Controller control={control} name="document" render={({ field }) => <MaskedInput mask={maskDocument} value={field.value} onChange={field.onChange} className="num" placeholder="00.000.000/0000-00" aria-invalid={!!errors.document} />} />
        </FormField>
        {text("municipalRegistration", "Inscrição municipal", { placeholder: "Opcional para CPF" })}
      </FormGrid>
      <p className="pt-2 text-xs font-medium tracking-wide text-muted-foreground uppercase">Contato</p>
      <FormGrid>
        {text("contactName", "Nome do contato", { required: true })}
        <FormField label="WhatsApp" required error={errors.whatsapp?.message}>
          <Controller control={control} name="whatsapp" render={({ field }) => <MaskedInput mask={maskPhone} value={field.value} onChange={field.onChange} placeholder="(71) 99999-9999" aria-invalid={!!errors.whatsapp} />} />
        </FormField>
        {text("email", "E-mail", { placeholder: "financeiro@empresa.com.br" })}
        <FormField label="Responsável" required>
          <Controller control={control} name="ownerId" render={({ field }) => <OptionSelect value={field.value} onChange={field.onChange} options={userOptions} />} />
        </FormField>
      </FormGrid>
      <p className="pt-2 text-xs font-medium tracking-wide text-muted-foreground uppercase">Endereço de cobrança</p>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-6">
        <FormField label="CEP" required error={errors.zip?.message} className="col-span-1 sm:col-span-2">
          <Controller control={control} name="zip" render={({ field }) => <MaskedInput mask={maskCep} value={field.value} onChange={field.onChange} className="num" placeholder="00000-000" aria-invalid={!!errors.zip} />} />
        </FormField>
        {text("street", "Logradouro", { required: true, className: "col-span-2 sm:col-span-4" })}
        {text("number", "Número", { required: true, className: "col-span-1 sm:col-span-2" })}
        {text("complement", "Complemento", { className: "col-span-2 sm:col-span-4" })}
        {text("district", "Bairro", { required: true, className: "col-span-2 sm:col-span-2" })}
        {text("city", "Cidade", { required: true, className: "col-span-1 sm:col-span-3" })}
        <FormField label="UF" required className="col-span-1">
          <Controller control={control} name="state" render={({ field }) => <OptionSelect value={field.value} onChange={field.onChange} options={UF.map((u) => ({ value: u, label: u }))} />} />
        </FormField>
      </div>
      {client && !onContinue && (
        <FormGrid>
          <FormField label="Status">
            <Controller
              control={control}
              name="status"
              render={({ field }) => (
                <OptionSelect
                  value={field.value}
                  onChange={field.onChange}
                  options={[
                    { value: "ativo", label: "Ativo" },
                    { value: "inativo", label: "Inativo" },
                  ]}
                />
              )}
            />
          </FormField>
        </FormGrid>
      )}
    </FormDialog>
  )
}
