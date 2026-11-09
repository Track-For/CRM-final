"use server"

import { z } from "zod"
import { requireUser } from "@/lib/auth/session"
import { getProspectDetail, recordProspectContact } from "@/lib/prospecting/actions"
import { normalizePhone } from "@/lib/whatsapp/normalize"
import { deliverContactMessage, messageDeliverySchema, validateMessageVariables } from "./delivery"

const schema = messageDeliverySchema.extend({ prospectId: z.string().regex(/^[\w-]{1,120}$/) })
export async function sendProspectMessage(input: z.infer<typeof schema>) {
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
  await deliverContactMessage(value, recipient)
  // Falha de histórico nunca transforma um envio confirmado em sugestão de reenvio.
  try {
    const updated = await recordProspectContact(prospect.id, value.channel, `${value.channel === "email" ? `E-mail enviado: ${value.subject}` : "Mensagem enviada por WhatsApp"}\n${value.text}`.slice(0, 2000))
    return { prospect: updated, warning: "" }
  } catch { return { prospect: null, warning: "Mensagem enviada, mas o acompanhamento da empresa não foi atualizado. Não reenvie a mensagem." } }
}
