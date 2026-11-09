"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import Link from "next/link"
import { Loader2, Search, RefreshCw, Download, ExternalLink, History, Building2, Star, ChevronDown, Trash2 } from "lucide-react"
import { toast } from "@/lib/store/save-feedback"
import { PageHeader } from "@/components/shared/page-header"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog"
import { useCrmStore } from "@/lib/store/crm-store"
import { cancelProspectSearch, createProspectSearch, deleteProspects, importProspects, loadProspecting } from "@/lib/prospecting/actions"
import { ProspectDetailDrawer } from "./prospect-detail-drawer"
import { prospectUrl as safeUrl } from "@/lib/prospecting/links"
import type { Prospect } from "@/lib/prospecting/types"

type Data = Awaited<ReturnType<typeof loadProspecting>>
const states = "AC AL AP AM BA CE DF ES GO MA MT MS MG PA PB PR PE PI RJ RN RS RO RR SC SP SE TO".split(" ")
const selectClass = "h-10 w-full rounded-lg border border-input bg-card px-3 text-sm outline-none focus-visible:ring-3 focus-visible:ring-primary/15"
export function ProspectingView() {
  const [data, setData] = useState<Data | null>(null)
  const [error, setError] = useState("")
  const [busy, setBusy] = useState(false)
  const [importing, setImporting] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const refreshingRef = useRef(false)
  const dataVersion = useRef(0)
  const [deleting, setDeleting] = useState(false)
  const [deleteIds, setDeleteIds] = useState<string[]>([])
  const [selected, setSelected] = useState<string[]>([])
  const [searchFormOpen, setSearchFormOpen] = useState(false)
  const [activeId, setActiveId] = useState<string | null>(null)
  const [searchId, setSearchId] = useState("")
  const [query, setQuery] = useState("")
  const [form, setForm] = useState({ nichos: "", cidade: "", uf: "BA", bairro: "", tamanho: "padrao" as "rapida" | "padrao" | "completa" | "cidade", redes: true, somente_sem_site: false })
  const leads = useCrmStore(s => s.leads)
  const refresh = useCallback(async () => {
    if (refreshingRef.current) return
    refreshingRef.current = true
    setRefreshing(true)
    const version = dataVersion.current
    try { const updated = await loadProspecting(); if (version === dataVersion.current) { setData(updated); setSelected(ids => ids.filter(id => updated.prospects.some(p => p.id === id))); setError("") } } catch (e) { setError(e instanceof Error ? e.message : "Não foi possível atualizar as buscas.") }
    finally { refreshingRef.current = false; setRefreshing(false) }
  }, [])
  useEffect(() => { const initial = setTimeout(() => void refresh(), 0); const timer = setInterval(() => void refresh(), 10000); return () => { clearTimeout(initial); clearInterval(timer) } }, [refresh])
  const importedIds = new Set(leads.map(l => l.id))
  const results = (data?.prospects || []).filter(p => (!searchId || p.buscas?.includes(searchId)) && `${p.nome} ${p.categoria} ${p.cidade}`.toLowerCase().includes(query.toLowerCase()))
  const importableSelected = selected.filter(id => !importedIds.has(`maps_${id}`))
  async function start(event: React.FormEvent) {
    event.preventDefault(); setBusy(true)
    try { const result = await createProspectSearch(form); setSearchId(result.id); setSelected([]); toast.success("Busca adicionada à fila"); await refresh() }
    catch (e) { toast.error(e instanceof Error ? e.message : "Falha ao iniciar busca") }
    finally { setBusy(false) }
  }
  const activeProspect = data?.prospects.find(p => p.id === activeId)
  async function removeSelected() {
    if (deleting || !deleteIds.length) return
    setDeleting(true)
    try {
      const result = await deleteProspects(deleteIds)
      dataVersion.current += 1
      setData(current => current ? { ...current, prospects: current.prospects.filter(p => !deleteIds.includes(p.id)) } : current)
      setSelected(ids => ids.filter(id => !deleteIds.includes(id)))
      if (activeId && deleteIds.includes(activeId)) setActiveId(null)
      setDeleteIds([])
      toast.success(`${result.excluidos} lead(s) apagado(s) das buscas.`)
      await refresh()
    } catch (e) { toast.error(e instanceof Error ? e.message : "Não foi possível apagar os leads.") }
    finally { setDeleting(false) }
  }
  async function importSelected(ids = importableSelected) {
    setImporting(true)
    try {
      const result = await importProspects(ids)
      const store = useCrmStore.getState()
      store.replace("leads", [...result.imported, ...store.leads.filter(l => !result.imported.some(i => i.id === l.id))])
      setSelected([])
      toast.success(`${result.imported.length} lead(s) importado(s). ${result.skipped} já cadastrado(s) ou indisponível(is).`)
    } catch (e) { toast.error(e instanceof Error ? e.message : "Falha ao importar") }
    finally { setImporting(false) }
  }
  async function cancel(id: string) {
    try { await cancelProspectSearch(id); toast.success("Cancelamento solicitado"); await refresh() }
    catch (e) { toast.error(e instanceof Error ? e.message : "Falha ao cancelar") }
  }
  function contact(p: Prospect) { return p.whatsapp || p.telefone || "Sem telefone" }
  return <div>
    <PageHeader title="Buscar clientes" description="Encontre empresas no Google Maps e traga novos contatos para o seu funil comercial." actions={<><Button variant="outline" onClick={() => void refresh()} disabled={refreshing}><RefreshCw className={refreshing ? "animate-spin" : ""} />Atualizar</Button><Button variant="outline" asChild><Link href="/leads">Ver leads</Link></Button></>} />
    {error && <div role="alert" className="mb-5 rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm">{error}</div>}
    <div className="grid gap-5 xl:grid-cols-[300px_minmax(0,1fr)] 2xl:grid-cols-[320px_minmax(0,1fr)]">
      <section className="h-fit rounded-2xl border bg-card p-5 xl:sticky xl:top-24">
        <button type="button" aria-expanded={searchFormOpen} aria-controls="prospect-search-form" className="flex w-full items-center gap-3 text-left text-sm font-semibold xl:hidden" onClick={() => setSearchFormOpen(open => !open)}><span className="flex size-9 items-center justify-center rounded-lg bg-brand-soft text-primary"><Search className="size-4" /></span>Nova busca<ChevronDown className={`ml-auto size-4 transition-transform ${searchFormOpen ? "rotate-180" : ""}`} /></button>
        <div className="hidden xl:block"><span className="mb-4 flex size-10 items-center justify-center rounded-xl bg-brand-soft text-primary"><Search className="size-5" /></span><h2 className="mb-1 font-semibold">Nova busca</h2><p className="mb-5 text-sm text-muted-foreground">Escolha o segmento e a região onde deseja prospectar.</p></div>
        <form id="prospect-search-form" onSubmit={start} className={`${searchFormOpen ? "mt-5 block" : "hidden"} space-y-4 xl:mt-0 xl:block`}>
          <label className="grid gap-2 text-sm">Segmentos ou nichos<Input required minLength={2} maxLength={500} placeholder="Clínicas, academias, restaurantes" value={form.nichos} onChange={e => setForm({ ...form, nichos: e.target.value })} /><span className="text-xs text-muted-foreground">Separe os segmentos por vírgula. Até 10 por busca.</span></label>
          <div className="grid grid-cols-[1fr_85px] gap-3"><label className="grid gap-2 text-sm">Cidade<Input required minLength={2} maxLength={100} placeholder="Salvador" value={form.cidade} onChange={e => setForm({ ...form, cidade: e.target.value })} /></label><label className="grid gap-2 text-sm">UF<select className={selectClass} value={form.uf} onChange={e => setForm({ ...form, uf: e.target.value })}>{states.map(uf => <option key={uf}>{uf}</option>)}</select></label></div>
          <label className="grid gap-2 text-sm">Bairro (opcional)<Input maxLength={100} placeholder="Todos os bairros" value={form.bairro} onChange={e => setForm({ ...form, bairro: e.target.value })} /></label>
          <label className="grid gap-2 text-sm">Abrangência<select className={selectClass} value={form.tamanho} onChange={e => setForm({ ...form, tamanho: e.target.value as typeof form.tamanho })}><option value="rapida">Rápida</option><option value="padrao">Padrão</option><option value="completa">Completa</option><option value="cidade">Cidade inteira (9 regiões)</option></select></label>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.redes} onChange={e => setForm({ ...form, redes: e.target.checked })} />Coletar redes sociais nos sites</label>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.somente_sem_site} onChange={e => setForm({ ...form, somente_sem_site: e.target.checked })} />Somente empresas sem site</label>
          <Button type="submit" className="w-full" disabled={busy || !data?.status.motor}>{busy ? <Loader2 className="animate-spin" /> : <Search />}Iniciar busca</Button>
          <p className="text-xs text-muted-foreground" role="status">{data ? (data.status.motor ? `Motor conectado · ${data.status.fila} busca(s) na fila` : "Motor desconectado. Inicie o motor para buscar.") : "Conectando ao serviço de buscas…"} As buscas rodam uma de cada vez e continuam ao sair desta tela.</p>
        </form>
      </section>
      <div className="min-w-0 space-y-5">
        <section className="rounded-2xl border bg-card p-5"><h2 className="mb-4 flex items-center gap-2 text-sm font-semibold"><History className="size-4 text-muted-foreground" />Histórico de buscas</h2>
          {!data?.searches.length && <p className="text-sm text-muted-foreground">Suas buscas e o andamento de cada uma aparecerão aqui.</p>}
          <div className="max-h-72 space-y-3 overflow-y-auto">{data?.searches.map(s => <div key={s.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3"><button type="button" onClick={() => { setSearchId(s.id); setSelected([]) }} className="min-w-0 flex-1 text-left"><p className="text-sm font-medium">{s.parametros.nichos.join(", ")} · {s.parametros.cidade}/{s.parametros.uf}</p><p className="mt-1 text-xs text-muted-foreground">{s.etapa} · {s.total} resultados · {new Date(s.criado_em * 1000).toLocaleString("pt-BR")}</p>{s.avisos?.map((a, i) => <p key={i} className="mt-1 text-xs text-amber-500">{a}</p>)}</button>{["rodando", "na_fila"].includes(s.estado) && <Button size="sm" variant="outline" onClick={() => void cancel(s.id)}>Cancelar</Button>}</div>)}</div>
        </section>
        <section className="min-w-0 rounded-2xl border bg-card p-4 sm:p-5">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3"><div><h2 className="flex items-center gap-2 text-sm font-semibold"><Building2 className="size-4 text-primary" />Empresas encontradas</h2><p className="text-sm text-muted-foreground">{results.length} resultado(s) · {selected.length} selecionado(s)</p><p className="mt-1 text-xs text-muted-foreground">Clique em uma empresa para ver a ficha completa e acompanhar o contato.</p></div><div className="flex flex-wrap gap-2"><Button variant="destructive" disabled={!selected.length || importing || deleting} onClick={() => setDeleteIds([...selected])}><Trash2 />Apagar selecionados</Button><Button disabled={!importableSelected.length || importing || deleting} onClick={() => void importSelected()}>{importing ? <Loader2 className="animate-spin" /> : <Download />}Importar como leads</Button></div></div>
          <div className="mb-4 flex flex-col gap-3 sm:flex-row"><Input aria-label="Filtrar empresas" placeholder="Filtrar por nome, segmento ou cidade" value={query} onChange={e => { setQuery(e.target.value); setSelected([]) }} /><select aria-label="Filtrar por busca" className={selectClass} value={searchId} onChange={e => { setSearchId(e.target.value); setSelected([]) }}><option value="">Todas as buscas</option>{data?.searches.map(s => <option key={s.id} value={s.id}>{s.parametros.nichos.join(", ")} · {s.parametros.cidade} · {new Date(s.criado_em * 1000).toLocaleString("pt-BR")}</option>)}</select></div>
          <div className="hidden overflow-x-auto rounded-xl border md:block"><table className="w-full min-w-[600px] text-left text-sm"><thead><tr className="border-b bg-surface/70 text-[11px] text-muted-foreground"><th className="p-3"><input type="checkbox" aria-label="Selecionar até 200 empresas visíveis" disabled={importing || deleting} checked={results.length > 0 && results.slice(0, 200).every(p => selected.includes(p.id))} onChange={e => setSelected(e.target.checked ? results.slice(0, 200).map(p => p.id) : [])} /></th><th className="p-3">Empresa</th><th className="p-3">Contato</th><th className="p-3">Presença digital</th><th className="p-3">Ações</th></tr></thead><tbody>{results.map(p => <tr key={p.id} className="cursor-pointer border-b transition-colors last:border-0 hover:bg-muted/40" onClick={event => { if (!(event.target as HTMLElement).closest("a, button, input")) setActiveId(p.id) }}><td className="p-3"><input type="checkbox" aria-label={`Selecionar ${p.nome}`} disabled={importing || deleting || (!selected.includes(p.id) && selected.length >= 200)} checked={selected.includes(p.id)} onChange={e => setSelected(e.target.checked ? [...selected, p.id] : selected.filter(id => id !== p.id))} /></td><td className="p-3"><button type="button" onClick={() => setActiveId(p.id)} className="max-w-64 text-left font-semibold text-foreground underline-offset-4 hover:underline focus-visible:rounded focus-visible:outline-2 focus-visible:outline-ring" aria-label={`Ver ficha de ${p.nome}`}>{p.nome}</button><p className="text-xs text-muted-foreground">{p.categoria} · {p.cidade}/{p.uf}</p>{p.endereco && <p title={p.endereco} className="mt-1 max-w-64 truncate text-xs text-muted-foreground">{p.endereco}</p>}{importedIds.has(`maps_${p.id}`) && <Link href={`/leads/maps_${p.id}`} className="text-xs text-primary">Já importado · Abrir lead</Link>}</td><td className="p-3"><p>{contact(p)}</p><p title={p.email || ""} className="mt-1 max-w-44 truncate text-xs text-muted-foreground">{p.email || "Sem e-mail"}</p></td><td className="p-3"><div className="flex flex-col gap-2">{safeUrl(p.site) ? <a href={safeUrl(p.site)} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-primary">Site<ExternalLink className="size-3" /></a> : <span className="text-muted-foreground">Sem site</span>}{safeUrl(p.maps) && <a href={safeUrl(p.maps)} target="_blank" rel="noopener noreferrer" className="text-xs text-primary">Google Maps</a>}<span className="inline-flex items-center gap-1 text-xs text-muted-foreground"><Star className="size-3 fill-amber-400 text-amber-400" />{p.nota || "—"} · {p.avaliacoes || 0} avaliações</span></div></td><td className="p-3"><Button size="sm" variant="ghost" className="text-destructive" aria-label={`Apagar ${p.nome} das buscas`} disabled={importing || deleting} onClick={() => setDeleteIds([p.id])}><Trash2 />Apagar</Button></td></tr>)}</tbody></table></div>
          <div className="space-y-3 md:hidden">{results.map(p => <article key={p.id} className="rounded-xl border bg-card p-4"><div className="flex items-start gap-3"><input type="checkbox" className="mt-1 size-4 shrink-0" aria-label={`Selecionar ${p.nome}`} disabled={importing || deleting || (!selected.includes(p.id) && selected.length >= 200)} checked={selected.includes(p.id)} onChange={e => setSelected(e.target.checked ? [...selected, p.id] : selected.filter(id => id !== p.id))} /><div className="min-w-0 flex-1"><button type="button" className="text-left text-sm leading-relaxed font-semibold hover:text-primary" onClick={() => setActiveId(p.id)}>{p.nome}</button><p className="mt-1 text-xs text-muted-foreground">{p.categoria} · {p.cidade}/{p.uf}</p><p className="mt-3 text-sm">{contact(p)}</p>{p.email && <p className="mt-1 truncate text-xs text-muted-foreground">{p.email}</p>}<div className="mt-3 flex items-center justify-between gap-2"><span className="inline-flex items-center gap-1 text-xs text-muted-foreground"><Star className="size-3 fill-amber-400 text-amber-400" />{p.nota || "—"} · {p.avaliacoes || 0}</span><button type="button" className="min-h-9 text-xs font-medium text-primary" onClick={() => setActiveId(p.id)}>Ver ficha <span aria-hidden="true">↗</span></button></div>{importedIds.has(`maps_${p.id}`) && <p className="mt-2 text-xs text-success">Importado para o CRM</p>}<Button size="sm" variant="ghost" className="mt-2 text-destructive" aria-label={`Apagar ${p.nome} das buscas`} disabled={importing || deleting} onClick={() => setDeleteIds([p.id])}><Trash2 />Apagar</Button></div></div></article>)}</div>
          {!results.length && <div className="py-12 text-center text-sm text-muted-foreground">{data?.searches.some(s => ["rodando", "na_fila"].includes(s.estado)) ? "Busca em andamento. Os resultados aparecerão automaticamente." : "Inicie uma busca para encontrar potenciais clientes."}</div>}
        </section>
      </div>
    </div>
    <AlertDialog open={deleteIds.length > 0} onOpenChange={open => { if (!open && !deleting) setDeleteIds([]) }}>
      <AlertDialogContent>
        <AlertDialogHeader><AlertDialogTitle>Apagar {deleteIds.length === 1 ? "este lead" : `estes ${deleteIds.length} leads`} das buscas?</AlertDialogTitle><AlertDialogDescription>{deleteIds.length === 1 ? data?.prospects.find(p => p.id === deleteIds[0])?.nome + ". " : ""}Os contatos selecionados serão removidos de todas as buscas. Leads já importados para o CRM serão mantidos.</AlertDialogDescription></AlertDialogHeader>
        <AlertDialogFooter><AlertDialogCancel disabled={deleting}>Cancelar</AlertDialogCancel><Button variant="destructive" disabled={deleting} onClick={() => void removeSelected()}>{deleting ? <Loader2 className="animate-spin" /> : <Trash2 />}{deleting ? "Apagando…" : "Apagar"}</Button></AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
    {activeProspect && <ProspectDetailDrawer key={activeProspect.id} prospect={activeProspect} searches={data?.searches || []} imported={importedIds.has(`maps_${activeProspect.id}`)} importing={importing} onImport={() => importSelected([activeProspect.id])} onUpdated={updated => setData(current => current ? { ...current, prospects: current.prospects.map(p => p.id === updated.id ? updated : p) } : current)} onClose={() => setActiveId(null)} />}
  </div>
}
