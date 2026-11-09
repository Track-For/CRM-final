import nodemailer from "nodemailer"
import { z } from "zod"
import { sendWhatsappText } from "@/lib/whatsapp/actions"
import { MAX_WHATSAPP_PARTS, whatsappMessageParts } from "./paragraphs"
import { unresolvedVariables } from "./templates"

export const messageDeliverySchema = z.object({
  channel: z.enum(["email", "whatsapp"]),
  expectedRecipient: z.string().trim().min(1).max(320),
  subject: z.string().trim().max(200).refine(value => !/[\r\n]/.test(value), "Assunto inválido."),
  text: z.string().trim().min(1).max(10000),
  separateParagraphs: z.boolean().default(false),
})
export function validateMessageVariables(value: z.infer<typeof messageDeliverySchema>) {
  if (value.channel === "whatsapp" && whatsappMessageParts(value.text, value.separateParagraphs).length > MAX_WHATSAPP_PARTS) throw new Error(`Use no máximo ${MAX_WHATSAPP_PARTS} mensagens por envio.`)
  if (unresolvedVariables(value.text).length || (value.channel === "email" && unresolvedVariables(value.subject).length)) throw new Error("Preencha todas as variáveis antes de enviar.")
}

/** Transporte interno: ações autenticadas resolvem e conferem o destinatário antes de chamar. */
export async function deliverContactMessage(value: z.infer<typeof messageDeliverySchema>, recipient: string) {
  if (value.channel === "whatsapp") {
    const phone = z.string().min(7).parse(recipient)
    const parts = whatsappMessageParts(value.text, value.separateParagraphs)
    const sent: string[] = []
    for (let index = 0; index < parts.length; index++) {
      try { await sendWhatsappText(phone, parts[index]); sent.push(parts[index]) }
      catch (error) {
        if (!sent.length) throw error
        return { deliveredText: sent.join("\n\n"), remainingText: parts.slice(index).join("\n\n"), sentCount: sent.length, totalCount: parts.length, warning: `${sent.length} de ${parts.length} mensagens confirmadas. O envio da mensagem ${index + 1} não foi confirmado. Confira a conversa antes de continuar e não reenvie o bloco completo.` }
      }
    }
    return { deliveredText: sent.join("\n\n"), remainingText: "", sentCount: sent.length, totalCount: parts.length, warning: "" }
  }
  const to = z.email("O contato não possui um e-mail válido.").parse(recipient)
  if (!value.subject) throw new Error("Preencha o assunto do e-mail.")
  if (!process.env.SMTP_HOST || !process.env.EMAIL_FROM) throw new Error("O envio de e-mail ainda não foi configurado. Peça ao administrador para configurar SMTP e EMAIL_FROM.")
  const port = Number(process.env.SMTP_PORT || 587)
  const transport = nodemailer.createTransport({ host: process.env.SMTP_HOST, port, secure: port === 465, auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined, connectionTimeout: 15000, socketTimeout: 30000, disableFileAccess: true, disableUrlAccess: true })
  try {
    const result = await transport.sendMail({ from: process.env.EMAIL_FROM, to, subject: value.subject, text: value.text })
    if (!result.accepted?.length) throw new Error("rejected")
  } catch { throw new Error("O servidor de e-mail não confirmou o envio. Confira a caixa de saída antes de tentar novamente.") }
  finally { transport.close() }
  return { deliveredText: value.text, remainingText: "", sentCount: 1, totalCount: 1, warning: "" }
}
