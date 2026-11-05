// Somente servidor: cliente HTTP da API do Asaas.
// A chave nunca é logada nem incluída em mensagens de erro.

export type AsaasEnvironment = "sandbox" | "producao"

export const ASAAS_BASE_URLS: Record<AsaasEnvironment, string> = {
  sandbox: "https://api-sandbox.asaas.com/v3",
  producao: "https://api.asaas.com/v3",
}

const TIMEOUT_MS = 30_000
const USER_AGENT = "TrackForCRM/1.0.0"

export type AsaasCustomer = {
  id: string
  name?: string
  cpfCnpj?: string
  deleted?: boolean
  notificationDisabled?: boolean
}

export type AsaasCustomerInput = {
  name: string
  cpfCnpj: string
  email?: string
  mobilePhone?: string
  address?: string
  addressNumber?: string
  complement?: string
  province?: string
  postalCode?: string
  externalReference?: string
  notificationDisabled: boolean
}

export type AsaasPaymentInput = {
  customer: string
  billingType: "BOLETO"
  value: number
  dueDate: string
  description?: string
  externalReference: string
  interest?: { value: number }
  fine?: { value: number; type: "PERCENTAGE" }
}

export type AsaasPayment = {
  id: string
  customer?: string
  status?: string
  deleted?: boolean
  value?: number
  netValue?: number
  dueDate?: string
  paymentDate?: string | null
  clientPaymentDate?: string | null
  confirmedDate?: string | null
  invoiceUrl?: string | null
  bankSlipUrl?: string | null
  nossoNumero?: string | null
  externalReference?: string | null
}

export type AsaasIdentificationField = {
  identificationField?: string
  nossoNumero?: string
  barCode?: string
}

type AsaasList<T> = { data?: T[] }

/** Erro com mensagem em pt-BR, segura para mostrar ao usuário. */
export class AsaasError extends Error {
  readonly status?: number
  readonly timedOut: boolean
  constructor(message: string, options: { status?: number; timedOut?: boolean } = {}) {
    super(message)
    this.name = "AsaasError"
    this.status = options.status
    this.timedOut = options.timedOut ?? false
  }
}

type AsaasErrorBody = { errors?: { code?: unknown; description?: unknown }[] }

function parseErrors(text: string): { codes: string[]; detail: string | null } {
  try {
    const list = (JSON.parse(text) as AsaasErrorBody).errors ?? []
    const descriptions = list.map((e) => e.description).filter((d): d is string => typeof d === "string" && d.trim() !== "")
    return {
      codes: list.map((e) => e.code).filter((c): c is string => typeof c === "string"),
      detail: descriptions.length ? descriptions.join(" ").trim().slice(0, 500) : null,
    }
  } catch {
    return { codes: [], detail: null }
  }
}

function httpMessage(status: number, codes: string[], detail: string | null): string {
  if (codes.includes("invalid_environment")) {
    return "A chave do Asaas é de outro ambiente. Confira se o ambiente escolhido em Integrações corresponde à chave."
  }
  if (status === 401) return "Chave do Asaas inválida ou expirada. Gere uma nova no painel do Asaas e salve em Integrações."
  if (status === 403) return detail ? `O Asaas recusou o acesso. ${detail}` : "O Asaas recusou o acesso desta chave."
  if (status === 404) return detail ?? "Registro não encontrado no Asaas."
  if (status === 429) return "Muitas requisições ao Asaas. Tente novamente em instantes."
  if (status >= 500) return "O Asaas está indisponível no momento. Tente novamente mais tarde."
  return detail ?? `O Asaas recusou a requisição (HTTP ${status}).`
}

type RequestOptions = { body?: unknown; query?: Record<string, string | number> }

export type AsaasClient = ReturnType<typeof createAsaasClient>

export function createAsaasClient(apiKey: string, environment: AsaasEnvironment) {
  async function request<T>(method: "GET" | "POST" | "PUT" | "DELETE", path: string, options: RequestOptions = {}): Promise<T> {
    const url = new URL(`${ASAAS_BASE_URLS[environment]}${path}`)
    for (const [key, value] of Object.entries(options.query ?? {})) url.searchParams.set(key, String(value))

    let res: Response
    try {
      res = await fetch(url, {
        method,
        headers: { access_token: apiKey, "User-Agent": USER_AGENT, "Content-Type": "application/json" },
        // GET com corpo responde 403 no Asaas.
        ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
        cache: "no-store",
        signal: AbortSignal.timeout(TIMEOUT_MS),
      })
    } catch (err) {
      const name = err instanceof Error ? err.name : ""
      if (name === "TimeoutError" || name === "AbortError") {
        throw new AsaasError("O Asaas não respondeu em 30 segundos.", { timedOut: true })
      }
      throw new AsaasError("Não foi possível conectar ao Asaas.")
    }

    const text = await res.text().catch(() => "")
    if (!res.ok) {
      const { codes, detail } = parseErrors(text)
      // Defesa extra: a chave não pode sair em mensagem, mesmo se o provedor a ecoar.
      throw new AsaasError(httpMessage(res.status, codes, detail).split(apiKey).join("***"), { status: res.status })
    }
    try {
      return JSON.parse(text) as T
    } catch {
      throw new AsaasError("Resposta inválida do Asaas.", { status: res.status })
    }
  }

  const path = (id: string) => encodeURIComponent(id)

  return {
    /** Valida a chave sem alterar nada. */
    ping: () => request<AsaasList<AsaasCustomer>>("GET", "/customers", { query: { limit: 1 } }),

    async findCustomerByDocument(cpfCnpj: string): Promise<AsaasCustomer | null> {
      const list = await request<AsaasList<AsaasCustomer>>("GET", "/customers", { query: { cpfCnpj } })
      return (list.data ?? []).find((c) => !c.deleted) ?? null
    },

    createCustomer: (input: AsaasCustomerInput) => request<AsaasCustomer>("POST", "/customers", { body: input }),

    disableCustomerNotifications: (customer: AsaasCustomer) =>
      request<AsaasCustomer>("PUT", `/customers/${path(customer.id)}`, {
        body: { name: customer.name, cpfCnpj: customer.cpfCnpj, notificationDisabled: true },
      }),

    createPayment: (input: AsaasPaymentInput) => request<AsaasPayment>("POST", "/payments", { body: input }),

    getPayment: (id: string) => request<AsaasPayment>("GET", `/payments/${path(id)}`),

    /** Reconciliação depois de uma tentativa incerta: ignora cobranças removidas. */
    async findPaymentByExternalReference(externalReference: string): Promise<AsaasPayment | null> {
      const list = await request<AsaasList<AsaasPayment>>("GET", "/payments", { query: { externalReference } })
      return (list.data ?? []).find((p) => !p.deleted) ?? null
    },

    getIdentificationField: (id: string) => request<AsaasIdentificationField>("GET", `/payments/${path(id)}/identificationField`),

    deletePayment: (id: string) => request<{ deleted?: boolean; id?: string }>("DELETE", `/payments/${path(id)}`),
  }
}

export type MappedStatus = "pendente" | "pago" | "vencido" | "cancelado"

const PAID = new Set(["RECEIVED", "CONFIRMED", "RECEIVED_IN_CASH", "DUNNING_RECEIVED"])
const OVERDUE = new Set(["OVERDUE", "DUNNING_REQUESTED"])

export function mapAsaasStatus(status: string | undefined, deleted?: boolean): MappedStatus {
  if (deleted || status === "REFUNDED") return "cancelado"
  if (status && PAID.has(status)) return "pago"
  if (status && OVERDUE.has(status)) return "vencido"
  return "pendente"
}
