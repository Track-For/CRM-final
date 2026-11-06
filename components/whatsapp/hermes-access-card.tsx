"use client"
import { useCallback, useEffect, useState } from "react"
import { Bot, Copy, KeyRound, Loader2, Unplug } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Panel } from "@/components/shared/panel"
import { SecretInput } from "@/components/integrations/secret-input"
import { copyToClipboard } from "@/lib/browser"
import { createHermesAccessAction, getHermesAccessAction, revokeHermesAccessAction } from "@/lib/whatsapp/ai/access-actions"
import type { HermesPermissions } from "@/lib/whatsapp/ai/policy"
export function HermesAccessCard() {
  const [keys, setKeys] = useState<Awaited<ReturnType<typeof getHermesAccessAction>>>([])
  const [permissions, setPermissions] = useState<HermesPermissions>({ projects: true, billing: false, quotes: true, publicInformation: "" })
  const [createdToken, setCreatedToken] = useState("")
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [url, setUrl] = useState("")
  const refresh = useCallback(async () => { try { setKeys(await getHermesAccessAction()); setError("") } catch { setError("Não foi possível consultar o acesso do Hermes.") } finally { setLoading(false) } }, [])
  useEffect(() => { const timer = setTimeout(() => { setUrl(window.location.origin); void refresh() }, 0); return () => clearTimeout(timer) }, [refresh])
  async function create() {
    setBusy(true); setError("")
    try { const result = await createHermesAccessAction(permissions); setCreatedToken(result.token); await refresh(); toast.success("Chave do Hermes criada. Configure-a no agente da Hostinger.") }
    catch (error) { setError(error instanceof Error ? error.message : "Falha ao criar acesso.") }
    finally { setBusy(false) }
  }
  return <Panel title={<span className="flex items-center gap-2"><Bot className="size-4" /> Hermes e dados do CRM</span>} description="Permita que o agente da Hostinger consulte informações do próprio contato durante o atendimento." actions={<Button variant="outline" size="sm" disabled={busy || loading} onClick={() => void refresh()}>Atualizar</Button>}>
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">Escolha o que será disponibilizado ao agente. O acesso é apenas para consulta; não altera projetos nem cobranças.</p>
      <div className="flex flex-wrap gap-4">{([['projects', 'Projetos, etapas e prazos'], ['quotes', 'Propostas já enviadas'], ['billing', 'Cobranças, mensalidades e notas']] as const).map(([key, label]) => <label key={key} className="flex items-center gap-2 text-sm"><Checkbox disabled={busy} checked={permissions[key]} onCheckedChange={value => setPermissions(previous => ({ ...previous, [key]: value === true }))} />{label}</label>)}</div>
      <label className="grid gap-2 text-sm">Informações públicas para o atendimento<Textarea disabled={busy} value={permissions.publicInformation} onChange={event => setPermissions({ ...permissions, publicInformation: event.target.value })} maxLength={8000} rows={3} placeholder="Serviços oferecidos, horário de atendimento e orientações que podem ser compartilhadas com qualquer contato." /></label>
      <Button disabled={busy || loading} onClick={create}>{busy ? <Loader2 className="animate-spin" /> : <KeyRound />} Criar chave para o Hermes</Button>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      {createdToken && <div className="space-y-3 rounded-lg border border-primary/40 p-3"><p className="text-sm font-medium">Copie a chave agora. Ela não será exibida novamente.</p><SecretInput value={createdToken} readOnly /><Button variant="outline" size="sm" onClick={() => { setCreatedToken(""); toast.info("Chave ocultada") }}>Ocultar chave</Button><p className="text-xs text-muted-foreground">Cadastre esta chave em TRACKFOR_CRM_TOKEN no Hermes da Hostinger e a URL HTTPS do CRM em TRACKFOR_CRM_URL.</p></div>}
      <div className="space-y-2"><p className="text-sm font-medium">Endereço do CRM para configurar no Hermes</p><div className="flex gap-2"><Input readOnly value={url} aria-label="Endereço do CRM" /><Button variant="outline" size="icon" aria-label="Copiar endereço do CRM" onClick={() => copyToClipboard(url)}><Copy /></Button></div>{url.startsWith("http:") && <p className="text-xs text-warning">O Hermes na Hostinger precisa de um endereço HTTPS acessível. O localhost desta máquina não é acessível pelo agente remoto.</p>}</div>
      <div className="space-y-2 border-t pt-3"><h3 className="text-sm font-semibold">Acessos criados</h3>{loading ? <p className="text-sm" role="status">Carregando…</p> : keys.length ? keys.map(key => <div key={key.id} className="flex flex-wrap items-center justify-between gap-2 rounded border p-3"><div><p className="text-sm">{key.prefix}•••• · {key.lastUsedAt ? `Última consulta ${new Date(key.lastUsedAt).toLocaleString("pt-BR")}` : "Aguardando primeira consulta"}</p><p className="text-xs text-muted-foreground">{[key.permissions.projects && "Projetos", key.permissions.quotes && "Propostas", key.permissions.billing && "Cobranças"].filter(Boolean).join(" · ") || "Somente informações públicas"}</p></div><Button variant="outline" size="sm" disabled={busy} onClick={async () => { setBusy(true); try { await revokeHermesAccessAction(key.id); setCreatedToken(""); await refresh(); toast.success("Acesso revogado") } catch { setError("Não foi possível revogar o acesso.") } finally { setBusy(false) } }}><Unplug /> Revogar</Button></div>) : <p className="text-sm text-muted-foreground">Nenhuma chave de consulta criada.</p>}</div>
      <p className="text-xs text-muted-foreground">A conexão só estará operacional após instalar a ferramenta no Hermes e confirmar uma consulta. Contatos não identificados ou cadastros ambíguos são encaminhados para a equipe.</p>
    </div>
  </Panel>
}
