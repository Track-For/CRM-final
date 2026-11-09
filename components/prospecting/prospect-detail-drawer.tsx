"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { CalendarClock, Download, ExternalLink, Loader2, Mail, MapPin, MessageCircle, Phone, Star } from "lucide-react"
import { ProspectMessageComposer } from "./prospect-message-composer"
import { EntityDrawer } from "@/components/shared/entity-drawer"
import { StatusBadge } from "@/components/shared/status-badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { getProspectDetail, updateProspect } from "@/lib/prospecting/actions"
import { prospectUrl } from "@/lib/prospecting/links"
import { whatsappLink } from "@/lib/format"
import { toast } from "@/lib/store/save-feedback"
import type { Prospect, ProspectDetail, ProspectSearch, ProspectStage } from "@/lib/prospecting/types"

interface Props {
  prospect: Prospect
  searches: ProspectSearch[]
  imported: boolean
  importing: boolean
  onImport: () => Promise<void>
  onUpdated: (prospect: ProspectDetail) => void
  onClose: () => void
}
const dateTime = (value?: number | null) => value && Number.isFinite(value) ? new Date(value * 1000).toLocaleString("pt-BR") : "Não informado"
function localInput(value?: number | null) {
  if (!value) return ""
  const date = new Date(value * 1000)
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16)
}
function Detail({ label, children }: { label: string; children?: React.ReactNode }) {
  return <div className="grid gap-1 py-2 sm:grid-cols-[125px_1fr] sm:gap-4"><dt className="text-muted-foreground">{label}</dt><dd className="min-w-0 break-words">{children || <span className="text-muted-foreground">Não informado</span>}</dd></div>
}
function WebLink({ value, social }: { value?: string; social?: "instagram" | "facebook" }) {
  const href = prospectUrl(value, social)
  return href ? <a href={href} target="_blank" rel="noopener noreferrer" className="inline-flex max-w-full items-start gap-1.5 text-primary hover:underline"><span className="min-w-0 break-all">{value}</span><ExternalLink className="mt-0.5 size-3 shrink-0" /><span className="sr-only">Abrir em nova aba</span></a> : <span className="text-muted-foreground">Não informado</span>
}

export function ProspectDetailDrawer({ prospect, searches, imported, importing, onImport, onUpdated, onClose }: Props) {
  const [detail, setDetail] = useState<ProspectDetail>(prospect)
  const [stages, setStages] = useState<ProspectStage[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [busy, setBusy] = useState(false)
  const [notes, setNotes] = useState("")
  const [followUp, setFollowUp] = useState("")
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    let active = true
    getProspectDetail(prospect.id).then(result => {
      if (!active) return
      setDetail(result.prospect); setStages(result.stages); setNotes(result.prospect.obs || ""); setFollowUp(localInput(result.prospect.retorno)); setError("")
    }).catch(e => { if (active) setError(e instanceof Error ? e.message : "Não foi possível carregar a ficha.") }).finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [prospect.id, attempt])
  async function save(patch: { status?: string; obs?: string; retorno?: number | null }) {
    if (busy) return
    setBusy(true)
    try { const updated = await updateProspect(prospect.id, patch); setDetail(updated); onUpdated(updated); toast.success("Ficha atualizada") }
    catch (e) { toast.error(e instanceof Error ? e.message : "Não foi possível salvar a ficha.") }
    finally { setBusy(false) }
  }
  const status = stages.find(s => s.id === detail.status)?.nome || detail.status || "Novo"
  const phone = (detail.telefone || "").replace(/[^\d+]/g, "")
  const whatsapp = detail.whatsapp?.replace(/\D/g, "")
  const email = detail.email?.trim()
  const origins = searches.filter(s => detail.buscas?.includes(s.id))
  const rating = Number(String(detail.nota || "").replace(",", "."))
  const notesChanged = notes !== (detail.obs || "")
  const followUpChanged = followUp !== localInput(detail.retorno)
  return <EntityDrawer open onOpenChange={open => { if (!open) onClose() }} size="lg" title={detail.nome} badge={<StatusBadge tone={detail.status === "fechado" ? "success" : detail.status === "descartado" ? "danger" : "brand"}>{status}</StatusBadge>}
    description={<span className="flex flex-wrap items-center gap-x-2 gap-y-1">{detail.categoria || "Empresa encontrada no Google Maps"}{rating > 0 && <span className="inline-flex items-center gap-1"><Star className="size-3.5 fill-amber-400 text-amber-500" />{rating.toLocaleString("pt-BR", { minimumFractionDigits: 1 })} ({detail.avaliacoes || 0} avaliações)</span>}</span>}
    footer={imported ? <Button asChild><Link href={`/leads/maps_${detail.id}`}>Abrir lead no CRM<ExternalLink /></Link></Button> : <Button disabled={importing} onClick={() => void onImport()}>{importing ? <Loader2 className="animate-spin" /> : <Download />}Importar para o CRM</Button>}>
    <div className="space-y-7">
      {loading && <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" />Carregando acompanhamento…</p>}
      {error && <div role="alert" className="rounded-lg border border-destructive/30 p-3 text-sm"><p>{error}</p><Button variant="outline" size="sm" className="mt-2" onClick={() => { setLoading(true); setAttempt(n => n + 1) }}>Tentar novamente</Button></div>}
      <section aria-label="Etapa na prospecção"><h3 className="mb-3 text-xs font-semibold tracking-wide text-muted-foreground uppercase">Etapa na prospecção</h3><div className="flex flex-wrap gap-2">{stages.map(stage => <Button key={stage.id} variant={detail.status === stage.id ? "default" : "outline"} size="sm" disabled={busy || loading || !!error} aria-pressed={detail.status === stage.id} onClick={() => void save({ status: stage.id })}>{stage.nome}</Button>)}</div><p className="mt-2 text-xs text-muted-foreground">Acompanhe o contato no motor de buscas. Depois de importar, o lead também terá seu acompanhamento no CRM.</p></section>
      <section><h3 className="mb-3 text-xs font-semibold tracking-wide text-muted-foreground uppercase">Dados da empresa</h3><dl className="text-sm">
        <Detail label="Telefone">{phone ? <span className="inline-flex flex-wrap items-center gap-2"><a className="text-primary hover:underline" href={`tel:${phone}`}>{detail.telefone}</a>{detail.tel_tipo && <StatusBadge dot={false}>{detail.tel_tipo}</StatusBadge>}</span> : undefined}</Detail>
        <Detail label="WhatsApp">{whatsapp ? <a className="text-primary hover:underline" href={whatsappLink(whatsapp)} target="_blank" rel="noopener noreferrer">{detail.whatsapp}</a> : undefined}</Detail>
        <Detail label="E-mail">{email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? <a className="break-all text-primary hover:underline" href={`mailto:${email}`}>{email}</a> : undefined}</Detail>
        <Detail label="Site"><WebLink value={detail.site} /></Detail>
        <Detail label="Instagram"><WebLink value={detail.instagram} social="instagram" /></Detail>
        <Detail label="Facebook"><WebLink value={detail.facebook} social="facebook" /></Detail>
        {detail.linkedin && <Detail label="LinkedIn"><WebLink value={detail.linkedin} /></Detail>}
        <Detail label="Endereço">{detail.endereco}</Detail><Detail label="Bairro">{detail.bairro}</Detail><Detail label="Cidade">{[detail.cidade, detail.uf].filter(Boolean).join(" / ")}</Detail><Detail label="CEP">{detail.cep}</Detail>
        <Detail label="Origem">{origins.length ? <ul className="space-y-2">{origins.map(s => <li key={s.id}><p className="font-medium">{s.parametros.nichos.join(", ")}</p><p className="text-xs text-muted-foreground">{s.parametros.cidade}/{s.parametros.uf} · {dateTime(s.criado_em)}</p></li>)}</ul> : detail.nicho || "Google Maps"}</Detail>
      </dl><div className="mt-4 flex flex-wrap gap-2">
        {whatsapp && <Button size="sm" variant="outline" asChild><a href={whatsappLink(whatsapp)} target="_blank" rel="noopener noreferrer"><MessageCircle />WhatsApp</a></Button>}
        {phone && <Button size="sm" variant="outline" asChild><a href={`tel:${phone}`}><Phone />Ligar</a></Button>}
        {email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && <Button size="sm" variant="outline" asChild><a href={`mailto:${email}`}><Mail />E-mail</a></Button>}
        {prospectUrl(detail.maps) && <Button size="sm" variant="outline" asChild><a href={prospectUrl(detail.maps)} target="_blank" rel="noopener noreferrer"><MapPin />Google Maps</a></Button>}
      </div></section>
      <ProspectMessageComposer prospect={detail} disabled={loading || !!error || busy} onSent={updated => { setDetail(updated); onUpdated(updated) }} />
      <section className="rounded-xl border bg-muted/20 p-4"><h3 className="mb-4 flex items-center gap-2 font-semibold"><CalendarClock className="size-4 text-primary" />Acompanhamento</h3>
        <form className="space-y-4" onSubmit={event => { event.preventDefault(); void save({ ...(notesChanged ? { obs: notes } : {}), ...(followUpChanged ? { retorno: followUp ? new Date(followUp).getTime() / 1000 : null } : {}) }) }}>
          <label className="grid gap-2 text-sm">Observações<Textarea value={notes} onChange={event => setNotes(event.target.value)} disabled={loading || !!error} maxLength={2000} rows={4} placeholder="Registre o contexto, necessidades e próximos passos…" /></label>
          <label className="grid gap-2 text-sm">Próximo retorno<Input type="datetime-local" value={followUp} onChange={event => setFollowUp(event.target.value)} disabled={loading || !!error} /></label>
          <Button type="submit" size="sm" disabled={busy || loading || !!error || (!notesChanged && !followUpChanged)}>{busy && <Loader2 className="animate-spin" />}Salvar acompanhamento</Button>
        </form>
      </section>
      <section><h3 className="mb-3 text-xs font-semibold tracking-wide text-muted-foreground uppercase">Histórico</h3>{detail.historico?.length ? <ol className="space-y-4 border-l pl-4">{[...detail.historico].reverse().map((item, index) => <li key={`${item.t}-${index}`} className="text-sm"><p className="whitespace-pre-wrap break-words">{item.txt}</p><p className="mt-1 text-xs text-muted-foreground">{dateTime(item.t)}</p></li>)}</ol> : <p className="text-sm text-muted-foreground">{loading ? "Carregando histórico…" : "Nenhuma atividade registrada."}</p>}</section>
    </div>
  </EntityDrawer>
}
