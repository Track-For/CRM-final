/**
 * Entidades do CRM Solid Tech.
 * Cada interface aqui espelha um futuro model Prisma: ids em string (cuid),
 * datas em ISO string (DateTime no banco) e valores monetários em reais (Decimal).
 */

export type ID = string
export type ISODate = string

/* ------------------------------------------------------------------ */
/* Usuários e permissões                                               */
/* ------------------------------------------------------------------ */

export type Role = "admin" | "comercial" | "operacao" | "financeiro"

export interface User {
  id: ID
  name: string
  email: string
  whatsapp: string
  role: Role
  initials: string
  active: boolean
  createdAt: ISODate
}

/* ------------------------------------------------------------------ */
/* Leads                                                               */
/* ------------------------------------------------------------------ */

export type ProjectType = "app" | "sistema" | "site" | "anuncio" | "outros"

export type RevenueRange =
  | "abaixo_10k"
  | "10k_50k"
  | "acima_50k"
  | "acima_100k"
  | "sem_faturamento"

export type LeadSource =
  | "meta_ads"
  | "google_ads"
  | "instagram"
  | "indicacao"
  | "site"
  | "whatsapp"
  | "manual"

export type Temperature = "frio" | "morno" | "quente"

export type LeadStatus = "novo" | "em_contato" | "qualificado" | "convertido" | "perdido"

export interface Utm {
  source?: string
  medium?: string
  campaign?: string
  term?: string
  content?: string
}

export interface Lead {
  id: ID
  name: string
  whatsapp: string
  email: string
  company: string
  projectType: ProjectType
  revenue: RevenueRange
  source: LeadSource
  temperature: Temperature
  status: LeadStatus
  ownerId: ID
  utm: Utm
  formId?: ID
  clientId?: ID
  createdAt: ISODate
  updatedAt: ISODate
}

/* ------------------------------------------------------------------ */
/* Pipelines e negócios                                                */
/* ------------------------------------------------------------------ */

export type StageKey =
  | "novo_lead"
  | "contato_feito"
  | "call_agendada"
  | "proposta_enviada"
  | "negociacao"
  | "ganho"
  | "perdido"

export interface PipelineStage {
  key: StageKey
  name: string
  probability: number
  order: number
  kind: "open" | "won" | "lost"
}

export interface Pipeline {
  id: ID
  name: string
  description: string
  stages: PipelineStage[]
}

export interface LostReason {
  id: ID
  label: string
}

export type DealHistoryType = "created" | "stage" | "value" | "owner" | "note" | "quote" | "won" | "lost"

export interface DealHistoryEntry {
  id: ID
  type: DealHistoryType
  description: string
  authorId: ID
  createdAt: ISODate
  fromStage?: StageKey
  toStage?: StageKey
}

export interface Deal {
  id: ID
  title: string
  leadId: ID
  clientId?: ID
  pipelineId: ID
  stage: StageKey
  projectType: ProjectType
  source: LeadSource
  value: number
  monthlyFee: number
  probability: number
  expectedCloseDate: ISODate
  ownerId: ID
  lostReasonId?: ID
  lostNote?: string
  wonAt?: ISODate
  lostAt?: ISODate
  stageChangedAt: ISODate
  createdAt: ISODate
  history: DealHistoryEntry[]
}

/* ------------------------------------------------------------------ */
/* Orçamentos e precificação                                           */
/* ------------------------------------------------------------------ */

export type QuoteStatus = "rascunho" | "enviado" | "visualizado" | "aceito" | "recusado" | "expirado"

export type PaymentCondition = "avista" | "parcelado" | "entrada"

export interface CatalogItem {
  id: ID
  name: string
  description: string
  projectType: ProjectType
  basePrice: number
  monthlyFee: number
  deadlineDays: number | null
  /** "A partir de": preço é piso, escopo define o final. */
  priceFrom: boolean
  /** Para recorrentes como tráfego: valor cobrado no primeiro mês. */
  firstMonthPrice?: number
  includedPages: number
  active: boolean
}

export interface PricingAddon {
  id: ID
  name: string
  price: number
  active: boolean
}

export interface HostingPlan {
  id: ID
  name: string
  monthly: number
  description: string
}

export interface PricingRules {
  minPrice: number
  expressPercent: number
  cashDiscountPercent: number
  maxInstallments: number
  extraPagePrice: number
  extraLanguagePercent: number
  quoteValidityDays: number
}

export interface Quote {
  id: ID
  number: string
  leadId?: ID
  clientId?: ID
  dealId?: ID
  status: QuoteStatus
  catalogItemId: ID
  pages: number
  languages: number
  addonIds: ID[]
  express: boolean
  hostingPlanId?: ID
  payment: PaymentCondition
  installments: number
  manualDiscount: number
  subtotal: number
  total: number
  monthlyFee: number
  deadlineDays: number
  validUntil: ISODate
  notes: string
  ownerId: ID
  createdAt: ISODate
  sentAt?: ISODate
  viewedAt?: ISODate
}

/* ------------------------------------------------------------------ */
/* Agenda e tarefas                                                    */
/* ------------------------------------------------------------------ */

export type EventType = "call" | "reuniao" | "followup" | "entrega" | "cobranca"

export interface CalendarEvent {
  id: ID
  title: string
  type: EventType
  start: ISODate
  end: ISODate
  leadId?: ID
  dealId?: ID
  clientId?: ID
  ownerId: ID
  meetingUrl?: string
  reminderMinutes?: number
  description?: string
  allDay?: boolean
  google?: {
    eventId: string
    calendarId: string
    readOnly: boolean
    htmlLink?: string
    etag?: string
    recurring?: boolean
    usesDefaultReminders?: boolean
  }
}

export type TaskStatus = "todo" | "doing" | "review" | "done"
export type TaskPriority = "baixa" | "media" | "alta" | "urgente"

export interface ChecklistItem {
  id: ID
  text: string
  done: boolean
}

export interface Comment {
  id: ID
  authorId: ID
  text: string
  createdAt: ISODate
}

export interface Attachment {
  id: ID
  name: string
  size: number
  mime: string
  createdAt: ISODate
}

export interface Task {
  id: ID
  title: string
  description: string
  status: TaskStatus
  priority: TaskPriority
  assigneeId: ID
  clientId?: ID
  dealId?: ID
  leadId?: ID
  projectName?: string
  dueDate: ISODate
  checklist: ChecklistItem[]
  comments: Comment[]
  attachments: Attachment[]
  order: number
  createdAt: ISODate
}

/* ------------------------------------------------------------------ */
/* Clientes                                                            */
/* ------------------------------------------------------------------ */

export interface Address {
  zip: string
  street: string
  number: string
  complement?: string
  district: string
  city: string
  state: string
}

export interface Client {
  id: ID
  name: string
  legalName: string
  documentType: "cpf" | "cnpj"
  document: string
  municipalRegistration?: string
  email: string
  whatsapp: string
  contactName: string
  address: Address
  leadId?: ID
  ownerId: ID
  status: "ativo" | "inativo"
  createdAt: ISODate
}

export type ProjectStatus = "planejamento" | "em_andamento" | "entregue" | "pausado"

export interface Project {
  id: ID
  clientId: ID
  dealId?: ID
  name: string
  projectType: ProjectType
  status: ProjectStatus
  value: number
  startDate: ISODate
  deliveryDate: ISODate
}

export interface Contract {
  id: ID
  clientId: ID
  title: string
  status: "aguardando_assinatura" | "vigente" | "encerrado"
  value: number
  monthly: number
  startDate: ISODate
  endDate: ISODate
}

/* ------------------------------------------------------------------ */
/* Financeiro                                                          */
/* ------------------------------------------------------------------ */

export type PaymentMethod = "boleto" | "pix" | "cartao"
export type ChargeStatus = "pendente" | "pago" | "vencido" | "cancelado"

export interface Charge {
  id: ID
  number: string
  clientId: ID
  dealId?: ID
  subscriptionId?: ID
  description: string
  amount: number
  method: PaymentMethod
  installment: number
  installments: number
  dueDate: ISODate
  paidAt?: ISODate
  status: ChargeStatus
  digitableLine: string
  barcode: string
  pixCode: string
  createdAt: ISODate
  /** Provedor que registrou o boleto. Ausente em cobranças sem registro real. */
  gateway?: "asaas"
  gatewayId?: string
  gatewayStatus?: string
  invoiceUrl?: string
  bankSlipUrl?: string
  nossoNumero?: string
  gatewayEnvironment?: "sandbox" | "producao"
}

export type SubscriptionStatus = "ativa" | "pausada" | "cancelada"

export interface Subscription {
  id: ID
  clientId: ID
  description: string
  amount: number
  method: PaymentMethod
  billingDay: number
  status: SubscriptionStatus
  startDate: ISODate
  nextBillingDate: ISODate
  canceledAt?: ISODate
  cancelReason?: string
}

export type EntryType = "receita" | "despesa"
export type EntryStatus = "pendente" | "pago" | "vencido"

export interface FinancialCategory {
  id: ID
  name: string
  type: EntryType
}

export interface FinancialEntry {
  id: ID
  type: EntryType
  description: string
  categoryId: ID
  amount: number
  competenceDate: ISODate
  dueDate: ISODate
  paidAt?: ISODate
  status: EntryStatus
  clientId?: ID
  supplier?: string
  chargeId?: ID
}

/* ------------------------------------------------------------------ */
/* Notas fiscais (NFS-e)                                               */
/* ------------------------------------------------------------------ */

export type InvoiceStatus = "processando" | "emitida" | "rejeitada" | "cancelada"

export interface InvoiceRetentions {
  ir: number
  pis: number
  cofins: number
  csll: number
  inss: number
  issRetido: boolean
}

export interface Invoice {
  id: ID
  number: string | null
  clientId: ID
  chargeId?: ID
  serviceDescription: string
  serviceCode: string
  issRate: number
  retentions: InvoiceRetentions
  amount: number
  status: InvoiceStatus
  issuedAt: ISODate
  verificationCode?: string
  rejectionReason?: string
}

/* ------------------------------------------------------------------ */
/* Atividades, notas e WhatsApp                                        */
/* ------------------------------------------------------------------ */

export type ActivityType =
  | "nota"
  | "ligacao"
  | "whatsapp"
  | "reuniao"
  | "status"
  | "negocio"
  | "orcamento"
  | "tarefa"
  | "formulario"

export interface Activity {
  id: ID
  type: ActivityType
  title: string
  description?: string
  leadId?: ID
  dealId?: ID
  clientId?: ID
  authorId: ID
  createdAt: ISODate
}

export interface Note {
  id: ID
  text: string
  leadId?: ID
  dealId?: ID
  clientId?: ID
  authorId: ID
  createdAt: ISODate
}

export interface WhatsappMessage {
  id: ID
  leadId: ID
  direction: "in" | "out"
  text: string
  status: "enviada" | "entregue" | "lida"
  createdAt: ISODate
}

export interface QuickMessage {
  id: ID
  title: string
  category: "primeiro_contato" | "follow_up" | "proposta" | "cobranca" | "pos_venda"
  text: string
}

/* ------------------------------------------------------------------ */
/* Formulários públicos                                                */
/* ------------------------------------------------------------------ */

export type FormFieldType = "text" | "email" | "tel" | "select" | "textarea"

export interface FormFieldConfig {
  id: ID
  key: string
  label: string
  type: FormFieldType
  placeholder?: string
  required: boolean
  options?: string[]
}

export interface PublicForm {
  id: ID
  name: string
  slug: string
  active: boolean
  title: string
  description: string
  fields: FormFieldConfig[]
  submitLabel: string
  successTitle: string
  successMessage: string
  ctaLabel: string
  whatsappNumber: string
  defaultSource: LeadSource
  submissions: number
  createdAt: ISODate
}

/* ------------------------------------------------------------------ */
/* Integrações                                                         */
/* ------------------------------------------------------------------ */

export type IntegrationKey =
  | "n8n"
  | "evolution"
  | "whatsapp_cloud"
  | "meta_lead_ads"
  | "google_calendar"
  | "asaas"
  | "brasil_nfe"

export type IntegrationStatus = "conectado" | "desconectado" | "erro"

export interface Integration {
  key: IntegrationKey
  name: string
  description: string
  category: "automacao" | "whatsapp" | "anuncios" | "agenda" | "pagamentos" | "fiscal"
  status: IntegrationStatus
  lastSyncAt?: ISODate
  errorMessage?: string
  config: Record<string, string>
}

export type WebhookEvent =
  | "lead.created"
  | "lead.updated"
  | "deal.created"
  | "deal.stage_changed"
  | "deal.won"
  | "deal.lost"
  | "quote.sent"
  | "quote.accepted"
  | "payment.created"
  | "payment.confirmed"
  | "payment.overdue"
  | "invoice.issued"
  | "task.created"
  | "task.overdue"
  | "event.created"

export interface Webhook {
  id: ID
  event: WebhookEvent
  url: string
  secret: string
  active: boolean
  lastStatus?: number
  lastSentAt?: ISODate
}

export interface ApiKey {
  id: ID
  name: string
  prefix: string
  scopes: string[]
  createdAt: ISODate
  lastUsedAt?: ISODate
}

export interface WhatsappInstance {
  id: ID
  name: string
  number: string
  status: "conectado" | "desconectado" | "aguardando_qr"
  webhookUrl: string
  messagesToday: number
}

export interface IntegrationLog {
  id: ID
  integration: IntegrationKey
  event: string
  direction: "entrada" | "saida"
  status: "sucesso" | "erro" | "pendente"
  statusCode: number
  payload: string
  response: string
  attempts: number
  createdAt: ISODate
}

/* ------------------------------------------------------------------ */
/* Configurações, notificações e anúncios                              */
/* ------------------------------------------------------------------ */

export interface Company {
  name: string
  legalName: string
  cnpj: string
  municipalRegistration: string
  email: string
  whatsapp: string
  website: string
  address: Address
}

export interface AppearanceSettings {
  density: "confortavel" | "compacta"
  showGrid: boolean
  sidebarCollapsed: boolean
}

export interface Notification {
  id: ID
  title: string
  description: string
  kind: "lead" | "negocio" | "pagamento" | "tarefa" | "agenda" | "integracao"
  read: boolean
  href?: string
  createdAt: ISODate
}

/** Investimento em anúncio por origem no período (custo por lead). */
export interface AdSpend {
  source: LeadSource
  amount: number
}
