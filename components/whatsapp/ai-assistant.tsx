"use client"

import { useEffect, useState } from "react"
import { Loader2, Sparkles } from "lucide-react"
import { toast } from "@/lib/store/save-feedback"
import { EntityDrawer } from "@/components/shared/entity-drawer"
import { Button } from "@/components/ui/button"
import { analyzeWhatsappConversation, applyWhatsappSuggestion, getWhatsappAiAvailability } from "@/lib/ai/whatsapp-actions"
import { useCrmStore } from "@/lib/store/crm-store"
import type { Activity, Deal, Lead, Task } from "@/types"
import { stageName } from "@/components/sales/utils"
import { usePipelines } from "@/lib/data"

type Draft = Awaited<ReturnType<typeof analyzeWhatsappConversation>>
export function WhatsappAiAssistant({ phone, open, onOpenChange }: { phone: string; open: boolean; onOpenChange: (open: boolean) => void }) {
  const pipelines = usePipelines()
  const [configured, setConfigured] = useState<boolean | null>(null)
  const [draft, setDraft] = useState<Draft | null>(null)
  const [busy, setBusy] = useState("")
  const [error, setError] = useState("")
  useEffect(() => { if (open) void getWhatsappAiAvailability().then(result => setConfigured(result.configured)).catch(e => setError(e.message)) }, [open])
  async function analyze() {
    setBusy("analyze"); setError("")
    try { setDraft(await analyzeWhatsappConversation(phone)) }
    catch (e) { setError(e instanceof Error ? e.message : "Falha ao analisar") }
    finally { setBusy("") }
  }
  async function apply(action: string) {
    if (!draft || busy) return
    setBusy(action); setError("")
    try {
      const result = await applyWhatsappSuggestion(draft.id, action)
      if (result.record) {
        const { resource, value } = result.record
        const store = useCrmStore.getState()
        if (resource === "leads") useCrmStore.setState({ leads: store.leads.map(item => item.id === value.id ? value as Lead : item) })
        if (resource === "deals") useCrmStore.setState({ deals: store.deals.map(item => item.id === value.id ? value as Deal : item) })
        if (resource === "tasks") useCrmStore.setState({ tasks: [...store.tasks.filter(item => item.id !== value.id), value as Task] })
        if (resource === "activities") useCrmStore.setState({ activities: [...store.activities.filter(item => item.id !== value.id), value as Activity] })
      }
      setDraft({ ...draft, applied: [...draft.applied, action] })
      toast.success("Sugestão aplicada ao CRM")
    } catch (e) { setError(e instanceof Error ? e.message : "Falha ao aplicar") }
    finally { setBusy("") }
  }
  const evidence = (ids: string[]) => <details className="text-xs text-muted-foreground"><summary className="cursor-pointer">Ver mensagens de apoio</summary>{ids.map(id => { const m = draft?.messages.find(message => message.id === id); return m && <p key={id} className="mt-2 whitespace-pre-wrap border-l-2 pl-2">{m.direction === "in" ? "Contato" : "Equipe"}: {m.text}</p> })}</details>
  const button = (action: string, label: string) => <Button size="sm" variant="outline" disabled={Boolean(busy) || draft?.applied.includes(action)} onClick={() => void apply(action)}>{busy === action && <Loader2 className="animate-spin" />}{draft?.applied.includes(action) ? "Aplicado" : label}</Button>
  return <EntityDrawer open={open} onOpenChange={onOpenChange} title="Assistente da conversa" description="Revise as sugestões antes de alterar o CRM.">
    <div className="space-y-5">
      <p className="text-sm text-muted-foreground">Ao analisar, até 50 mensagens recentes, incluindo transcrições e leituras de arquivos já solicitadas na conversa, e o contexto comercial deste contato serão enviados à OpenAI. Para incluir uma mídia, use Transcrever áudio ou Ler com IA na mensagem. A IA pode cometer erros.</p>
      {configured === false && <p className="rounded-lg border p-3 text-sm">IA ainda não conectada. O administrador pode conectar a chave e o modelo em Integrações → WhatsApp e IA.</p>}
      <Button disabled={!configured || Boolean(busy)} onClick={() => void analyze()}>{busy === "analyze" ? <Loader2 className="animate-spin" /> : <Sparkles />}{draft ? "Analisar novamente" : "Analisar com IA"}</Button>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      {draft && <>
        <p className="text-xs text-muted-foreground">Análise de {draft.messages.length} mensagens · {new Date(draft.messages[0].sentAt).toLocaleString("pt-BR")} a {new Date(draft.messages.at(-1)!.sentAt).toLocaleString("pt-BR")}. Sugestões válidas por 24 horas.</p>
        <section className="space-y-3 rounded-lg border p-4"><h3 className="font-semibold">Resumo</h3><p className="whitespace-pre-wrap text-sm">{draft.result.summary}</p>{button("summary", "Salvar como nota")}</section>
        <section className="space-y-3 rounded-lg border p-4"><h3 className="font-semibold">Qualificação sugerida</h3><p className="text-sm">{[draft.result.qualification.status, draft.result.qualification.temperature, draft.result.qualification.projectType].filter(Boolean).join(" · ") || "Sem alteração sugerida"}</p><p className="text-sm">{draft.result.qualification.reason}</p>{evidence(draft.result.qualification.evidence)}{Object.values({ status: draft.result.qualification.status, temperature: draft.result.qualification.temperature, projectType: draft.result.qualification.projectType }).some(Boolean) && button("qualification", "Aplicar qualificação")}</section>
        <section className="space-y-3 rounded-lg border p-4"><h3 className="font-semibold">Próximas tarefas</h3>{!draft.result.tasks.length && <p className="text-sm text-muted-foreground">Nenhuma tarefa sugerida.</p>}{draft.result.tasks.map((task, i) => <div key={i} className="space-y-2 border-t pt-3"><h4 className="text-sm font-medium">{task.title}</h4><p className="text-sm">{task.description}</p><p className="text-xs text-muted-foreground">Prazo: {task.dueDate || "sem data combinada"} · Responsável: você</p>{evidence(task.evidence)}{button(`task:${i}`, "Criar tarefa")}</div>)}</section>
        <section className="space-y-3 rounded-lg border p-4"><h3 className="font-semibold">Kanban</h3>{draft.result.stage.key ? <><p className="text-sm">Mover {draft.deal?.title} para {stageName(pipelines, draft.deal?.pipelineId, draft.result.stage.key)}</p><p className="text-sm">{draft.result.stage.reason}</p>{evidence(draft.result.stage.evidence)}{button("stage", "Confirmar movimentação")}</> : <p className="text-sm text-muted-foreground">{draft.deal ? "Sem mudança de etapa sugerida." : "A movimentação exige um único negócio aberto vinculado ao contato."}</p>}</section>
      </>}
    </div>
  </EntityDrawer>
}
