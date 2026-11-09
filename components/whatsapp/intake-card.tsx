"use client"

import { useState } from "react"
import { Loader2, Sparkles, UserCheck } from "lucide-react"
import { Button } from "@/components/ui/button"
import { StatusBadge } from "@/components/shared/status-badge"
import { classifyWhatsappContact, retryWhatsappIntake } from "@/lib/whatsapp/intake-actions"
import { intakeCategories, intakeLabels, type IntakeCategory, type IntakeData } from "@/lib/whatsapp/intake-model"
import { toast } from "@/lib/store/save-feedback"

export function WhatsappIntakeCard({ phone, intake, canEdit, unresolved, known, onChanged }: { phone: string; intake?: IntakeData; canEdit: boolean; unresolved?: boolean; known: boolean; onChanged: () => Promise<void> }) {
  const [category, setCategory] = useState<IntakeCategory>(intake?.category || "unclassified")
  const [busy, setBusy] = useState(false)
  async function run(retry = false) {
    setBusy(true)
    try {
      if (retry) { await retryWhatsappIntake(phone); toast.success("Conversa enviada para triagem") }
      else {
        const result = await classifyWhatsappContact(phone, category)
        toast.success(result?.leadId ? "Contato vinculado ao lead" : "Classificação salva")
      }
      await onChanged()
    } catch (e) { toast.error(e instanceof Error ? e.message : "Não foi possível classificar a conversa.") }
    finally { setBusy(false) }
  }
  return <section className="space-y-3 border-b pb-4" aria-label="Triagem da conversa">
    <h3 className="flex items-center gap-2 text-sm font-semibold"><Sparkles className="size-4 text-primary" />Triagem do contato</h3>
    <StatusBadge tone={intake?.category === "commercial" ? "success" : intake?.category === "unclassified" || !intake ? "warning" : "neutral"}>{intakeLabels[intake?.category || "unclassified"]}</StatusBadge>
    {intake?.state === "pending" || intake?.state === "processing" ? <p role="status" className="text-xs text-muted-foreground">Aguardando triagem automática…</p> : null}
    {intake?.summary && <p className="whitespace-pre-wrap text-xs leading-relaxed">{intake.summary}</p>}
    {intake?.reason && <p className="text-xs leading-relaxed text-muted-foreground">{intake.reason}</p>}
    {intake?.nextStep && <div className="rounded-lg bg-surface p-2 text-xs leading-relaxed"><span className="font-medium">Próximo passo sugerido: </span>{intake.nextStep}</div>}
    {!intake && <p className="text-xs leading-relaxed text-muted-foreground">A conversa continua na caixa de entrada. Um lead só será criado quando houver interesse comercial.</p>}
    {unresolved && <p className="text-xs text-muted-foreground">Identifique o telefone para classificar e vincular este contato.</p>}
    {canEdit && !unresolved && <details className="group/review rounded-xl border bg-surface/40 p-3" open={intake?.category === "unclassified" || !intake}><summary className="text-xs font-medium text-primary">Revisar classificação <span className="float-right group-open/review:hidden">+</span></summary><div className="mt-3 space-y-2">
      <label className="grid gap-1 text-xs">Revisar classificação<select className="h-9 w-full rounded-md border bg-background px-2 text-sm" value={category} disabled={busy} onChange={e => setCategory(e.target.value as IntakeCategory)}>{intakeCategories.map(value => <option key={value} value={value}>{intakeLabels[value]}</option>)}</select></label>
      <Button size="sm" variant="outline" className="w-full" disabled={busy} onClick={() => void run()}>{busy ? <Loader2 className="animate-spin" /> : <UserCheck />}{category === "commercial" && !known ? "Confirmar interesse e criar lead" : "Salvar classificação"}</Button>
      <Button size="sm" variant="ghost" className="w-full" disabled={busy || intake?.state === "processing" || intake?.state === "pending"} onClick={() => void run(true)}><Sparkles />Analisar com IA</Button>
      <p className="text-[10px] leading-relaxed text-muted-foreground">A revisão da equipe prevalece nas próximas mensagens. Nenhum negócio ou mensagem é criado automaticamente.</p>
    </div></details>}
  </section>
}
