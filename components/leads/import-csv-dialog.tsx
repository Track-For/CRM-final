"use client"

import { useMemo, useRef, useState } from "react"
import { AlertTriangle, ArrowRight, FileSpreadsheet, Upload } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Textarea } from "@/components/ui/textarea"
import { FormField } from "@/components/shared/form-field"
import { OptionSelect } from "@/components/shared/option-select"
import { StatusBadge } from "@/components/shared/status-badge"
import { PROJECT_TYPE_LABEL, REVENUE_LABEL, SOURCE_LABEL, TEMPERATURE_LABEL, toOptions } from "@/lib/constants"
import { newId, useCrm } from "@/lib/data"
import { useEntityOptions } from "@/lib/data/options"
import { maskPhone, onlyDigits } from "@/lib/format"
import { cn } from "@/lib/utils"
import type { Lead, LeadSource, ProjectType, RevenueRange, Temperature } from "@/types"

type FieldKey = "name" | "whatsapp" | "email" | "company" | "projectType" | "revenue" | "source" | "temperature" | "utm_source" | "utm_medium" | "utm_campaign"

const FIELDS: { key: FieldKey; label: string; required?: boolean; aliases: string[] }[] = [
  { key: "name", label: "Nome", required: true, aliases: ["nome", "name", "nome completo", "cliente"] },
  { key: "whatsapp", label: "WhatsApp", required: true, aliases: ["whatsapp", "telefone", "celular", "phone", "fone"] },
  { key: "email", label: "E-mail", aliases: ["email", "e-mail", "mail"] },
  { key: "company", label: "Empresa", aliases: ["empresa", "company", "negocio", "negócio"] },
  { key: "projectType", label: "Tipo de projeto", aliases: ["tipo de projeto", "projeto", "tipo", "project"] },
  { key: "revenue", label: "Faturamento", aliases: ["faturamento", "receita", "revenue"] },
  { key: "source", label: "Origem", aliases: ["origem", "source", "canal"] },
  { key: "temperature", label: "Temperatura", aliases: ["temperatura", "temperature"] },
  { key: "utm_source", label: "UTM source", aliases: ["utm_source", "utm source"] },
  { key: "utm_medium", label: "UTM medium", aliases: ["utm_medium", "utm medium"] },
  { key: "utm_campaign", label: "UTM campaign", aliases: ["utm_campaign", "utm campaign", "campanha"] },
]

const IGNORE = "__ignore"

const SAMPLE = `nome;whatsapp;email;empresa;tipo de projeto;faturamento;origem
Carla Mendes;(71) 98123-4567;carla@mendesestetica.com.br;Mendes Estética;Site ou Loja virtual;Entre R$10.000 e R$50.000;Instagram
Roberto Lins;(75) 99876-1122;roberto@linsagro.com.br;Lins Agro;Sistema;Acima de R$100.000;Google Ads`

/** Parser CSV simples com suporte a aspas e separador ";" ou ",". */
function parseCsv(text: string): string[][] {
  const clean = text.replace(/^﻿/, "").trim()
  if (!clean) return []
  const firstLine = clean.split(/\r?\n/)[0]
  const sep = (firstLine.match(/;/g)?.length ?? 0) >= (firstLine.match(/,/g)?.length ?? 0) ? ";" : ","
  const rows: string[][] = []
  let row: string[] = []
  let cell = ""
  let quoted = false
  for (let i = 0; i < clean.length; i++) {
    const ch = clean[i]
    if (quoted) {
      if (ch === '"' && clean[i + 1] === '"') {
        cell += '"'
        i++
      } else if (ch === '"') quoted = false
      else cell += ch
    } else if (ch === '"') quoted = true
    else if (ch === sep) {
      row.push(cell.trim())
      cell = ""
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && clean[i + 1] === "\n") i++
      row.push(cell.trim())
      rows.push(row)
      row = []
      cell = ""
    } else cell += ch
  }
  row.push(cell.trim())
  rows.push(row)
  return rows.filter((r) => r.some((c) => c))
}

const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim()

function matchEnum<T extends string>(value: string, labels: Record<T, string>, fallback: T): T {
  const v = norm(value)
  if (!v) return fallback
  const keys = Object.keys(labels) as T[]
  return keys.find((k) => norm(k) === v || norm(labels[k]) === v) ?? keys.find((k) => norm(labels[k]).includes(v) || v.includes(norm(labels[k]))) ?? fallback
}

interface ImportCsvDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function ImportCsvDialog({ open, onOpenChange }: ImportCsvDialogProps) {
  const add = useCrm((s) => s.add)
  const logActivity = useCrm((s) => s.logActivity)
  const currentUserId = useCrm((s) => s.currentUserId)
  const { userOptions } = useEntityOptions()
  const fileRef = useRef<HTMLInputElement>(null)

  const [step, setStep] = useState<1 | 2 | 3>(1)
  const [raw, setRaw] = useState("")
  const [fileName, setFileName] = useState<string | null>(null)
  const [mapping, setMapping] = useState<Record<FieldKey, string>>({} as Record<FieldKey, string>)
  const [ownerId, setOwnerId] = useState(currentUserId)
  const [defaultSource, setDefaultSource] = useState<LeadSource>("manual")

  const rows = useMemo(() => parseCsv(raw), [raw])
  const headers = rows[0] ?? []
  const body = rows.slice(1)

  const reset = () => {
    setStep(1)
    setRaw("")
    setFileName(null)
    setMapping({} as Record<FieldKey, string>)
  }

  const handleOpenChange = (o: boolean) => {
    if (!o) reset()
    onOpenChange(o)
  }

  const goToMapping = () => {
    if (headers.length === 0 || body.length === 0) {
      toast.error("Arquivo sem dados", { description: "Inclua uma linha de cabeçalho e pelo menos um lead." })
      return
    }
    const auto = {} as Record<FieldKey, string>
    for (const f of FIELDS) {
      const idx = headers.findIndex((h) => f.aliases.includes(norm(h)))
      auto[f.key] = idx >= 0 ? String(idx) : IGNORE
    }
    setMapping(auto)
    setStep(2)
  }

  const cell = (r: string[], key: FieldKey) => {
    const idx = mapping[key]
    return idx && idx !== IGNORE ? (r[Number(idx)] ?? "") : ""
  }

  const parsed = useMemo(() => {
    if (step < 2) return []
    return body.map((r) => {
      const name = cell(r, "name")
      const phone = cell(r, "whatsapp")
      const errors: string[] = []
      if (!name) errors.push("Nome vazio")
      if (onlyDigits(phone).length < 10) errors.push("WhatsApp inválido")
      return {
        errors,
        lead: {
          name,
          whatsapp: maskPhone(phone),
          email: cell(r, "email"),
          company: cell(r, "company"),
          projectType: matchEnum<ProjectType>(cell(r, "projectType"), PROJECT_TYPE_LABEL, "outros"),
          revenue: matchEnum<RevenueRange>(cell(r, "revenue"), REVENUE_LABEL, "sem_faturamento"),
          source: matchEnum<LeadSource>(cell(r, "source"), SOURCE_LABEL, defaultSource),
          temperature: matchEnum<Temperature>(cell(r, "temperature"), TEMPERATURE_LABEL, "morno"),
          utm: {
            source: cell(r, "utm_source") || undefined,
            medium: cell(r, "utm_medium") || undefined,
            campaign: cell(r, "utm_campaign") || undefined,
          },
        },
      }
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, body, mapping, defaultSource])

  const valid = parsed.filter((p) => p.errors.length === 0)
  const missingRequired = FIELDS.filter((f) => f.required && (!mapping[f.key] || mapping[f.key] === IGNORE))

  const doImport = () => {
    const now = new Date().toISOString()
    valid.forEach((p) => {
      const lead: Lead = { id: newId("lead"), ...p.lead, ownerId, status: "novo", createdAt: now, updatedAt: now }
      add("leads", lead)
      logActivity({ type: "status", title: "Lead importado via CSV", description: fileName ?? undefined, leadId: lead.id })
    })
    toast.success(`${valid.length} lead(s) importado(s)`, { description: parsed.length - valid.length ? `${parsed.length - valid.length} linha(s) ignorada(s) por erro` : undefined })
    handleOpenChange(false)
  }

  const columnOptions = [{ value: IGNORE, label: "Não importar" }, ...headers.map((h, i) => ({ value: String(i), label: h || `Coluna ${i + 1}` }))]

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-h-[92dvh] gap-0 overflow-hidden p-0 sm:max-w-3xl">
        <div className="flex max-h-[92dvh] flex-col">
          <DialogHeader className="border-b p-4">
            <DialogTitle>Importar leads</DialogTitle>
            <DialogDescription>Envie uma planilha CSV, relacione as colunas e confira antes de importar.</DialogDescription>
            <div className="mt-2 flex items-center gap-2 text-xs">
              {(["Arquivo", "Mapeamento", "Revisão"] as const).map((label, i) => (
                <span key={label} className="flex items-center gap-2">
                  <span className={cn("num flex size-5 items-center justify-center rounded-full border text-[10px]", step >= i + 1 ? "border-primary bg-primary text-primary-foreground" : "text-muted-foreground")}>{i + 1}</span>
                  <span className={step === i + 1 ? "text-foreground" : "text-muted-foreground"}>{label}</span>
                  {i < 2 && <ArrowRight className="size-3 text-muted-foreground" />}
                </span>
              ))}
            </div>
          </DialogHeader>

          <div className="flex-1 space-y-4 overflow-y-auto p-4">
            {step === 1 && (
              <>
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  className="flex w-full flex-col items-center gap-2 rounded-xl border border-dashed bg-surface p-8 text-center transition-colors hover:border-primary/35"
                >
                  <Upload className="size-6 text-primary" />
                  <span className="text-sm font-medium">{fileName ?? "Clique para escolher um arquivo .csv"}</span>
                  <span className="text-xs text-muted-foreground">Separador ponto e vírgula ou vírgula, com linha de cabeçalho</span>
                </button>
                <input
                  ref={fileRef}
                  type="file"
                  accept=".csv,text/csv"
                  className="hidden"
                  onChange={async (e) => {
                    const file = e.target.files?.[0]
                    if (!file) return
                    setFileName(file.name)
                    setRaw(await file.text())
                    e.target.value = ""
                  }}
                />
                <FormField label="Ou cole o conteúdo do CSV">
                  <Textarea value={raw} onChange={(e) => setRaw(e.target.value)} rows={7} className="num text-xs" placeholder={SAMPLE} />
                </FormField>
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
                  <span className="num">{body.length} linha(s) detectada(s)</span>
                  <Button type="button" variant="ghost" size="xs" onClick={() => setRaw(SAMPLE)}>
                    <FileSpreadsheet />
                    Usar exemplo
                  </Button>
                </div>
              </>
            )}

            {step === 2 && (
              <>
                <div className="grid gap-3 sm:grid-cols-2">
                  {FIELDS.map((f) => (
                    <FormField key={f.key} label={f.label} required={f.required}>
                      <OptionSelect value={mapping[f.key] ?? IGNORE} onChange={(val) => setMapping((m) => ({ ...m, [f.key]: val }))} options={columnOptions} />
                    </FormField>
                  ))}
                </div>
                <div className="grid gap-3 border-t pt-4 sm:grid-cols-2">
                  <FormField label="Responsável pelos leads importados" required>
                    <OptionSelect value={ownerId} onChange={setOwnerId} options={userOptions} />
                  </FormField>
                  <FormField label="Origem quando a coluna estiver vazia">
                    <OptionSelect value={defaultSource} onChange={setDefaultSource} options={toOptions(SOURCE_LABEL)} />
                  </FormField>
                </div>
                {missingRequired.length > 0 && (
                  <p className="flex items-center gap-2 text-xs text-warning">
                    <AlertTriangle className="size-3.5" />
                    Relacione as colunas obrigatórias: {missingRequired.map((f) => f.label).join(", ")}
                  </p>
                )}
              </>
            )}

            {step === 3 && (
              <>
                <div className="flex flex-wrap gap-2">
                  <StatusBadge tone="success">{valid.length} prontos para importar</StatusBadge>
                  {parsed.length - valid.length > 0 && <StatusBadge tone="danger">{parsed.length - valid.length} com erro</StatusBadge>}
                </div>
                <div className="overflow-x-auto rounded-lg border">
                  <table className="w-full text-xs">
                    <thead className="bg-surface text-muted-foreground">
                      <tr>
                        <th className="p-2 text-left font-medium">Nome</th>
                        <th className="p-2 text-left font-medium">WhatsApp</th>
                        <th className="p-2 text-left font-medium">Projeto</th>
                        <th className="p-2 text-left font-medium">Origem</th>
                        <th className="p-2 text-left font-medium">Situação</th>
                      </tr>
                    </thead>
                    <tbody>
                      {parsed.slice(0, 50).map((p, i) => (
                        <tr key={i} className="border-t">
                          <td className="p-2">{p.lead.name || "—"}</td>
                          <td className="num p-2">{p.lead.whatsapp || "—"}</td>
                          <td className="p-2">{PROJECT_TYPE_LABEL[p.lead.projectType]}</td>
                          <td className="p-2">{SOURCE_LABEL[p.lead.source]}</td>
                          <td className="p-2">{p.errors.length ? <span className="text-danger">{p.errors.join(", ")}</span> : <span className="text-success">OK</span>}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {parsed.length > 50 && <p className="text-xs text-muted-foreground">Mostrando 50 de {parsed.length} linhas.</p>}
              </>
            )}
          </div>

          <DialogFooter className="m-0 flex-row justify-between gap-2 rounded-none border-t bg-card p-4 sm:justify-between">
            <Button type="button" variant="ghost" onClick={() => (step === 1 ? handleOpenChange(false) : setStep((s) => (s - 1) as 1 | 2))}>
              {step === 1 ? "Cancelar" : "Voltar"}
            </Button>
            {step === 1 && (
              <Button type="button" onClick={goToMapping} disabled={!raw.trim()}>
                Continuar
              </Button>
            )}
            {step === 2 && (
              <Button type="button" onClick={() => setStep(3)} disabled={missingRequired.length > 0}>
                Revisar
              </Button>
            )}
            {step === 3 && (
              <Button type="button" onClick={doImport} disabled={valid.length === 0}>
                Importar {valid.length} lead(s)
              </Button>
            )}
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  )
}
