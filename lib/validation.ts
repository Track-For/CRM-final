import { z } from "zod"
import { onlyDigits } from "@/lib/format"

/** Schemas reutilizáveis com mensagens em português. */
export const v = {
  required: (label = "Campo") => z.string().trim().min(1, `${label} é obrigatório`),
  optional: () => z.string().trim().optional(),
  email: () => z.string().trim().min(1, "E-mail é obrigatório").email("E-mail inválido"),
  emailOptional: () => z.string().trim().email("E-mail inválido").or(z.literal("")).optional(),
  phone: () =>
    z
      .string()
      .trim()
      .min(1, "WhatsApp é obrigatório")
      .refine((val) => onlyDigits(val).length >= 10, "WhatsApp inválido"),
  cpfCnpj: () =>
    z
      .string()
      .trim()
      .min(1, "CPF/CNPJ é obrigatório")
      .refine((val) => [11, 14].includes(onlyDigits(val).length), "CPF ou CNPJ incompleto"),
  money: (label = "Valor", min = 0.01) => z.number({ error: `${label} é obrigatório` }).min(min, `${label} deve ser maior que zero`),
  url: (required = false) =>
    required ? z.string().trim().url("URL inválida") : z.string().trim().url("URL inválida").or(z.literal("")).optional(),
  date: (label = "Data") => z.string().min(1, `${label} é obrigatória`),
  select: <T extends string>(values: readonly [T, ...T[]], label = "Opção") =>
    z.enum(values, { error: `Selecione ${label.toLowerCase()}` }),
}
