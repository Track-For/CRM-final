import type { Option, Tone } from "@/lib/constants"
import type { InvoiceView } from "@/lib/fiscal/actions"

export type FiscalInvoiceStatus = InvoiceView["status"]

export const FISCAL_STATUS_LABEL: Record<FiscalInvoiceStatus, string> = {
  rascunho: "Rascunho",
  processando: "Processando",
  emitida: "Emitida",
  rejeitada: "Rejeitada",
  cancelando: "Cancelando",
  cancelada: "Cancelada",
}

export const FISCAL_STATUS_TONE: Record<FiscalInvoiceStatus, Tone> = {
  rascunho: "neutral",
  processando: "info",
  emitida: "success",
  rejeitada: "danger",
  cancelando: "warning",
  cancelada: "neutral",
}

/** Estados que dependem de consulta ao lote no Brasil NFe. */
export const PENDING_STATUSES: FiscalInvoiceStatus[] = ["processando", "cancelando"]

export const ENVIRONMENT_LABEL: Record<"homologacao" | "producao", string> = {
  homologacao: "Homologação",
  producao: "Produção",
}

/** Itens da LC 116 mais usados por software house (6 dígitos, sem ponto: 010701 = 1.07). */
export const SERVICE_ITEMS: Option[] = [
  { value: "010101", label: "1.01 — Análise e desenvolvimento de sistemas" },
  { value: "010201", label: "1.02 — Programação" },
  { value: "010301", label: "1.03 — Processamento, armazenamento ou hospedagem de dados" },
  { value: "010401", label: "1.04 — Elaboração de programas de computador" },
  { value: "010501", label: "1.05 — Licenciamento ou cessão de uso de software" },
  { value: "010601", label: "1.06 — Assessoria e consultoria em informática" },
  { value: "010701", label: "1.07 — Suporte técnico em informática" },
  { value: "010801", label: "1.08 — Páginas eletrônicas (sites)" },
  { value: "170601", label: "17.06 — Propaganda e publicidade" },
]

export const OTHER_SERVICE_ITEM = "__outro"

/** "010701" -> "1.07". */
export function formatServiceItem(code: string | null | undefined): string {
  if (!code) return "—"
  const d = code.replace(/\D/g, "")
  if (d.length < 4) return code
  return `${Number(d.slice(0, 2))}.${d.slice(2, 4)}`
}

export function serviceItemLabel(code: string | null | undefined): string {
  return SERVICE_ITEMS.find((s) => s.value === code)?.label ?? formatServiceItem(code)
}

/** Opções do select de item; códigos fora da lista entram por "Outro código". */
export function serviceItemOptions(): Option[] {
  return [...SERVICE_ITEMS, { value: OTHER_SERVICE_ITEM, label: "Outro código" }]
}

export const CANCEL_REASONS: Option<"1" | "2" | "3" | "9">[] = [
  { value: "1", label: "Erro na emissão" },
  { value: "2", label: "Serviço não prestado" },
  { value: "3", label: "Nota em duplicidade" },
  { value: "9", label: "Outros" },
]

export const CANCEL_REASON_LABEL: Record<number, string> = { 1: "Erro na emissão", 2: "Serviço não prestado", 3: "Nota em duplicidade", 9: "Outros" }

export const UF_OPTIONS: Option[] = ["AC", "AL", "AM", "AP", "BA", "CE", "DF", "ES", "GO", "MA", "MG", "MS", "MT", "PA", "PB", "PE", "PI", "PR", "RJ", "RN", "RO", "RR", "RS", "SC", "SE", "SP", "TO"].map((uf) => ({ value: uf, label: uf }))

export const SALVADOR_IBGE = "2927408"

export const BRASIL_NFE_SIGNUP_URL = "https://api.brasilnfe.com.br/Account/Login/?register=true"

export const fileUrl = (id: string, tipo: "pdf" | "xml") => `/api/notas-fiscais/${id}/arquivo?tipo=${tipo}`

export function normalizeText(s: string | undefined | null): string {
  return (s ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim()
    .toLowerCase()
}

/** Valor do ISS: o devolvido pela prefeitura ou estimado pela alíquota. */
export const issOf = (i: Pick<InvoiceView, "amount" | "issRate" | "values">) => i.values?.ValorISS ?? (i.amount * i.issRate) / 100

/** Soma das retenções federais (R$). */
export function federalRetentions(r: InvoiceView["retentions"] | null | undefined): number {
  if (!r) return 0
  return (r.ir ?? 0) + (r.pis ?? 0) + (r.cofins ?? 0) + (r.csll ?? 0) + (r.inss ?? 0)
}

/** Valor líquido: o devolvido pela prefeitura ou calculado. */
export function netOf(i: Pick<InvoiceView, "amount" | "issRate" | "values" | "retentions" | "issRetained">): number {
  if (i.values?.ValorLiquido != null) return i.values.ValorLiquido
  return i.amount - federalRetentions(i.retentions) - (i.issRetained ? issOf(i) : 0)
}

/** Busca de CEP no ViaCEP (devolve também o código IBGE do município). */
export async function lookupCep(cep: string): Promise<{ street: string; district: string; city: string; uf: string; ibge: string } | null> {
  const d = cep.replace(/\D/g, "")
  if (d.length !== 8) return null
  try {
    const res = await fetch(`https://viacep.com.br/ws/${d}/json/`)
    if (!res.ok) return null
    const data = (await res.json()) as { erro?: boolean | string; logradouro?: string; bairro?: string; localidade?: string; uf?: string; ibge?: string }
    if (data.erro) return null
    return { street: data.logradouro ?? "", district: data.bairro ?? "", city: data.localidade ?? "", uf: data.uf ?? "", ibge: data.ibge ?? "" }
  } catch {
    return null
  }
}
