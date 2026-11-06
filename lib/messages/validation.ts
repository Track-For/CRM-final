import { z } from "zod"
export const messageTemplateSchema = z.object({
  id: z.string().min(1).max(120), title: z.string().trim().min(1).max(120),
  category: z.enum(["primeiro_contato", "follow_up", "proposta", "cobranca", "pos_venda"]),
  subject: z.string().trim().max(200).refine(value => !/[\r\n]/.test(value), "O assunto deve ocupar uma linha.").optional(),
  text: z.string().trim().min(1).max(10000),
})
