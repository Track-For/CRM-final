"use client"

import { useEffect, useState } from "react"
import { Controller, useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { MessageSquareText, Pencil, Plus, Trash2 } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { FormDialog } from "@/components/forms/form-dialog"
import { EmptyState } from "@/components/shared/empty-state"
import { FormField } from "@/components/shared/form-field"
import { OptionSelect } from "@/components/shared/option-select"
import { Panel } from "@/components/shared/panel"
import { StatusBadge } from "@/components/shared/status-badge"
import { newId, useCrm, useQuickMessages } from "@/lib/data"
import type { QuickMessage } from "@/types"

export const QUICK_MESSAGE_CATEGORY: Record<QuickMessage["category"], string> = {
  primeiro_contato: "Primeiro contato",
  follow_up: "Follow-up",
  proposta: "Proposta",
  cobranca: "Cobrança",
  pos_venda: "Pós-venda",
}

const VARIABLES = ["{nome}", "{projeto}", "{valor}", "{vencimento}", "{link}"]

const schema = z.object({
  title: z.string().trim().min(1, "Título é obrigatório"),
  category: z.enum(["primeiro_contato", "follow_up", "proposta", "cobranca", "pos_venda"], { error: "Selecione a categoria" }),
  text: z.string().trim().min(10, "Mensagem muito curta (mínimo 10 caracteres)").max(1000, "Máximo de 1000 caracteres"),
})
type Values = z.infer<typeof schema>

function highlight(text: string) {
  return text.split(/(\{[a-z]+\})/g).map((part, i) =>
    /^\{[a-z]+\}$/.test(part) ? (
      <span key={i} className="num text-primary">
        {part}
      </span>
    ) : (
      part
    ),
  )
}

export function QuickMessagesSettings() {
  const messages = useQuickMessages()
  const add = useCrm((s) => s.add)
  const update = useCrm((s) => s.update)
  const remove = useCrm((s) => s.remove)
  const [editing, setEditing] = useState<QuickMessage | undefined>()
  const [open, setOpen] = useState(false)

  const toValues = (): Values => ({ title: editing?.title ?? "", category: editing?.category ?? "follow_up", text: editing?.text ?? "" })
  const { register, control, handleSubmit, reset, setValue, getValues, formState } = useForm<Values>({ resolver: zodResolver(schema), defaultValues: toValues() })
  const e = formState.errors

  useEffect(() => {
    if (open) reset(toValues())
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, editing?.id])

  const onSubmit = handleSubmit((values) => {
    if (editing) update("quickMessages", editing.id, values)
    else add("quickMessages", { id: newId("qm"), ...values })
    toast.success(editing ? "Mensagem atualizada" : "Mensagem criada")
    setOpen(false)
  })

  return (
    <Panel
      title="Mensagens prontas de WhatsApp"
      description="Usadas na conversa do lead e nos envios de proposta e cobrança."
      actions={
        <Button
          size="sm"
          onClick={() => {
            setEditing(undefined)
            setOpen(true)
          }}
        >
          <Plus /> Mensagem
        </Button>
      }
    >
      {messages.length === 0 ? (
        <EmptyState icon={MessageSquareText} title="Nenhuma mensagem pronta" compact />
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {messages.map((m) => (
            <div key={m.id} className="flex flex-col gap-2 rounded-xl border bg-surface p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate font-medium">{m.title}</p>
                  <StatusBadge tone="info" className="mt-1">
                    {QUICK_MESSAGE_CATEGORY[m.category]}
                  </StatusBadge>
                </div>
                <div className="flex gap-1">
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => {
                      setEditing(m)
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
                      remove("quickMessages", m.id)
                      toast.success("Mensagem removida")
                    }}
                    aria-label="Remover"
                  >
                    <Trash2 />
                  </Button>
                </div>
              </div>
              <p className="text-sm whitespace-pre-line text-muted-foreground">{highlight(m.text)}</p>
            </div>
          ))}
        </div>
      )}

      <FormDialog open={open} onOpenChange={setOpen} title={editing ? "Editar mensagem" : "Nova mensagem pronta"} onSubmit={onSubmit}>
        <FormField label="Título" required error={e.title?.message}>
          <Input {...register("title")} aria-invalid={!!e.title} />
        </FormField>
        <FormField label="Categoria" required error={e.category?.message}>
          <Controller
            control={control}
            name="category"
            render={({ field }) => <OptionSelect value={field.value} onChange={field.onChange} options={(Object.keys(QUICK_MESSAGE_CATEGORY) as QuickMessage["category"][]).map((k) => ({ value: k, label: QUICK_MESSAGE_CATEGORY[k] }))} />}
          />
        </FormField>
        <FormField label="Mensagem" required error={e.text?.message}>
          <Textarea rows={5} {...register("text")} aria-invalid={!!e.text} />
        </FormField>
        <div className="space-y-1.5">
          <p className="text-xs text-muted-foreground">Variáveis (clique para inserir)</p>
          <div className="flex flex-wrap gap-1.5">
            {VARIABLES.map((variable) => (
              <Button key={variable} type="button" variant="outline" size="xs" className="num" onClick={() => setValue("text", `${getValues("text")}${getValues("text").endsWith(" ") || !getValues("text") ? "" : " "}${variable}`, { shouldDirty: true })}>
                {variable}
              </Button>
            ))}
          </div>
        </div>
      </FormDialog>
    </Panel>
  )
}
