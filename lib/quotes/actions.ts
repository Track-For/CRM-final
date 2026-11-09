"use server"
import { z } from "zod"
import { textPdf } from "@/lib/quotes/pdf"
import { getCurrentUser } from "@/lib/auth/session"
import { canUseResource } from "@/lib/data/resource-policy"
const schema = z.object({ generic: z.boolean().default(false), number: z.string().max(80), company: z.string().max(200), customer: z.string().max(300), project: z.string().max(300), pages: z.number().int().min(0).max(100), languages: z.number().int().min(1).max(5), addons: z.array(z.string().max(200)).max(100), total: z.number().finite().nonnegative(), monthlyFee: z.number().finite().nonnegative(), deadline: z.number().finite().nonnegative(), payment: z.string().max(300), validUntil: z.string().max(80), notes: z.string().max(12000) })
export async function generateQuotePdfAction(input: z.input<typeof schema>) {
  const user = await getCurrentUser()
  if (!user || !canUseResource(user.role, "quotes", "read")) throw new Error("Sem permissão para gerar propostas.")
  const value = schema.parse(input)
  const money = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
  const lines = [value.company || "Sua empresa", `PROPOSTA COMERCIAL ${value.number}`, "", `Cliente: ${value.customer}`, `Serviço: ${value.project}`, ...(value.generic ? [] : [`Páginas: ${value.pages} | Idiomas: ${value.languages}`]), ...value.addons.map(addon => `Adicional: ${addon}`), "", `Investimento: ${money(value.total)}`, `Mensalidade: ${money(value.monthlyFee)}`, `Pagamento: ${value.payment}`, `Prazo: ${value.deadline} dias`, `Validade: ${value.validUntil}`, "", "Observações:", ...value.notes.split("\n")]
  return { base64: Buffer.from(textPdf(lines)).toString("base64") }
}
