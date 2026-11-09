import { z } from "zod"

export const intakeCategories = ["unclassified", "commercial", "customer", "supplier", "support", "spam"] as const
export type IntakeCategory = typeof intakeCategories[number]
export const intakeLabels: Record<IntakeCategory, string> = { unclassified: "A classificar", commercial: "Interesse comercial", customer: "Cliente atual", supplier: "Fornecedor", support: "Suporte", spam: "Spam / sem interesse" }
export const intakeSchema = z.object({
  category: z.enum(intakeCategories), confidence: z.number().min(0).max(1),
  buyerIntent: z.boolean(), summary: z.string().max(1500), nextStep: z.string().max(500),
  evidence: z.array(z.string().min(1).max(160)).max(8),
}).strict()
export type IntakeAnalysis = z.infer<typeof intakeSchema>
export type IntakeMessage = { id: string; text: string; direction: string; sentAt: string }
export type IntakeData = {
  instance: string; phone: string; category: IntakeCategory; state: "pending" | "processing" | "review" | "classified";
  source?: "ai" | "manual" | "matched"; summary?: string; nextStep?: string; reason?: string;
  confidence?: number; evidence?: string[]; leadId?: string; clientId?: string;
  lastInboundAt: string; lease?: string; classifiedAt?: string;
}
export function validateIntake(input: unknown, messages: IntakeMessage[]) {
  const result = intakeSchema.parse(input)
  const incoming = new Set(messages.filter(m => m.direction === "in" && m.text.trim()).map(m => m.id))
  if (result.evidence.some(id => !incoming.has(id))) throw Error("A classificação citou mensagens recebidas inválidas.")
  if (result.confidence < 0.9 || !result.evidence.length || (result.category === "commercial" && !result.buyerIntent)) return { ...result, category: "unclassified" as const }
  return result
}
