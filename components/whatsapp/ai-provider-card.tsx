"use client"

import { useCallback, useEffect, useState } from "react"
import { FlaskConical, Loader2, Sparkles } from "lucide-react"
import { toast } from "@/lib/store/save-feedback"
import { Panel } from "@/components/shared/panel"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import { getAiSettingsAction, saveAiSettingsAction, testAiSettingsAction, disconnectAiAction } from "@/lib/ai/settings-actions"

type Settings = Awaited<ReturnType<typeof getAiSettingsAction>>
export function AiProviderCard() {
  const [settings, setSettings] = useState<Settings | null>(null)
  const [model, setModel] = useState("")
  const [apiKey, setApiKey] = useState("")
  const [enabled, setEnabled] = useState(true)
  const [busy, setBusy] = useState("")
  const [error, setError] = useState("")
  const [tested, setTested] = useState(false)
  const refresh = useCallback(async () => {
    try { const value = await getAiSettingsAction(); setSettings(value); setModel(value.model); setEnabled(value.enabled); setError("") }
    catch (e) { setError(e instanceof Error ? e.message : "Falha ao carregar configuração") }
  }, [])
  useEffect(() => { const timer = setTimeout(() => void refresh(), 0); return () => clearTimeout(timer) }, [refresh])
  const dirty = Boolean(apiKey) || model !== settings?.model || enabled !== settings?.enabled
  async function run(action: "save" | "test" | "disconnect") {
    if (busy) return
    setBusy(action); setError("")
    try {
      if (action === "test") { await testAiSettingsAction(); setTested(true); toast.success("Conexão validada com dados fictícios") }
      else {
        const value = action === "save" ? await saveAiSettingsAction({ model, apiKey, enabled }) : await disconnectAiAction()
        setSettings(value); setModel(value.model); setEnabled(value.enabled); setApiKey(""); setTested(false)
        toast.success(action === "save" ? "Configuração salva" : "Análise desativada e chave salva removida")
      }
    } catch (e) { setError(e instanceof Error ? e.message : "Falha ao configurar a IA") }
    finally { setBusy("") }
  }
  return <Panel title={<span className="flex items-center gap-2"><Sparkles className="size-4" /> IA para analisar conversas</span>} description="Resumos, qualificação, tarefas e sugestões para o Kanban, com sua revisão.">
    <form className="space-y-4" onSubmit={event => { event.preventDefault(); void run("save") }}>
      <p className="text-sm text-muted-foreground">{settings?.configured ? tested && !dirty ? "Conexão testada nesta sessão." : "Chave e modelo configurados. Teste a conexão para confirmar o acesso." : settings?.enabled === false ? "Análise desativada." : "Conexão pendente."} Esta configuração controla o assistente interno; o acesso do Hermes continua no painel abaixo.</p>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      {!settings && <Button type="button" variant="outline" onClick={() => void refresh()}>Recarregar configuração</Button>}
      <label className="grid gap-2 text-sm" htmlFor="openai-model">Modelo<Input id="openai-model" value={model} onChange={e => setModel(e.target.value)} maxLength={160} placeholder="Nome exato do modelo na sua conta" disabled={!settings || Boolean(busy)} required /></label>
      <p className="text-xs text-muted-foreground">Use um modelo compatível com Responses e saídas estruturadas. O teste verifica essa compatibilidade.</p>
      <label className="grid gap-2 text-sm" htmlFor="openai-key">Chave da OpenAI<Input id="openai-key" type="password" autoComplete="new-password" spellCheck={false} value={apiKey} onChange={e => setApiKey(e.target.value)} maxLength={1000} placeholder={settings?.hasKey ? "Chave já configurada; deixe vazio para manter" : "Cole sua chave de API"} disabled={!settings || Boolean(busy)} /></label>
      <p className="text-xs text-muted-foreground">A chave salva fica criptografada e não é exibida novamente.{settings?.keySource === "server" && " A chave atual vem das variáveis privadas do servidor."}</p>
      <label className="flex items-center gap-2 text-sm"><Switch checked={enabled} disabled={!settings || Boolean(busy)} onCheckedChange={setEnabled} />Permitir análises solicitadas pela equipe comercial</label>
      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={!settings || Boolean(busy) || !dirty}>{busy === "save" && <Loader2 className="animate-spin" />}Salvar configuração</Button>
        <Button type="button" variant="outline" disabled={!settings?.configured || Boolean(busy) || dirty} onClick={() => void run("test")}>{busy === "test" ? <Loader2 className="animate-spin" /> : <FlaskConical />}Testar com dados fictícios</Button>
        <Button type="button" variant="outline" disabled={!settings || Boolean(busy) || (!settings.enabled && settings.keySource !== "crm")} onClick={() => void run("disconnect")}>Desativar e remover chave salva</Button>
      </div>
      <p className="text-xs text-muted-foreground">O teste faz uma consulta à OpenAI com texto fictício e pode consumir créditos da sua conta. Nenhuma conversa de cliente é usada. Desativar interrompe novas análises; não apaga notas e tarefas já confirmadas.</p>
    </form>
  </Panel>
}
