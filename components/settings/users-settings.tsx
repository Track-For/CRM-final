"use client"

import { Controller, useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { useState } from "react"
import { Check, Minus, UserPlus } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import { FormDialog } from "@/components/forms/form-dialog"
import { FormField } from "@/components/shared/form-field"
import { MaskedInput } from "@/components/shared/money-input"
import { OptionSelect } from "@/components/shared/option-select"
import { Panel } from "@/components/shared/panel"
import { StatusBadge } from "@/components/shared/status-badge"
import { InitialsAvatar } from "@/components/shared/user-avatar"
import { ROLE_LABEL, toOptions } from "@/lib/constants"
import { newId, useCrm, useUsers } from "@/lib/data"
import { initials, maskPhone } from "@/lib/format"
import { NAV_ITEMS } from "@/lib/permissions"
import { v } from "@/lib/validation"
import type { Role, User } from "@/types"

const ROLES = Object.keys(ROLE_LABEL) as Role[]

const schema = z.object({
  name: v.required("Nome"),
  email: z.string().trim().min(1, "E-mail é obrigatório").email("E-mail inválido"),
  whatsapp: v.phone(),
  role: v.select(["admin", "comercial", "operacao", "financeiro"], "o papel"),
})
type Values = z.infer<typeof schema>

function InviteDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const add = useCrm((s) => s.add)
  const users = useUsers()
  const { register, control, handleSubmit, reset, setError, formState } = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { name: "", email: "", whatsapp: "", role: "comercial" },
  })
  const e = formState.errors
  const onSubmit = handleSubmit((values) => {
    if (users.some((u) => u.email.toLowerCase() === values.email.toLowerCase())) {
      setError("email", { message: "Já existe um usuário com este e-mail" })
      return
    }
    const user: User = { id: newId("usr"), ...values, initials: initials(values.name), active: true, createdAt: new Date().toISOString() }
    add("users", user)
    toast.success("Convite enviado pelo WhatsApp", { description: `${values.name} receberá o link de acesso em ${values.whatsapp}` })
    reset()
    onOpenChange(false)
  })
  return (
    <FormDialog open={open} onOpenChange={onOpenChange} title="Convidar usuário" description="O link de acesso é enviado pelo WhatsApp." onSubmit={onSubmit} submitLabel="Enviar convite" size="md">
      <FormField label="Nome" required error={e.name?.message}>
        <Input {...register("name")} aria-invalid={!!e.name} />
      </FormField>
      <FormField label="E-mail (login)" required error={e.email?.message}>
        <Input type="email" {...register("email")} aria-invalid={!!e.email} />
      </FormField>
      <FormField label="WhatsApp" required error={e.whatsapp?.message}>
        <Controller control={control} name="whatsapp" render={({ field }) => <MaskedInput mask={maskPhone} value={field.value} onChange={field.onChange} aria-invalid={!!e.whatsapp} />} />
      </FormField>
      <FormField label="Papel" required>
        <Controller control={control} name="role" render={({ field }) => <OptionSelect value={field.value} onChange={field.onChange} options={toOptions(ROLE_LABEL)} />} />
      </FormField>
    </FormDialog>
  )
}

export function UsersSettings() {
  const users = useUsers()
  const update = useCrm((s) => s.update)
  const currentUserId = useCrm((s) => s.currentUserId)
  const [inviting, setInviting] = useState(false)

  return (
    <div className="space-y-6">
      <Panel
        title="Usuários"
        description={`${users.filter((u) => u.active).length} ativos de ${users.length}`}
        actions={
          <Button size="sm" onClick={() => setInviting(true)}>
            <UserPlus /> Convidar
          </Button>
        }
        contentClassName="p-0"
      >
        <div className="divide-y">
          {users.map((u) => (
            <div key={u.id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
              <div className="flex min-w-0 flex-1 items-center gap-3">
                <InitialsAvatar name={u.name} id={u.id} size="md" />
                <div className="min-w-0">
                  <p className="flex items-center gap-2 truncate font-medium">
                    {u.name}
                    {u.id === currentUserId && <StatusBadge tone="brand">Você</StatusBadge>}
                    {!u.active && <StatusBadge>Inativo</StatusBadge>}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    {u.email} · <span className="num">{u.whatsapp}</span>
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <OptionSelect
                  className="w-40"
                  value={u.role}
                  disabled={u.id === currentUserId}
                  onChange={(role) => {
                    update("users", u.id, { role })
                    toast.success(`${u.name.split(" ")[0]} agora é ${ROLE_LABEL[role]}`)
                  }}
                  options={toOptions(ROLE_LABEL)}
                />
                <Switch
                  checked={u.active}
                  disabled={u.id === currentUserId}
                  onCheckedChange={(active) => {
                    update("users", u.id, { active })
                    toast.success(active ? "Usuário reativado" : "Usuário desativado")
                  }}
                  aria-label="Ativo"
                />
              </div>
            </div>
          ))}
        </div>
      </Panel>

      <Panel title="Permissões por papel" description="Telas visíveis para cada papel. Financeiro e Notas fiscais ficam restritos a Admin e Financeiro." contentClassName="p-0">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[520px] text-sm">
            <thead>
              <tr className="border-b text-xs text-muted-foreground">
                <th className="px-4 py-2.5 text-left font-medium">Tela</th>
                {ROLES.map((r) => (
                  <th key={r} className="px-3 py-2.5 text-center font-medium">
                    {ROLE_LABEL[r]}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {NAV_ITEMS.map((item) => (
                <tr key={item.href} className="border-b last:border-0">
                  <td className="px-4 py-2">
                    <span className="inline-flex items-center gap-2">
                      <item.icon className="size-4 text-muted-foreground" />
                      {item.label}
                    </span>
                  </td>
                  {ROLES.map((r) => (
                    <td key={r} className="px-3 py-2 text-center">
                      {item.roles.includes(r) ? <Check className="mx-auto size-4 text-primary" aria-label="Permitido" /> : <Minus className="mx-auto size-4 text-[#3a3a3a]" aria-label="Bloqueado" />}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
      <InviteDialog open={inviting} onOpenChange={setInviting} />
    </div>
  )
}
