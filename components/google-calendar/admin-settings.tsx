"use client"

import { useState } from "react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { PageHeader } from "@/components/shared/page-header"
import { getGoogleCalendarAdminSettings, saveGoogleCalendarSettings } from "@/lib/google-calendar/actions"

export function GoogleCalendarAdminSettings({ initial, defaultRedirect }: { initial: Awaited<ReturnType<typeof getGoogleCalendarAdminSettings>>; defaultRedirect: string }) {
  const [saved, setSaved] = useState(initial)
  const [form, setForm] = useState({ clientId: initial?.clientId || "", clientSecret: "", redirectUri: initial?.redirectUri || defaultRedirect })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  async function save(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setError("")
    try { await saveGoogleCalendarSettings(form); setForm({ ...form, clientSecret: "" }); setSaved(await getGoogleCalendarAdminSettings()); toast.success("Configuração do Google salva") }
    catch (e) { setError(e instanceof Error ? e.message : "Não foi possível salvar") }
    finally { setBusy(false) }
  }
  return <div className="space-y-5"><PageHeader backHref="/configuracoes" title="Google Agenda · Configuração técnica" description="Configuração única do aplicativo da plataforma. Cada usuário conecta sua própria conta Google na Agenda." /><section className="space-y-4 rounded-xl border bg-card p-5"><p className="text-sm text-muted-foreground">No Google Cloud, habilite a Google Calendar API, configure a tela de consentimento e crie um cliente OAuth do tipo Aplicativo da Web. Cadastre exatamente a URL de retorno abaixo. No modo de testes do Google, adicione as contas que poderão autorizar; a disponibilização pública pode exigir verificação do Google.</p><form onSubmit={save} className="grid gap-4 md:grid-cols-2"><label className="grid gap-2 text-sm">Client ID<Input required value={form.clientId} onChange={e => setForm({ ...form, clientId: e.target.value })} placeholder="…apps.googleusercontent.com" /></label><label className="grid gap-2 text-sm">Client Secret<Input type="password" autoComplete="new-password" required={!saved?.hasSecret} value={form.clientSecret} onChange={e => setForm({ ...form, clientSecret: e.target.value })} placeholder={saved?.hasSecret ? "Salvo. Deixe em branco para manter." : "Segredo do cliente OAuth"} /></label><label className="grid gap-2 text-sm md:col-span-2">URL de retorno autorizada<Input type="url" required value={form.redirectUri} onChange={e => setForm({ ...form, redirectUri: e.target.value })} /></label><div className="md:col-span-2"><Button disabled={busy} type="submit">{busy ? "Salvando…" : "Salvar configuração"}</Button></div></form>{error && <p role="alert" className="text-sm text-destructive">{error}</p>}{saved && <p role="status" className="text-sm">Credenciais cadastradas. Os usuários podem conectar suas contas na Agenda.</p>}<p className="text-xs text-muted-foreground">O aplicativo solicita identificação da conta, leitura da lista de agendas e acesso aos eventos. Os tokens são criptografados e isolados por usuário. Nenhuma senha Google é solicitada pelo CRM.</p><a href="https://console.cloud.google.com/apis/credentials" target="_blank" rel="noopener noreferrer" className="text-sm text-primary">Abrir configuração no Google Cloud</a></section></div>
}
