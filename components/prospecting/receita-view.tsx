"use client"

import { useCallback, useEffect, useState } from "react"
import Link from "next/link"
import { ChevronLeft, ChevronRight, Download, Loader2, RefreshCw, Search } from "lucide-react"
import { PageHeader } from "@/components/shared/page-header"
import { Panel } from "@/components/shared/panel"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { FormField } from "@/components/shared/form-field"
import { EntityCombobox } from "@/components/shared/entity-combobox"
import { getReceitaStatus, importReceitaProspects, searchReceita, searchReceitaCnaes } from "@/lib/prospecting/actions"
import type { ReceitaResults, ReceitaStatus } from "@/lib/prospecting/types"
import { useCrmStore } from "@/lib/store/crm-store"
import { toast } from "@/lib/store/save-feedback"

const ufs = "AC AL AP AM BA CE DF ES GO MA MT MS MG PA PB PR PE PI RJ RN RS RO RR SC SP SE TO".split(" ")
const formatCnpj = (v: string) => v.replace(/^([A-Z0-9]{2})([A-Z0-9]{3})([A-Z0-9]{3})([A-Z0-9]{4})(\d{2})$/, "$1.$2.$3/$4-$5")
const formatCnae = (v: string) => v.replace(/^(\d{4})(\d)(\d{2})$/, "$1-$2/$3")
type Filters = { uf: string; cidade: string; cnae: string; secundarios: boolean }
export function ReceitaView() {
  const [status, setStatus] = useState<ReceitaStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [importing, setImporting] = useState(false)
  const [error, setError] = useState("")
  const [form, setForm] = useState<Filters>({ uf: "BA", cidade: "", cnae: "", secundarios: false })
  const [cnaeQuery, setCnaeQuery] = useState("")
  const [options, setOptions] = useState<{ codigo: string; descricao: string }[]>([])
  const [data, setData] = useState<ReceitaResults | null>(null)
  const [applied, setApplied] = useState<Filters | null>(null)
  const [selected, setSelected] = useState<string[]>([])
  const leads = useCrmStore(s => s.leads)
  const imported = new Set(leads.map(lead => lead.id))
  const load = useCallback(async () => {
    setLoading(true)
    try { const current = await getReceitaStatus(); setStatus(current); setData(null); setSelected([]); setError(""); setForm(f => { const uf = current.regions?.[f.uf] ? f.uf : Object.keys(current.regions || {})[0] || f.uf; return { ...f, uf, cidade: current.regions?.[uf]?.includes(f.cidade) ? f.cidade : "" } }) }
    catch (e) { setError(e instanceof Error ? e.message : "Não foi possível consultar a base da Receita.") }
    finally { setLoading(false) }
  }, [])
  useEffect(() => { const timer = setTimeout(() => void load(), 0); return () => clearTimeout(timer) }, [load])
  useEffect(() => {
    if (!status?.loaded || cnaeQuery.trim().length < 2 || form.cnae) return
    let active = true
    const timer = setTimeout(() => { searchReceitaCnaes(cnaeQuery).then(rows => { if (active) setOptions(rows) }).catch(() => { if (active) setOptions([]) }) }, 300)
    return () => { active = false; clearTimeout(timer) }
  }, [cnaeQuery, form.cnae, status?.loaded])
  async function search(filters: Filters, page = 1) {
    if (!status?.regions?.[filters.uf]) { setError(`A UF ${filters.uf} ainda não tem dados na base carregada.`); return }
    if (filters.cidade && !status?.regions?.[filters.uf]?.includes(filters.cidade)) { setError("Escolha uma cidade da base carregada."); return }
    setBusy(true); setError("")
    setData(null); setSelected([])
    try { setData(await searchReceita({ ...filters, page })); setApplied(filters); setSelected([]) }
    catch (e) { setError(e instanceof Error ? e.message : "Não foi possível buscar empresas.") }
    finally { setBusy(false) }
  }
  async function importSelected() {
    setImporting(true)
    try {
      const result = await importReceitaProspects(selected)
      const store = useCrmStore.getState()
      store.replace("leads", [...result.imported, ...store.leads.filter(l => !result.imported.some(i => i.id === l.id))])
      setSelected([])
      toast.success(`${result.imported.length} lead(s) importado(s). ${result.skipped} já cadastrado(s) ou indisponível(is).`)
    } catch (e) { toast.error(e instanceof Error ? e.message : "Não foi possível importar as empresas.") }
    finally { setImporting(false) }
  }
  const selectable = (data?.items || []).filter(p => p.cnpj && !imported.has(`cnpj_${p.cnpj}`)).map(p => p.cnpj!)
  return <div className="space-y-5">
    <PageHeader title="Buscar por CNAE" description="Encontre estabelecimentos ativos pelo cadastro público da Receita Federal." actions={<><Button variant="outline" disabled={loading || busy || importing} onClick={() => void load()}><RefreshCw />Atualizar base disponível</Button><Button variant="outline" asChild><Link href="/leads">Ver leads</Link></Button></>} />
    {error && <p role="alert" className="rounded-xl border border-destructive/40 bg-destructive/5 p-4 text-sm">{error}</p>}
    {loading && <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" />Consultando a base da Receita…</p>}
    {status && <Panel title={status.loaded ? "Base pública disponível" : "Base pública ainda não carregada"}>
      {status.loaded ? <><p className="text-sm">Competência {status.month} · {status.city ? `${status.city}/` : ""}{status.uf === "BR" ? "Todas as UFs" : status.uf} · {status.total.toLocaleString("pt-BR")} estabelecimentos ativos.</p>{status.partial && <p className="mt-2 text-sm text-amber-600">Carga parcial: os resultados não representam todos os estabelecimentos da região.{!!status.missingNames && ` Razão social ausente em ${status.missingNames.toLocaleString("pt-BR")} registros desta carga.`}</p>}<p className="mt-2 text-xs text-muted-foreground">Contatos e situação cadastral refletem a competência informada. Telefone cadastrado não confirma WhatsApp ativo. A Receita não informa se a empresa tem site.</p></> : <p className="text-sm text-muted-foreground">Os arquivos públicos precisam ser carregados para habilitar a consulta por CNAE. Após a carga, os filtros pesquisarão essa base sem depender do motor do Google Maps.</p>}
    </Panel>}
    <Panel title="Filtros da Receita Federal">
      <form className="space-y-4" onSubmit={event => {
        event.preventDefault()
        const code = form.cnae || cnaeQuery.replace(/[.\-/]/g, "").trim()
        if (code && !/^\d{7}$/.test(code)) { setError("Escolha uma atividade da lista ou informe o código CNAE completo de 7 dígitos."); return }
        void search({ ...form, cnae: code })
      }}>
        <div className="grid gap-4 md:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_90px]">
          <div><label className="mb-2 block text-sm font-medium" htmlFor="receita-cnae">CNAE por código ou descrição</label><Input id="receita-cnae" value={cnaeQuery} disabled={!status?.loaded || busy || importing} maxLength={120} placeholder="Ex.: atividade odontológica ou 8630-5/04" autoComplete="off" onChange={e => { setCnaeQuery(e.target.value); setForm({ ...form, cnae: "" }); setOptions([]) }} aria-describedby="receita-cnae-help" /><p id="receita-cnae-help" className="mt-1 text-xs text-muted-foreground">Selecione uma atividade ou deixe vazio para todos os CNAEs.</p>{options.length > 0 && <ul aria-label="Atividades encontradas" className="mt-2 max-h-60 overflow-y-auto rounded-lg border bg-card">{options.map(option => <li key={option.codigo}><button type="button" className="w-full px-3 py-2 text-left text-sm hover:bg-muted" onClick={() => { setForm({ ...form, cnae: option.codigo }); setCnaeQuery(`${formatCnae(option.codigo)} · ${option.descricao}`); setOptions([]) }}>{formatCnae(option.codigo)} · {option.descricao}</button></li>)}</ul>}</div>
          <FormField label="Cidade (opcional)" hint="Escolha entre as cidades presentes na carga disponível."><EntityCombobox options={(status?.regions?.[form.uf] || []).map(city => ({ value: city, label: city }))} value={form.cidade || undefined} disabled={!status?.loaded || !status.regions?.[form.uf]?.length || busy || importing} placeholder="Todas as cidades disponíveis" searchPlaceholder="Pesquisar cidade da base…" emptyLabel="Esta cidade ainda não está na base carregada." onChange={value => setForm({ ...form, cidade: value || "" })} /></FormField>
          <label className="grid content-start gap-2 text-sm">UF<select className="h-10 rounded-lg border bg-card px-2" value={form.uf} disabled={!status?.loaded || busy || importing} onChange={e => setForm({ ...form, uf: e.target.value, cidade: "" })}>{ufs.map(uf => <option key={uf} disabled={!status?.regions?.[uf]} value={uf}>{uf}{!status?.regions?.[uf] ? " — não carregada" : ""}</option>)}</select></label>
        </div>
        {status?.loaded && <p className="text-sm text-muted-foreground">Selecione uma UF e uma cidade disponíveis na carga atual. A lista de cidades acompanha a UF escolhida.</p>}
        <div className="flex flex-wrap items-center justify-between gap-3"><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.secundarios} disabled={!status?.loaded || busy || importing} onChange={e => setForm({ ...form, secundarios: e.target.checked })} />Incluir CNAEs secundários</label><Button type="submit" disabled={!status?.loaded || busy || importing}>{busy ? <Loader2 className="animate-spin" /> : <Search />}Buscar empresas</Button></div>
      </form>
    </Panel>
    {data && <Panel title="Empresas encontradas" description={`${data.total.toLocaleString("pt-BR")} resultado(s) · ${selected.length} selecionado(s) · ${applied?.cidade ? applied.cidade + "/" : ""}${applied?.uf}${applied?.cnae ? " · CNAE " + formatCnae(applied.cnae) : ""}`} actions={<Button disabled={!selected.length || importing || busy} onClick={() => void importSelected()}>{importing ? <Loader2 className="animate-spin" /> : <Download />}Importar como leads</Button>}>
      {!!data.items.length && <label className="mb-4 flex items-center gap-2 text-sm"><input type="checkbox" disabled={busy || importing || !selectable.length} checked={selectable.length > 0 && selectable.every(id => selected.includes(id))} onChange={e => setSelected(e.target.checked ? selectable : [])} />Selecionar empresas desta página</label>}
      <div className="grid gap-3 lg:grid-cols-2">{data.items.map(p => <article key={p.id} className="rounded-xl border p-4"><div className="flex items-start gap-3"><input type="checkbox" className="mt-1" aria-label={`Selecionar ${p.nome}`} disabled={busy || importing || !p.cnpj || imported.has(`cnpj_${p.cnpj}`)} checked={selected.includes(p.cnpj || "")} onChange={e => setSelected(e.target.checked ? [...selected, p.cnpj!] : selected.filter(id => id !== p.cnpj))} /><div className="min-w-0 flex-1"><h3 className="text-sm font-semibold">{p.nome}</h3><p className="mt-1 break-words text-xs text-muted-foreground">{p.razao_social || "Razão social não disponível nesta carga parcial"}</p><p className="mt-2 text-sm">CNPJ {formatCnpj(p.cnpj || "")}</p><p className="mt-1 text-xs">CNAE principal {formatCnae(p.cnae || "")} · {p.categoria}</p><p className="mt-2 text-xs text-muted-foreground">{p.endereco} · {p.cidade}/{p.uf}</p><p className="mt-2 break-words text-sm">{p.telefone || "Telefone não informado"} · {p.email || "E-mail não informado"}</p>{imported.has(`cnpj_${p.cnpj}`) && <Link className="mt-2 inline-block text-xs text-primary" href={`/leads/cnpj_${p.cnpj}`}>Já importado · Abrir lead</Link>}</div></div></article>)}</div>
      {!data.items.length && <p className="py-6 text-center text-sm text-muted-foreground">Nenhuma empresa encontrada nos filtros e na região carregada.</p>}
      {data.total > data.pageSize && <div className="mt-4 flex items-center justify-between gap-3"><Button variant="outline" disabled={busy || importing || data.page <= 1} onClick={() => applied && void search(applied, data.page - 1)}><ChevronLeft />Anterior</Button><p role="status" className="text-xs text-muted-foreground">Página {data.page} de {Math.ceil(data.total / data.pageSize)}</p><Button variant="outline" disabled={busy || importing || data.page * data.pageSize >= data.total} onClick={() => applied && void search(applied, data.page + 1)}>Próxima<ChevronRight /></Button></div>}
    </Panel>}
  </div>
}
