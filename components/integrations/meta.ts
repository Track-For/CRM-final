import type { LucideIcon } from "lucide-react"
import { CalendarDays, CreditCard, Megaphone, MessageCircle, Receipt, Smartphone, Workflow } from "lucide-react"
import type { Integration, IntegrationKey, IntegrationLog } from "@/types"

export const INTEGRATION_ICON: Record<IntegrationKey, LucideIcon> = {
  n8n: Workflow,
  evolution: Smartphone,
  whatsapp_cloud: MessageCircle,
  meta_lead_ads: Megaphone,
  google_calendar: CalendarDays,
  asaas: CreditCard,
  brasil_nfe: Receipt,
}

export const INTEGRATION_NAME: Record<IntegrationKey, string> = {
  n8n: "n8n",
  evolution: "Evolution API",
  whatsapp_cloud: "WhatsApp Cloud API",
  meta_lead_ads: "Meta Lead Ads",
  google_calendar: "Google Calendar",
  asaas: "Asaas",
  brasil_nfe: "Brasil NFe",
}

export const CATEGORY_LABEL: Record<Integration["category"], string> = {
  automacao: "Automação",
  whatsapp: "WhatsApp",
  anuncios: "Anúncios",
  agenda: "Agenda",
  pagamentos: "Pagamentos",
  fiscal: "Fiscal",
}

export interface ConfigFieldMeta {
  label: string
  placeholder?: string
  secret?: boolean
  hint?: string
  options?: { value: string; label: string }[]
}

const ENVIRONMENTS = [
  { value: "producao", label: "Produção" },
  { value: "homologacao", label: "Homologação (sandbox)" },
]

export const CONFIG_FIELDS: Record<string, ConfigFieldMeta> = {
  baseUrl: { label: "URL base", placeholder: "https://..." },
  apiKey: { label: "Chave de API", secret: true },
  phoneNumberId: { label: "Phone Number ID", placeholder: "Ex.: 104829384756" },
  wabaId: { label: "WhatsApp Business Account ID", placeholder: "Ex.: 203948576" },
  token: { label: "Token de acesso", secret: true },
  pageId: { label: "ID da página do Facebook" },
  formIds: { label: "Formulários vinculados", hint: "Separe por vírgula" },
  calendar: { label: "Agenda sincronizada", placeholder: "agenda@empresa.com.br" },
  environment: { label: "Ambiente", options: ENVIRONMENTS },
  walletId: { label: "Wallet ID" },
  serviceCode: { label: "Código de serviço padrão", placeholder: "1.05", hint: "Lista de serviços da LC 116" },
}

export const INTEGRATION_HELP: Partial<Record<IntegrationKey, string>> = {
  whatsapp_cloud: "Use a API oficial da Meta para enviar templates aprovados e receber mensagens com número verificado.",
  meta_lead_ads: "Cada lead dos formulários instantâneos do Facebook e Instagram entra no CRM com origem Meta Ads.",
  google_calendar: "Eventos criados na Agenda do CRM são espelhados no Google Calendar do responsável.",
  asaas: "Cobranças geradas no Financeiro viram boleto, Pix ou link de cartão no Asaas, com baixa automática por webhook.",
  brasil_nfe: "Notas fiscais de serviço (NFS-e) emitidas direto para a prefeitura, com PDF e XML anexados ao cliente.",
}

export const webhookUrlFor = (key: IntegrationKey) => `https://crm.solidtech.com.br/api/webhooks/${key.replace(/_/g, "-")}`

export const LOG_STATUS_TONE: Record<IntegrationLog["status"], "success" | "danger" | "warning"> = {
  sucesso: "success",
  erro: "danger",
  pendente: "warning",
}

export const LOG_STATUS_LABEL: Record<IntegrationLog["status"], string> = {
  sucesso: "Sucesso",
  erro: "Erro",
  pendente: "Pendente",
}
