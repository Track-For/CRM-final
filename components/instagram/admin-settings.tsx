"use client"

import { useState } from "react"
import { ExternalLink, Loader2 } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { PageHeader } from "@/components/shared/page-header"
import { getInstagramAdminSettings, saveInstagramSettings } from "@/lib/instagram/actions"

type Settings = Awaited<ReturnType<typeof getInstagramAdminSettings>>
export function InstagramAdminSettings({ initial, defaultRedirect }: { initial: Settings; defaultRedirect: string }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const [saved, setSaved] = useState(initial)
  const [form, setForm] = useState({ appId: initial?.appId || "", appSecret: "", redirectUri: initial?.redirectUri || defaultRedirect, graphVersion: initial?.graphVersion || "v25.0" })
  async function save(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setError("")
    try {
      await saveInstagramSettings(form)
      setForm({ ...form, appSecret: "" })
      setSaved(await getInstagramAdminSettings())
      toast.success("Conexão preparada. O usuário já pode clicar em Conectar Instagram.")
    } catch (e) { setError(e instanceof Error ? e.message : "Não foi possível salvar a configuração.") }
    finally { setBusy(false) }
  }
  return <div className="space-y-5">
    <PageHeader backHref="/configuracoes" title="Instagram · Configuração técnica" description="Configuração única da equipe responsável pelo CRM. Os usuários apenas autorizam suas contas na tela Instagram." />
    <p className="rounded-lg border bg-muted/30 p-4 text-sm">{saved ? "Credenciais cadastradas. A conexão está disponível na seção Instagram." : "A conexão aguarda a configuração do aplicativo da plataforma pela equipe técnica."}</p>
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    <section className="rounded-xl border bg-card"><div className="space-y-4 p-4"><p className="text-sm text-muted-foreground">Use uma conta profissional do Instagram (comercial ou criador), vinculada a uma Página do Facebook que você administra. No Meta for Developers, configure o aplicativo para Instagram API com Facebook Login e registre a URL de retorno abaixo. Depois salve as credenciais e clique em Conectar Instagram.</p><form onSubmit={save} className="grid gap-4 md:grid-cols-2"><label className="grid gap-2 text-sm">App ID da Meta<Input required inputMode="numeric" value={form.appId} onChange={e => setForm({ ...form, appId: e.target.value })} placeholder="ID do aplicativo" /></label><label className="grid gap-2 text-sm">App Secret<Input required={!saved?.hasSecret} type="password" autoComplete="new-password" value={form.appSecret} onChange={e => setForm({ ...form, appSecret: e.target.value })} placeholder={saved?.hasSecret ? "Salvo. Deixe em branco para manter." : "Segredo do aplicativo Meta"} /></label><label className="grid gap-2 text-sm md:col-span-2">URL de retorno autorizada<Input required type="url" value={form.redirectUri} onChange={e => setForm({ ...form, redirectUri: e.target.value })} /><span className="text-xs text-muted-foreground">Cadastre exatamente esta URL no aplicativo Meta. Use o endereço HTTPS do CRM ao publicar.</span></label><label className="grid gap-2 text-sm">Versão da Graph API<Input required pattern="v[0-9]+\.[0-9]+" value={form.graphVersion} onChange={e => setForm({ ...form, graphVersion: e.target.value })} /></label><div className="flex items-end"><Button type="submit" disabled={busy}>{busy && <Loader2 className="animate-spin" />}Salvar configuração</Button></div></form><p className="text-xs text-muted-foreground">A conexão solicita leitura do perfil e das mídias. Não solicita sua senha do Instagram nem permissão para publicar. Em desenvolvimento, sua conta precisa ter acesso ao aplicativo Meta; o uso por outras contas pode exigir revisão da Meta.</p><a href="https://developers.facebook.com/apps/" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-sm text-primary">Abrir Meta for Developers<ExternalLink className="size-3" /></a></div></section>
  </div>
}
