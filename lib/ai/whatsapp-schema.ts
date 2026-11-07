import { z } from "zod"

const evidence = z.array(z.string().min(1).max(200)).max(8)
export const analysisSchema = z.object({
  summary: z.string().min(1).max(3000),
  qualification: z.object({
    status: z.enum(["novo", "em_contato", "qualificado"]).nullable(),
    temperature: z.enum(["frio", "morno", "quente"]).nullable(),
    projectType: z.enum(["app", "sistema", "site", "anuncio", "outros"]).nullable(),
    reason: z.string().max(1000), evidence,
  }).strict(),
  tasks: z.array(z.object({ title: z.string().min(1).max(200), description: z.string().max(2000), dueDate: z.iso.date().nullable(), evidence }).strict()).max(3),
  stage: z.object({ key: z.enum(["novo_lead", "contato_feito", "call_agendada", "proposta_enviada", "negociacao"]).nullable(), reason: z.string().max(1000), evidence }).strict(),
}).strict()
export type ConversationAnalysis = z.infer<typeof analysisSchema>
export type SourceMessage = { id: string; direction: "in" | "out"; text: string; sentAt: string }

export function validateEvidence(value: unknown, messages: SourceMessage[], allowedStages: string[]) {
  const result = analysisSchema.parse(value)
  const ids = new Set(messages.map(message => message.id))
  const hasQualification = [result.qualification.status, result.qualification.temperature, result.qualification.projectType].some(Boolean)
  for (const suggestion of [...result.tasks, ...(hasQualification ? [result.qualification] : []), ...(result.stage.key ? [result.stage] : [])]) {
    if (!suggestion.evidence.length || suggestion.evidence.some(id => !ids.has(id))) throw new Error("A IA retornou uma sugestão sem referência válida à conversa. Tente analisar novamente.")
  }
  if (result.stage.key && !allowedStages.includes(result.stage.key)) throw new Error("A IA sugeriu uma etapa indisponível para este negócio.")
  return result
}
