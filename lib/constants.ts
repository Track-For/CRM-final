import type {
  ChargeStatus,
  EntryStatus,
  EventType,
  IntegrationStatus,
  InvoiceStatus,
  LeadSource,
  LeadStatus,
  PaymentCondition,
  PaymentMethod,
  ProjectStatus,
  ProjectType,
  QuoteStatus,
  RevenueRange,
  Role,
  StageKey,
  SubscriptionStatus,
  TaskPriority,
  TaskStatus,
  Temperature,
  WebhookEvent,
} from "@/types"

export type Tone = "neutral" | "brand" | "success" | "warning" | "danger" | "info" | "purple"

export interface Option<T extends string = string> {
  value: T
  label: string
}

type LabelMap<T extends string> = Record<T, string>
type ToneMap<T extends string> = Record<T, Tone>

export function toOptions<T extends string>(map: LabelMap<T>): Option<T>[] {
  return (Object.keys(map) as T[]).map((value) => ({ value, label: map[value] }))
}

export const ROLE_LABEL: LabelMap<Role> = {
  admin: "Admin",
  comercial: "Comercial",
  operacao: "Operação",
  financeiro: "Financeiro",
}

export const PROJECT_TYPE_LABEL: LabelMap<ProjectType> = {
  app: "Aplicativo",
  sistema: "Sistema",
  site: "Site ou Loja virtual",
  anuncio: "Anúncio online",
  outros: "Outros",
}

export const REVENUE_LABEL: LabelMap<RevenueRange> = {
  abaixo_10k: "Abaixo de R$10.000",
  "10k_50k": "Entre R$10.000 e R$50.000",
  acima_50k: "Acima de R$50.000",
  acima_100k: "Acima de R$100.000",
  sem_faturamento: "Não tenho faturamento",
}

export const SOURCE_LABEL: LabelMap<LeadSource> = {
  meta_ads: "Meta Ads",
  google_ads: "Google Ads",
  instagram: "Instagram",
  indicacao: "Indicação",
  site: "Site",
  whatsapp: "WhatsApp",
  manual: "Manual",
}

export const SOURCE_COLOR: Record<LeadSource, string> = {
  meta_ads: "var(--chart-2)",
  google_ads: "var(--chart-1)",
  instagram: "var(--chart-7)",
  indicacao: "var(--chart-3)",
  site: "var(--chart-4)",
  whatsapp: "var(--chart-6)",
  manual: "var(--chart-muted)",
}

export const TEMPERATURE_LABEL: LabelMap<Temperature> = { frio: "Frio", morno: "Morno", quente: "Quente" }
export const TEMPERATURE_TONE: ToneMap<Temperature> = { frio: "info", morno: "warning", quente: "danger" }

export const LEAD_STATUS_LABEL: LabelMap<LeadStatus> = {
  novo: "Novo",
  em_contato: "Em contato",
  qualificado: "Qualificado",
  convertido: "Convertido",
  perdido: "Perdido",
}
export const LEAD_STATUS_TONE: ToneMap<LeadStatus> = {
  novo: "brand",
  em_contato: "info",
  qualificado: "purple",
  convertido: "success",
  perdido: "neutral",
}

export const STAGE_ORDER: StageKey[] = [
  "novo_lead",
  "contato_feito",
  "call_agendada",
  "proposta_enviada",
  "negociacao",
  "ganho",
  "perdido",
]

export const STAGE_LABEL: LabelMap<StageKey> = {
  novo_lead: "Novo lead",
  contato_feito: "Contato feito",
  call_agendada: "Call agendada",
  proposta_enviada: "Proposta enviada",
  negociacao: "Negociação",
  ganho: "Ganho",
  perdido: "Perdido",
}
export const STAGE_TONE: ToneMap<StageKey> = {
  novo_lead: "neutral",
  contato_feito: "info",
  call_agendada: "purple",
  proposta_enviada: "brand",
  negociacao: "warning",
  ganho: "success",
  perdido: "danger",
}

export const QUOTE_STATUS_LABEL: LabelMap<QuoteStatus> = {
  rascunho: "Rascunho",
  enviado: "Enviado",
  visualizado: "Visualizado",
  aceito: "Aceito",
  recusado: "Recusado",
  expirado: "Expirado",
}
export const QUOTE_STATUS_TONE: ToneMap<QuoteStatus> = {
  rascunho: "neutral",
  enviado: "info",
  visualizado: "purple",
  aceito: "success",
  recusado: "danger",
  expirado: "warning",
}

export const PAYMENT_CONDITION_LABEL: LabelMap<PaymentCondition> = {
  avista: "À vista",
  parcelado: "Parcelado sem juros",
  entrada: "50% de entrada + 50% na entrega",
}

export const EVENT_TYPE_LABEL: LabelMap<EventType> = {
  call: "Call",
  reuniao: "Reunião",
  followup: "Follow-up",
  entrega: "Entrega",
  cobranca: "Cobrança",
}
/** Cor sólida usada em chips/barras da agenda. */
export const EVENT_TYPE_COLOR: Record<EventType, string> = {
  call: "var(--primary)",
  reuniao: "var(--info)",
  followup: "var(--chart-4)",
  entrega: "var(--success)",
  cobranca: "var(--danger)",
}
export const EVENT_TYPE_TONE: ToneMap<EventType> = {
  call: "brand",
  reuniao: "info",
  followup: "purple",
  entrega: "success",
  cobranca: "danger",
}

export const TASK_STATUS_LABEL: LabelMap<TaskStatus> = {
  todo: "A fazer",
  doing: "Em andamento",
  review: "Em revisão",
  done: "Concluído",
}
export const TASK_STATUS_ORDER: TaskStatus[] = ["todo", "doing", "review", "done"]
export const TASK_STATUS_TONE: ToneMap<TaskStatus> = {
  todo: "neutral",
  doing: "info",
  review: "purple",
  done: "success",
}

export const TASK_PRIORITY_LABEL: LabelMap<TaskPriority> = {
  baixa: "Baixa",
  media: "Média",
  alta: "Alta",
  urgente: "Urgente",
}
export const TASK_PRIORITY_TONE: ToneMap<TaskPriority> = {
  baixa: "neutral",
  media: "info",
  alta: "warning",
  urgente: "danger",
}

export const PAYMENT_METHOD_LABEL: LabelMap<PaymentMethod> = { boleto: "Boleto", pix: "Pix", cartao: "Cartão de crédito", asaas: "Cliente escolhe no Asaas" }

export const CHARGE_STATUS_LABEL: LabelMap<ChargeStatus> = {
  pendente: "Pendente",
  pago: "Pago",
  vencido: "Vencido",
  cancelado: "Cancelado",
}
export const CHARGE_STATUS_TONE: ToneMap<ChargeStatus> = {
  pendente: "warning",
  pago: "success",
  vencido: "danger",
  cancelado: "neutral",
}

export const ENTRY_STATUS_LABEL: LabelMap<EntryStatus> = { pendente: "Pendente", pago: "Pago", vencido: "Vencido" }
export const ENTRY_STATUS_TONE: ToneMap<EntryStatus> = { pendente: "warning", pago: "success", vencido: "danger" }

export const SUBSCRIPTION_STATUS_LABEL: LabelMap<SubscriptionStatus> = {
  aguardando: "Aguardando quitação do projeto",
  ativa: "Ativa",
  pausada: "Pausada",
  cancelada: "Cancelada",
}
export const SUBSCRIPTION_STATUS_TONE: ToneMap<SubscriptionStatus> = {
  aguardando: "neutral",
  ativa: "success",
  pausada: "warning",
  cancelada: "neutral",
}

export const INVOICE_STATUS_LABEL: LabelMap<InvoiceStatus> = {
  processando: "Processando",
  emitida: "Emitida",
  rejeitada: "Rejeitada",
  cancelada: "Cancelada",
}
export const INVOICE_STATUS_TONE: ToneMap<InvoiceStatus> = {
  processando: "info",
  emitida: "success",
  rejeitada: "danger",
  cancelada: "neutral",
}

export const PROJECT_STATUS_LABEL: LabelMap<ProjectStatus> = {
  planejamento: "Planejamento",
  em_andamento: "Em andamento",
  entregue: "Entregue",
  pausado: "Pausado",
}
export const PROJECT_STATUS_TONE: ToneMap<ProjectStatus> = {
  planejamento: "neutral",
  em_andamento: "info",
  entregue: "success",
  pausado: "warning",
}

export const INTEGRATION_STATUS_LABEL: LabelMap<IntegrationStatus> = {
  conectado: "Conectado",
  desconectado: "Desconectado",
  erro: "Erro",
}
export const INTEGRATION_STATUS_TONE: ToneMap<IntegrationStatus> = {
  conectado: "success",
  desconectado: "neutral",
  erro: "danger",
}

export const WEBHOOK_EVENTS: { value: WebhookEvent; label: string }[] = [
  { value: "lead.created", label: "Lead criado" },
  { value: "lead.updated", label: "Lead atualizado" },
  { value: "deal.created", label: "Negócio criado" },
  { value: "deal.stage_changed", label: "Negócio mudou de etapa" },
  { value: "deal.won", label: "Negócio ganho" },
  { value: "deal.lost", label: "Negócio perdido" },
  { value: "quote.sent", label: "Orçamento enviado" },
  { value: "quote.accepted", label: "Orçamento aceito" },
  { value: "payment.created", label: "Cobrança criada" },
  { value: "payment.confirmed", label: "Pagamento confirmado" },
  { value: "payment.overdue", label: "Cobrança vencida" },
  { value: "invoice.issued", label: "Nota fiscal emitida" },
  { value: "task.created", label: "Tarefa criada" },
  { value: "task.overdue", label: "Tarefa atrasada" },
  { value: "event.created", label: "Evento criado" },
]

/** Dias sem movimentação a partir dos quais um negócio é considerado parado. */
export const STALE_DEAL_DAYS = 7
