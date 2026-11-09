"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { CalendarDays, Loader2, RefreshCw, Unplug } from "lucide-react"
import { toast } from "@/lib/store/save-feedback"
import { Button } from "@/components/ui/button"
import { Panel } from "@/components/shared/panel"
import { disconnectGoogleCalendar, getGoogleCalendarState, refreshGoogleCalendars, selectGoogleCalendar, syncGoogleCalendarRange } from "@/lib/google-calendar/actions"
import { applyGoogleCalendarState, useGoogleCalendarStore } from "@/lib/google-calendar/ui-store"

const notices: Record<string, string> = {
  connected: "Conta Google conectada. Os compromissos serão carregados na sua agenda.",
  configuration: "A conexão está sendo preparada pela equipe responsável pelo CRM.",
  cancelled: "A conexão com o Google foi cancelada. Você pode tentar novamente.",
  invalid_state: "A tentativa de conexão expirou. Clique em Conectar Google Agenda novamente.",
  permissions: "O acesso à agenda não foi autorizado. Conecte novamente e permita o acesso solicitado pelo Google.",
  offline_required: "O Google não liberou a sincronização contínua. Conecte novamente e confirme a autorização.",
  no_calendars: "Sua conta foi conectada, mas nenhuma agenda disponível foi encontrada.",
  authorization_failed: "Não foi possível concluir a conexão. Tente novamente ou avise a equipe responsável pelo CRM.",
}
export function GoogleCalendarConnection({ from, to, notice }: { from: string; to: string; notice?: string }) {
  const data = useGoogleCalendarStore(s => s.data)
  const [busy, setBusy] = useState("")
  const [error, setError] = useState("")
  const [message, setMessage] = useState(notice ? notices[notice] : undefined)
  const generation = useRef(Symbol())
  const inFlight = useRef<symbol | null>(null)
  const refresh = useCallback(async (sync = true) => {
    const current = generation.current
    if (inFlight.current === current) return
    inFlight.current = current
    setBusy("sync")
    try {
      let result = await getGoogleCalendarState()
      if (sync && result.connected && result.selectedCalendarId) result = await syncGoogleCalendarRange({ from, to })
      if (generation.current === current) { applyGoogleCalendarState(result); setError("") }
    } catch (e) {
      if (generation.current === current) {
        setError(e instanceof Error ? e.message : "Não foi possível atualizar o Google Agenda.")
        try { const latest = await getGoogleCalendarState(); if (generation.current === current) applyGoogleCalendarState(latest) } catch {}
      }
    } finally { if (generation.current === current) setBusy(""); if (inFlight.current === current) inFlight.current = null }
  }, [from, to])
  useEffect(() => {
    generation.current = Symbol()
    const initial = setTimeout(() => void refresh(), 0)
    const timer = setInterval(() => { if (document.visibilityState === "visible") void refresh() }, 60000)
    return () => { generation.current = Symbol(); clearTimeout(initial); clearInterval(timer) }
  }, [refresh])
  async function choose(id: string) {
    const current = Symbol(); generation.current = current; inFlight.current = current
    setBusy("select"); setError(""); setMessage(undefined)
    try {
      const selected = await selectGoogleCalendar(id)
      if (generation.current !== current) return
      applyGoogleCalendarState(selected)
      const synced = await syncGoogleCalendarRange({ from, to })
      if (generation.current === current) applyGoogleCalendarState(synced)
    } catch (e) { if (generation.current === current) setError(e instanceof Error ? e.message : "Não foi possível selecionar a agenda.") }
    finally { if (generation.current === current) setBusy(""); if (inFlight.current === current) inFlight.current = null }
  }
  async function disconnect() {
    const current = Symbol(); generation.current = current; inFlight.current = current
    setBusy("disconnect"); setMessage(undefined)
    try {
      const result = await disconnectGoogleCalendar()
      if (generation.current === current) { applyGoogleCalendarState(result); setError(""); toast.success("Google Agenda desconectado") }
    } catch (e) { if (generation.current === current) setError(e instanceof Error ? e.message : "Não foi possível desconectar.") }
    finally { if (generation.current === current) setBusy(""); if (inFlight.current === current) inFlight.current = null }
  }
  async function calendars() {
    const current = Symbol(); generation.current = current; inFlight.current = current
    setBusy("calendars")
    try {
      const result = await refreshGoogleCalendars()
      if (generation.current === current) { applyGoogleCalendarState(result); setError("") }
    } catch (e) { if (generation.current === current) setError(e instanceof Error ? e.message : "Não foi possível atualizar as agendas.") }
    finally { if (generation.current === current) setBusy(""); if (inFlight.current === current) inFlight.current = null }
  }
  return <div className="mb-5 space-y-3"><Panel title="Google Agenda" description={data?.email ? `Conta: ${data.email}` : "Conecte sua conta Google para acompanhar seus compromissos aqui."}>
    <div className="mb-4 flex flex-wrap gap-2">{data?.configured ? <div className="flex flex-wrap gap-2">{data.connected && <><Button variant="outline" size="sm" disabled={!!busy} onClick={() => void refresh()}>{busy === "sync" ? <Loader2 className="animate-spin" /> : <RefreshCw />}Sincronizar</Button><Button variant="ghost" size="sm" disabled={!!busy} onClick={() => void disconnect()}><Unplug />Desconectar</Button></>}<Button size="sm" asChild><a href="/api/google-calendar/connect" aria-disabled={!!busy} onClick={e => { if (busy) e.preventDefault() }} className={busy ? "pointer-events-none opacity-50" : undefined}><CalendarDays />{data.connected || data.needsReconnect ? "Trocar ou reconectar conta" : "Conectar Google Agenda"}</a></Button></div> : <Button size="sm" disabled>{data ? "Conexão em preparação" : "Verificando conexão…"}</Button>}</div>
    {!data?.configured ? <p className="text-sm text-muted-foreground">A equipe responsável pelo CRM habilita esta conexão uma única vez. Depois, basta escolher sua conta Google e autorizar o acesso.</p> : data.connected ? <div className="space-y-3"><div className="flex flex-col gap-2 sm:flex-row sm:items-end"><label className="grid flex-1 gap-2 text-sm">Agenda sincronizada<select aria-label="Agenda Google" className="h-10 w-full rounded-md border bg-background px-3" value={data.selectedCalendarId || ""} disabled={!!busy} onChange={e => { if (e.target.value) void choose(e.target.value) }}><option value="">Escolha uma agenda</option>{data.calendars.map(c => <option key={c.id} value={c.id}>{c.summary}{["reader", "freeBusyReader"].includes(c.accessRole) ? " · Somente leitura" : ""}</option>)}</select></label><Button size="sm" variant="outline" disabled={!!busy} onClick={() => void calendars()}>Atualizar lista</Button></div><p className="text-xs text-muted-foreground">{data.canWrite ? "Ao criar um evento, você pode salvá-lo nesta agenda do Google." : "Esta agenda está disponível para consulta. Para criar ou editar, escolha uma agenda com permissão de edição."} {data.lastSyncedAt && `Última sincronização: ${new Date(data.lastSyncedAt).toLocaleString("pt-BR")}.`} Atualização automática a cada minuto enquanto esta tela estiver aberta.</p></div> : <p className="text-sm text-muted-foreground">{data.needsReconnect ? "Reconecte sua conta Google para voltar a sincronizar. A última cópia dos eventos continua disponível." : "Clique em Conectar Google Agenda, escolha sua conta e autorize o acesso. Seus eventos aparecerão no período exibido abaixo."}</p>}
    </Panel>{message && <p role="status" className="rounded-lg border bg-muted/30 p-3 text-sm">{message}</p>}{(error || data?.error) && <p role="alert" className="rounded-lg border border-destructive/30 p-3 text-sm text-destructive">{error || data?.error}</p>}</div>
}
