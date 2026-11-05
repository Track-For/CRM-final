"use client"

import Image from "next/image"
import { useState } from "react"
import { ChevronLeft, ChevronRight, ExternalLink, Heart, Camera as Instagram, Loader2, MessageCircle, RefreshCw, Unplug } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { PageHeader } from "@/components/shared/page-header"
import { Panel } from "@/components/shared/panel"
import { StatCard, StatGrid } from "@/components/shared/stat-card"
import { disconnectInstagram, getInstagramOverview, loadMoreInstagramMedia, selectInstagramAccount, syncInstagramAccount } from "@/lib/instagram/actions"
import { mediaKind, safeInstagramUrl } from "@/lib/instagram/normalize"
import type { InstagramMedia } from "@/lib/instagram/types"

type Overview = Awaited<ReturnType<typeof getInstagramOverview>>
const notices: Record<string, string> = {
  configuration: "A conexão do Instagram está sendo preparada pela equipe responsável pelo CRM.",
  connected: "Instagram conectado. Suas informações foram atualizadas.",
  connected_sync_pending: "Instagram conectado. Não foi possível atualizar as informações agora. Tente o botão Sincronizar.",
  choose_account: "Mais de um perfil foi autorizado. Escolha abaixo qual deseja acompanhar.",
  cancelled: "A autorização foi cancelada. Você pode conectar novamente quando quiser.",
  invalid_state: "A tentativa de conexão expirou ou não corresponde a este navegador. Inicie a conexão novamente.",
  no_professional_account: "Nenhum perfil profissional vinculado às Páginas autorizadas foi encontrado. Confira o vínculo no Meta Business Suite e as Páginas selecionadas na autorização.",
  permissions: "A Meta não liberou o acesso necessário. Tente conectar novamente; se continuar, avise a equipe responsável pelo CRM.",
  authorization_failed: "Não foi possível conectar seu Instagram. Tente novamente ou avise a equipe responsável pelo CRM.",
}
const count = (value?: number) => value === undefined ? "—" : new Intl.NumberFormat("pt-BR").format(value)

function MediaCard({ item }: { item: InstagramMedia }) {
  const [index, setIndex] = useState(0)
  const slides = item.children?.data.length ? item.children.data : [item]
  const current = slides[Math.min(index, slides.length - 1)]
  const url = safeInstagramUrl(current.media_url)
  const poster = safeInstagramUrl(current.thumbnail_url)
  const link = safeInstagramUrl(item.permalink)
  return <article className="overflow-hidden rounded-xl border bg-card">
    <div className={`relative flex items-center justify-center overflow-hidden bg-muted ${mediaKind(item) === "story" ? "aspect-[9/16]" : "aspect-square"}`}>
      {current.media_type === "VIDEO" && url ? <video controls preload="none" poster={poster} src={url} className="h-full w-full object-contain" aria-label={item.caption || "Vídeo do Instagram"} /> : url || poster ? <Image unoptimized src={url || poster!} width={640} height={640} className="h-full w-full object-contain" alt={item.caption?.slice(0, 160) || "Publicação do Instagram"} /> : <div className="p-5 text-center text-xs text-muted-foreground">Prévia indisponível. Sincronize para atualizar o link da mídia.</div>}
      {slides.length > 1 && <div className="absolute right-2 bottom-2 left-2 flex items-center justify-between gap-2 rounded-lg bg-black/70 p-1 text-white"><Button size="icon" variant="ghost" aria-label="Imagem anterior" disabled={index === 0} onClick={() => setIndex(index - 1)}><ChevronLeft /></Button><span className="text-xs">{index + 1}/{slides.length}</span><Button size="icon" variant="ghost" aria-label="Próxima imagem" disabled={index === slides.length - 1} onClick={() => setIndex(index + 1)}><ChevronRight /></Button></div>}
    </div>
    <div className="space-y-3 p-4"><div className="flex items-center justify-between gap-2 text-xs text-muted-foreground"><span>{new Date(item.timestamp).toLocaleString("pt-BR")}</span>{link && <a href={link} target="_blank" rel="noopener noreferrer" className="inline-flex shrink-0 items-center gap-1 text-primary">Abrir<ExternalLink className="size-3" /></a>}</div>{item.caption && <p className="line-clamp-4 whitespace-pre-wrap break-words text-sm">{item.caption}</p>}{mediaKind(item) !== "story" && <div className="flex items-center gap-4 text-xs text-muted-foreground"><span className="inline-flex items-center gap-1"><Heart className="size-3.5" />{count(item.like_count)} curtidas</span><span className="inline-flex items-center gap-1"><MessageCircle className="size-3.5" />{count(item.comments_count)} comentários</span></div>}</div>
  </article>
}
function Gallery({ items, empty }: { items: InstagramMedia[]; empty: string }) {
  return items.length ? <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{items.map(item => <MediaCard key={item.id} item={item} />)}</div> : <div className="rounded-xl border border-dashed p-12 text-center text-sm text-muted-foreground">{empty}</div>
}

export function InstagramView({ initial, notice }: { initial: Overview; notice?: string }) {
  const [data, setData] = useState(initial)
  const [busy, setBusy] = useState("")
  const [currentNotice, setCurrentNotice] = useState(notice)
  const [error, setError] = useState("")
  const active = data.active
  const profile = active?.profile
  const profileUrl = profile ? `https://www.instagram.com/${encodeURIComponent(profile.username)}/` : undefined
  const picture = safeInstagramUrl(profile?.profile_picture_url)
  async function run(key: string, task: () => Promise<unknown>, success?: string) {
    setBusy(key); setError(""); setCurrentNotice(undefined)
    try { await task(); setData(await getInstagramOverview()); if (success) toast.success(success) }
    catch (e) { const message = e instanceof Error ? e.message : "Não foi possível concluir a operação."; setError(message); toast.error(message) }
    finally { setBusy("") }
  }

  return <div className="space-y-5">
    <PageHeader title={<span className="inline-flex items-center gap-2"><Instagram className="size-6" />Instagram</span>} description="Seu perfil, publicações, Reels e stories disponíveis em um só lugar." actions={data.canManage ? <>{active && <><Button variant="outline" disabled={!!busy} onClick={() => void run("sync", syncInstagramAccount, "Sincronização concluída. Confira os avisos abaixo, se houver.")}>{busy === "sync" ? <Loader2 className="animate-spin" /> : <RefreshCw />}Sincronizar</Button><Button variant="outline" disabled={!!busy} onClick={() => void run("disconnect", disconnectInstagram, "Conta desconectada do CRM")}><Unplug />Desconectar</Button></>}{data.configured ? <Button asChild><a href="/api/instagram/connect" aria-disabled={!!busy} onClick={event => { if (busy) event.preventDefault() }} className={busy ? "pointer-events-none opacity-50" : undefined}>{active ? "Reconectar à Meta" : "Conectar Instagram"}</a></Button> : <Button disabled>Conexão em preparação</Button>}</> : undefined} />
    {currentNotice && notices[currentNotice] && <p role="status" className="rounded-lg border bg-muted/40 p-4 text-sm">{notices[currentNotice]}</p>}
    {error && <p role="alert" className="rounded-lg border border-destructive/40 p-4 text-sm text-destructive">{error}</p>}

    {!data.configured && <Panel title="Estamos preparando a conexão"><p className="text-sm text-muted-foreground">A equipe responsável pelo CRM precisa habilitar esta conexão uma única vez. Depois, você só precisará clicar em Conectar Instagram e autorizar sua conta. </p></Panel>}
    {data.accounts.length > 0 && <Panel title="Perfil autorizado"><label className="grid gap-2 text-sm">Perfil exibido no CRM<select aria-label="Selecionar perfil Instagram" value={active?.id || ""} disabled={!data.canManage || !!busy} onChange={e => { const id = e.target.value; if (id) void run("select", async () => { await selectInstagramAccount(id); await syncInstagramAccount() }, "Perfil selecionado e atualizado.") }} className="h-10 rounded-md border bg-background px-3"><option value="">Escolha um perfil</option>{data.accounts.map(account => <option key={account.id} value={account.id}>@{account.username} · {account.pageName}</option>)}</select></label></Panel>}
    {!active ? <div className="rounded-xl border border-dashed p-12 text-center"><Instagram className="mx-auto mb-3 size-9 text-muted-foreground" /><h2 className="text-base font-semibold">{data.accounts.length ? "Selecione seu perfil" : "Conecte seu Instagram"}</h2><p className="mx-auto mt-2 max-w-lg text-sm text-muted-foreground">{data.accounts.length ? "Escolha acima o perfil autorizado que deseja acompanhar." : "Autorize o acesso na Meta para ver seu perfil e suas publicações aqui."}</p></div> : <>
      <Panel><div className="flex flex-col gap-4 sm:flex-row sm:items-start">{picture && <Image unoptimized src={picture} width={80} height={80} alt={`Foto de @${profile!.username}`} className="size-20 rounded-full object-cover" />}<div className="min-w-0 flex-1"><h2 className="text-xl font-semibold">{profile!.name || profile!.username}</h2><a href={profileUrl} target="_blank" rel="noopener noreferrer" className="text-sm text-primary">@{profile!.username}</a>{profile!.biography && <p className="mt-3 whitespace-pre-wrap break-words text-sm">{profile!.biography}</p>}{safeInstagramUrl(profile!.website) && <a href={safeInstagramUrl(profile!.website)} target="_blank" rel="noopener noreferrer" className="mt-2 inline-flex items-center gap-1 break-all text-sm text-primary">{profile!.website}<ExternalLink className="size-3 shrink-0" /></a>}<p className="mt-3 text-xs text-muted-foreground">{active.lastSyncedAt ? `Última sincronização: ${new Date(active.lastSyncedAt).toLocaleString("pt-BR")}` : "Clique em Sincronizar para carregar os detalhes do perfil."}{active.tokenExpiresAt && ` · Reautorize até ${new Date(active.tokenExpiresAt).toLocaleDateString("pt-BR")}`}</p></div></div></Panel>
      <StatGrid><StatCard label="Seguidores" value={count(profile!.followers_count)} /><StatCard label="Seguindo" value={count(profile!.follows_count)} /><StatCard label="Publicações no perfil" value={count(profile!.media_count)} /><StatCard label="Stories ativos sincronizados" value={active.storiesSyncedAt ? count(active.stories.length) : "—"} hint={active.storiesSyncedAt ? `Consultados em ${new Date(active.storiesSyncedAt).toLocaleString("pt-BR")}` : "Aguardando primeira consulta"} /></StatGrid>
      {active.warnings.length > 0 && <div role="status" className="space-y-2 rounded-lg border border-amber-500/30 bg-amber-500/5 p-4 text-sm">{active.warnings.map((warning, index) => <p key={index}>{warning}</p>)}</div>}
      <Tabs defaultValue="posts"><TabsList className="max-w-full overflow-x-auto"><TabsTrigger value="posts">Publicações</TabsTrigger><TabsTrigger value="reels">Reels</TabsTrigger><TabsTrigger value="stories">Stories</TabsTrigger><TabsTrigger value="highlights">Destaques</TabsTrigger></TabsList><TabsContent value="posts" className="mt-3"><Gallery items={active.media.filter(item => mediaKind(item) === "post")} empty="Nenhuma publicação carregada. Sincronize o perfil ou carregue mais mídias." /></TabsContent><TabsContent value="reels" className="mt-3"><Gallery items={active.media.filter(item => mediaKind(item) === "reel")} empty="Nenhum Reel nas mídias carregadas. Sincronize ou carregue mais mídias." /></TabsContent><TabsContent value="stories" className="mt-3 space-y-3"><p className="text-xs text-muted-foreground">Stories ativos disponíveis na última sincronização. Mídias com mais de 24 horas não são exibidas como stories ativos.</p><Gallery items={active.stories} empty="Nenhum story ativo disponível na última consulta. Se houver aviso de permissão, reconecte a conta." /></TabsContent><TabsContent value="highlights" className="mt-3"><Panel title="Destaques do perfil"><p className="text-sm text-muted-foreground">A integração oficial utilizada não disponibiliza uma lista de destaques. Eles podem ser consultados diretamente no seu perfil do Instagram.</p><Button asChild variant="outline" className="mt-4"><a href={profileUrl} target="_blank" rel="noopener noreferrer">Abrir perfil no Instagram<ExternalLink /></a></Button></Panel></TabsContent></Tabs>
      <div className="flex flex-wrap items-center justify-between gap-3"><p className="text-xs text-muted-foreground">{active.media.length} mídia(s) carregada(s). Os valores de curtidas e comentários aparecem quando disponibilizados pela Meta. Sincronizar atualiza as 25 mídias mais recentes.</p>{active.mediaCursor && data.canManage && <Button variant="outline" disabled={!!busy} onClick={() => void run("more", loadMoreInstagramMedia)}>{busy === "more" && <Loader2 className="animate-spin" />}Carregar mais mídias</Button>}</div>
    </>}
  </div>
}
