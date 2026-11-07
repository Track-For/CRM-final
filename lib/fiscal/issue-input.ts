import { z } from "zod"

const onlyDigits = (v: string) => v.replace(/\D/g, "")

const requiredText = (label: string, maxLen = 255) =>
  z.string({ error: `${label} é obrigatório` }).trim().min(1, `${label} é obrigatório`).max(maxLen, `${label} muito longo`)

const optionalInputText = (maxLen: number) =>
  z
    .string()
    .trim()
    .max(maxLen)
    .optional()
    .nullable()
    .transform((v) => (v ? v : undefined))

const digitsField = (label: string, len: number) =>
  z
    .string({ error: `${label} é obrigatório` })
    .transform(onlyDigits)
    .pipe(z.string().regex(new RegExp(`^\\d{${len}}$`), `${label} deve ter ${len} dígitos`))

const moneyRetention = z.number({ error: "Retenção inválida" }).min(0, "Retenções não podem ser negativas").default(0)

export const issueSchema = z
  .object({
    clientId: requiredText("Cliente", 100),
    chargeId: optionalInputText(100),
    tomador: z.object({
      documentType: z.enum(["cpf", "cnpj"], { error: "Escolha CPF ou CNPJ" }),
      document: z.string({ error: "CPF/CNPJ é obrigatório" }).transform(onlyDigits),
      name: requiredText("Nome do tomador", 150).pipe(z.string().min(2, "Informe o nome do tomador")),
      municipalRegistration: z
        .string()
        .optional()
        .nullable()
        .transform((v) => (v ? onlyDigits(v) || undefined : undefined)),
      email: z
        .string()
        .trim()
        .optional()
        .nullable()
        .transform((v) => (v ? v.toLowerCase() : undefined))
        .pipe(z.email("E-mail do tomador inválido").optional()),
      phone: z
        .string()
        .optional()
        .nullable()
        .transform((v) => (v ? onlyDigits(v) || undefined : undefined)),
      address: z.object({
        cep: digitsField("CEP", 8),
        street: requiredText("Logradouro", 150),
        number: requiredText("Número do endereço", 20),
        complement: optionalInputText(100),
        district: requiredText("Bairro", 100),
        city: requiredText("Cidade", 100),
        uf: z
          .string({ error: "UF é obrigatória" })
          .trim()
          .toUpperCase()
          .pipe(z.string().regex(/^[A-Z]{2}$/, "UF inválida")),
        ibgeCode: digitsField("Código IBGE do município", 7),
      }),
    }),
    serviceDescription: requiredText("Descrição do serviço", 2000),
    serviceItem: digitsField("Item da LC 116", 6),
    municipalTaxCode: optionalInputText(40),
    cnae: z
      .string()
      .optional()
      .nullable()
      .transform((v) => (v ? onlyDigits(v) || undefined : undefined)),
    nbs: z
      .string()
      .optional()
      .nullable()
      .transform((v) => (v ? onlyDigits(v) || undefined : undefined)),
    amount: z.number({ error: "Valor é obrigatório" }).positive("O valor deve ser maior que zero").max(9_999_999_999, "Valor muito alto"),
    issRate: z.number({ error: "Alíquota de ISS é obrigatória" }).min(0, "Alíquota inválida").max(10, "Alíquota de ISS acima de 10%"),
    issRetained: z.boolean({ error: "Informe se o ISS é retido" }),
    retentions: z
      .object({ ir: moneyRetention, pis: moneyRetention, cofins: moneyRetention, csll: moneyRetention, inss: moneyRetention })
      .default({ ir: 0, pis: 0, cofins: 0, csll: 0, inss: 0 }),
    competenceDate: z
      .string({ error: "Data de competência é obrigatória" })
      .regex(/^\d{4}-\d{2}-\d{2}$/, "Data de competência inválida")
      .refine((v) => !Number.isNaN(new Date(`${v}T12:00:00Z`).getTime()), "Data de competência inválida"),
  })
  .superRefine((d, ctx) => {
    const expected = d.tomador.documentType === "cpf" ? 11 : 14
    if (d.tomador.document.length !== expected) {
      ctx.addIssue({
        code: "custom",
        path: ["tomador", "document"],
        message: d.tomador.documentType === "cpf" ? "O CPF deve ter 11 dígitos" : "O CNPJ deve ter 14 dígitos",
      })
    }
    const r = d.retentions
    const totalRetido = r.ir + r.pis + r.cofins + r.csll + r.inss + (d.issRetained ? (d.amount * d.issRate) / 100 : 0)
    if (totalRetido > d.amount) {
      ctx.addIssue({ code: "custom", path: ["retentions"], message: "As retenções somam mais que o valor do serviço" })
    }
  })

type ParsedIssue = z.infer<typeof issueSchema>

export function invoiceFieldsFromInput(d: ParsedIssue) {
  return {
    clientId: d.clientId,
    chargeId: d.chargeId ?? null,
    tomador: d.tomador,
    serviceDescription: d.serviceDescription,
    serviceItem: d.serviceItem,
    municipalTaxCode: d.municipalTaxCode ?? null,
    cnae: d.cnae ?? null,
    nbs: d.nbs ?? null,
    amount: d.amount.toFixed(2),
    issRate: d.issRate.toFixed(2),
    issRetained: d.issRetained,
    retentions: d.retentions,
    competenceDate: d.competenceDate,
  }
}

