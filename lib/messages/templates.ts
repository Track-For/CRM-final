import type { Lead, QuickMessage } from "../../types/index"

export const MESSAGE_CATEGORIES: Record<QuickMessage["category"], string> = {
  primeiro_contato: "Primeiro contato", follow_up: "Follow-up", proposta: "Proposta", cobranca: "Cobrança", pos_venda: "Pós-venda",
}
export const MESSAGE_VARIABLES = ["nome", "empresa", "email", "whatsapp", "projeto"] as const
export function leadMessageValues(lead: Pick<Lead, "name" | "company" | "email" | "whatsapp" | "projectType">) {
  return { nome: lead.name, empresa: lead.company, email: lead.email, whatsapp: lead.whatsapp, projeto: lead.projectType.replaceAll("_", " ") }
}
/** Uma única passagem evita interpretar variáveis dentro dos dados do contato. */
export function renderMessage(template: string, values: Record<string, string | undefined>) {
  return template.replace(/\{([\p{L}\d_]+)\}/gu, (token, key: string) => values[key]?.trim() || token)
}
export function unresolvedVariables(text: string) {
  return [...new Set(text.match(/\{[\p{L}\d_]+\}/gu) || [])]
}
