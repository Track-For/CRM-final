"use client"

import { useState } from "react"
import { Plus, Trash2 } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { OptionSelect } from "@/components/shared/option-select"
import { Panel } from "@/components/shared/panel"
import { StatusBadge } from "@/components/shared/status-badge"
import { newId, useCrm, useDeals, useEntries, useFinancialCategories, useLostReasons } from "@/lib/data"
import type { EntryType } from "@/types"

/** Linha editável: salva ao sair do campo. */
function EditableRow({ value, onSave, onRemove, meta }: { value: string; onSave: (v: string) => void; onRemove: () => void; meta?: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2">
      <Input
        defaultValue={value}
        onBlur={(e) => {
          const next = e.target.value.trim()
          if (!next) {
            e.target.value = value
            toast.error("O nome não pode ficar vazio")
          } else if (next !== value) {
            onSave(next)
            toast.success("Salvo")
          }
        }}
        aria-label="Nome"
      />
      {meta}
      <Button variant="ghost" size="icon" className="shrink-0 text-danger" onClick={onRemove} aria-label="Remover">
        <Trash2 />
      </Button>
    </div>
  )
}

function AddRow({ placeholder, onAdd, children }: { placeholder: string; onAdd: (label: string) => void; children?: React.ReactNode }) {
  const [label, setLabel] = useState("")
  const [error, setError] = useState<string>()
  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!label.trim()) return setError("Informe um nome")
    onAdd(label.trim())
    setLabel("")
    setError(undefined)
  }
  return (
    <form onSubmit={submit} className="mt-4 space-y-1 border-t pt-4">
      <div className="flex flex-col gap-2 sm:flex-row">
        <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder={placeholder} aria-invalid={!!error} />
        {children}
        <Button type="submit" variant="outline" className="shrink-0">
          <Plus /> Adicionar
        </Button>
      </div>
      {error && <p className="text-xs text-danger">{error}</p>}
    </form>
  )
}

export function LostReasonsSettings() {
  const reasons = useLostReasons()
  const deals = useDeals()
  const add = useCrm((s) => s.add)
  const update = useCrm((s) => s.update)
  const remove = useCrm((s) => s.remove)
  return (
    <Panel title="Motivos de perda" description="Pedidos ao mover um negócio para Perdido; alimentam o gráfico do funil." className="max-w-2xl">
      <div className="space-y-2">
        {reasons.map((r) => {
          const count = deals.filter((d) => d.lostReasonId === r.id).length
          return (
            <EditableRow
              key={r.id}
              value={r.label}
              onSave={(label) => update("lostReasons", r.id, { label })}
              onRemove={() => {
                if (count) return toast.error("Motivo em uso", { description: `${count} negócio(s) usam este motivo` })
                remove("lostReasons", r.id)
                toast.success("Motivo removido")
              }}
              meta={
                <StatusBadge dot={false} className="shrink-0">
                  <span className="num">{count}</span>
                </StatusBadge>
              }
            />
          )
        })}
      </div>
      <AddRow
        placeholder="Novo motivo de perda"
        onAdd={(label) => {
          add("lostReasons", { id: newId("lr"), label })
          toast.success("Motivo adicionado")
        }}
      />
    </Panel>
  )
}

export function FinancialCategoriesSettings() {
  const categories = useFinancialCategories()
  const entries = useEntries()
  const add = useCrm((s) => s.add)
  const update = useCrm((s) => s.update)
  const remove = useCrm((s) => s.remove)
  const [type, setType] = useState<EntryType>("despesa")

  const column = (t: EntryType) => (
    <Panel title={t === "receita" ? "Receitas" : "Despesas"} description={t === "receita" ? "Origem das entradas" : "Classificação dos gastos"}>
      <div className="space-y-2">
        {categories
          .filter((c) => c.type === t)
          .map((c) => {
            const count = entries.filter((e) => e.categoryId === c.id).length
            return (
              <EditableRow
                key={c.id}
                value={c.name}
                onSave={(name) => update("financialCategories", c.id, { name })}
                onRemove={() => {
                  if (count) return toast.error("Categoria em uso", { description: `${count} lançamento(s) usam esta categoria` })
                  remove("financialCategories", c.id)
                  toast.success("Categoria removida")
                }}
                meta={<StatusBadge tone={t === "receita" ? "success" : "danger"} dot={false} className="shrink-0"><span className="num">{count}</span></StatusBadge>}
              />
            )
          })}
      </div>
    </Panel>
  )

  return (
    <div className="space-y-6">
      <div className="grid gap-6 lg:grid-cols-2">
        {column("receita")}
        {column("despesa")}
      </div>
      <Panel title="Nova categoria">
        <AddRow
          placeholder="Nome da categoria"
          onAdd={(name) => {
            add("financialCategories", { id: newId("fc"), name, type })
            toast.success("Categoria adicionada")
          }}
        >
          <OptionSelect className="sm:w-40" value={type} onChange={setType} options={[{ value: "receita", label: "Receita" }, { value: "despesa", label: "Despesa" }]} />
        </AddRow>
      </Panel>
    </div>
  )
}
