"use client"

import { useState } from "react"
import { saveRecord } from "@/lib/data/records-actions"
import { Controller, useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { toast } from "@/lib/store/save-feedback"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { FormField } from "@/components/shared/form-field"
import { MaskedInput } from "@/components/shared/money-input"
import { Panel } from "@/components/shared/panel"
import { useCompany, useCrm } from "@/lib/data"
import { maskCep, maskCnpj, maskPhone, onlyDigits } from "@/lib/format"
import { v } from "@/lib/validation"

const schema = z.object({
  name: v.required("Nome fantasia"),
  legalName: v.required("Razão social"),
  cnpj: z.string().refine((s) => onlyDigits(s).length === 14, "CNPJ incompleto"),
  municipalRegistration: v.required("Inscrição municipal"),
  email: z.string().trim().min(1, "E-mail é obrigatório").email("E-mail inválido"),
  whatsapp: v.phone(),
  website: v.optional(),
  address: z.object({
    zip: z.string().refine((s) => onlyDigits(s).length === 8, "CEP inválido"),
    street: v.required("Logradouro"),
    number: v.required("Número"),
    complement: z.string().optional(),
    district: v.required("Bairro"),
    city: v.required("Cidade"),
    state: z.string().trim().length(2, "Use a sigla do estado (ex.: BA)"),
  }),
})
type Values = z.infer<typeof schema>

export function CompanySettings() {
  const company = useCompany()
  const setSingleton = useCrm((s) => s.setSingleton)
  const { register, control, handleSubmit, reset, formState } = useForm<Values>({ resolver: zodResolver(schema), defaultValues: company })
  const e = formState.errors

  const onSubmit = handleSubmit((values) => {
    setSingleton("company", { ...values, pixKey: company.pixKey, website: values.website ?? "", address: { ...values.address, state: values.address.state.toUpperCase() } })
    reset(values)
    toast.success("Dados da empresa salvos", { description: "Usados em propostas, cobranças e notas fiscais" })
  })

  return (
    <>
    <PixSettings key={company.pixKey || ""} initialKey={company.pixKey || ""} />
    <form onSubmit={onSubmit} noValidate className="space-y-6">
      <Panel
        title="Dados da empresa"
        description="Aparecem nas propostas em PDF, cobranças e NFS-e."
        actions={
          <Button type="submit" size="sm" disabled={!formState.isDirty}>
            Salvar
          </Button>
        }
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField label="Nome fantasia" required error={e.name?.message}>
            <Input {...register("name")} aria-invalid={!!e.name} />
          </FormField>
          <FormField label="Razão social" required error={e.legalName?.message}>
            <Input {...register("legalName")} aria-invalid={!!e.legalName} />
          </FormField>
          <FormField label="CNPJ" required error={e.cnpj?.message}>
            <Controller control={control} name="cnpj" render={({ field }) => <MaskedInput className="num" mask={maskCnpj} value={field.value} onChange={field.onChange} aria-invalid={!!e.cnpj} />} />
          </FormField>
          <FormField label="Inscrição municipal" required error={e.municipalRegistration?.message}>
            <Input className="num" {...register("municipalRegistration")} />
          </FormField>
          <FormField label="E-mail de contato" required error={e.email?.message}>
            <Input type="email" {...register("email")} />
          </FormField>
          <FormField label="WhatsApp" required error={e.whatsapp?.message}>
            <Controller control={control} name="whatsapp" render={({ field }) => <MaskedInput className="num" mask={maskPhone} value={field.value} onChange={field.onChange} />} />
          </FormField>
          <FormField label="Site" className="sm:col-span-2">
            <Input {...register("website")} placeholder="solidtech.com.br" />
          </FormField>
        </div>
      </Panel>
      <Panel title="Endereço">
        <div className="grid gap-4 sm:grid-cols-6">
          <FormField label="CEP" required error={e.address?.zip?.message} className="sm:col-span-2">
            <Controller control={control} name="address.zip" render={({ field }) => <MaskedInput className="num" mask={maskCep} value={field.value} onChange={field.onChange} />} />
          </FormField>
          <FormField label="Logradouro" required error={e.address?.street?.message} className="sm:col-span-4">
            <Input {...register("address.street")} />
          </FormField>
          <FormField label="Número" required error={e.address?.number?.message} className="sm:col-span-2">
            <Input {...register("address.number")} />
          </FormField>
          <FormField label="Complemento" className="sm:col-span-4">
            <Input {...register("address.complement")} />
          </FormField>
          <FormField label="Bairro" required error={e.address?.district?.message} className="sm:col-span-2">
            <Input {...register("address.district")} />
          </FormField>
          <FormField label="Cidade" required error={e.address?.city?.message} className="sm:col-span-3">
            <Input {...register("address.city")} />
          </FormField>
          <FormField label="UF" required error={e.address?.state?.message} className="sm:col-span-1">
            <Input maxLength={2} className="uppercase" {...register("address.state")} />
          </FormField>
        </div>
      </Panel>
    </form>
    </>
  )
}


function PixSettings({ initialKey }: { initialKey: string }) {
  const [pixKey, setPixKey] = useState(initialKey)
  const [saving, setSaving] = useState(false)
  const save = async () => {
    const value = pixKey.trim()
    if (!value) return void toast.error("Informe a chave Pix")
    setSaving(true)
    try {
      const state = useCrm.getState()
      const company = { ...state.company, pixKey: value }
      await saveRecord("settings", "company", { company })
      useCrm.setState({ company, charges: state.charges.map(charge => charge.method === "pix" && charge.status !== "pago" && !charge.gatewayId ? { ...charge, pixKey: value } : charge) })
      toast.success("Chave Pix da empresa salva", { description: "Usada para todos os clientes" })
    } catch { toast.error("Não foi possível salvar a chave Pix") }
    finally { setSaving(false) }
  }
  return <Panel title="Recebimentos por Pix" description="Uma única chave para todos os clientes, projetos e mensalidades.">
    <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
      <FormField label="Chave Pix da empresa" className="flex-1"><Input value={pixKey} onChange={event => setPixKey(event.target.value)} disabled={saving} /></FormField>
      <Button type="button" onClick={() => void save()} disabled={saving || pixKey.trim() === initialKey}>Salvar chave Pix</Button>
    </div>
  </Panel>
}
