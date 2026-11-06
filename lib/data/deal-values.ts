import { z } from "zod"

/** Projeto gratuito e ausência de manutenção são valores válidos. */
export const dealValuesSchema = z.object({
  value: z.number({ error: "Informe o valor do projeto" }).min(0, "O valor do projeto não pode ser negativo"),
  monthlyFee: z.number({ error: "Informe o valor da manutenção" }).min(0, "A manutenção não pode ser negativa"),
})
