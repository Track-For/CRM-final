import { z } from "zod"
import type { FormFieldConfig } from "../../types/index"
export function buildFormSchema(fields: FormFieldConfig[]) {
  const shape: Record<string, z.ZodString> = {}
  for (const field of fields) {
    let value = z.string().trim().max(4000, "Máximo de 4000 caracteres")
    if (field.required) value = value.min(1, `${field.label} é obrigatório`)
    if (field.type === "email") value = value.refine(v => !v || z.string().email().safeParse(v).success, "E-mail inválido")
    if (field.type === "tel") value = value.refine(v => !v || /^\d{10,15}$/.test(v.replace(/\D/g, "")), "WhatsApp inválido")
    if (field.type === "select") value = value.refine(v => !v || Boolean(field.options?.includes(v)), "Opção inválida")
    shape[field.key] = value
  }
  return z.object(shape)
}
