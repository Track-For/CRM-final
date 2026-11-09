"use server"

import { z } from "zod"
import { requireUser } from "@/lib/auth/session"
import { getProspectDetail, recordProspectContact } from "@/lib/prospecting/actions"
import { normalizePhone } from "@/lib/whatsapp/normalize"
import { deliverContactMessage, messageDeliverySchema, validateMessageVariables } from "./delivery"
import { registerProspectContactInSales } from "@/lib/prospecting/contact-sales"
import type { ProspectDetail } from "@/lib/prospecting/types"

const schema = messageDeliverySchema.extend({ prospectId: z.string().regex(/^[\w-]{1,120}$/) })
export async function sendProspectMessage(input: z.input<typeof schema>) {
  const user = await requireUser()
  if (!["admin", "comercial"].includes(user.role)) throw new Error("Sem permissão para enviar mensagens às empresas encontradas.")
  const value = schema.parse(input)
  validateMessageVariables(value)
  const { prospect } = await getProspectDetail(value.prospectId)
  if (prospect.nao_contatar) throw new Error("Esta empresa está marcada para não receber contato.")
  const recipient = value.channel === "email" ? prospect.email?.trim() : prospect.whatsapp || prospect.telefone
  if (!recipient) throw new Error("A empresa não possui contato cadastrado para este canal.")
  const normalized = value.channel === "email" ? (v: string) => v.trim().toLowerCase() : normalizePhone
  if (normalized(recipient) !== normalized(value.expectedRecipient)) throw new Error("O contato da empresa mudou desde a revisão. Atualize a ficha e revise o destinatário antes de enviar.")
  const delivery = await deliverContactMessage(value, recipient)
  let sales: Awaited<ReturnType<typeof registerProspectContactInSales>> | null = null
  let updated: ProspectDetail | null = null
  const warnings: string[] = delivery.warning ? [delivery.warning] : []
  try { sales = await registerProspectContactInSales(prospect, user.id, { ...value, text: delivery.deliveredText }) }
  catch (e) { warnings.push(`Mensagem enviada, mas não foi possível registrar a empresa em Vendas. ${e instanceof Error ? e.message : "Revise o cadastro no CRM."} Não reenvie a mensagem.`) }
  // Falha do serviço de buscas não impede o cadastro já confirmado em Vendas.
  try {
    updated = await recordProspectContact(prospect.id, value.channel, `${value.channel === "email" ? `E-mail enviado: ${value.subject}` : "Mensagem enviada por WhatsApp"}\n${delivery.deliveredText}`.slice(0, 2000))
  } catch { warnings.push("Mensagem enviada, mas o acompanhamento da empresa na busca não foi atualizado. Não reenvie a mensagem.") }
  return { prospect: updated, sales, warning: warnings.join(" "), remainingText: delivery.remainingText, sentCount: delivery.sentCount }
}
