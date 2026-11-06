import type {
  CatalogItem,
  Company,
  FinancialCategory,
  HostingPlan,
  Integration,
  LostReason,
  Pipeline,
  PipelineStage,
  PricingAddon,
  PricingRules,
  QuickMessage,
  StageKey,
  User,
} from "@/types"
import { STAGE_LABEL, STAGE_ORDER } from "@/lib/constants"

export const users: User[] = [
  { id: "usr_rafael", name: "Luiz", email: "", whatsapp: "", role: "admin", initials: "L", active: true, createdAt: "2024-02-01T12:00:00.000Z" },
]

const defaultProbability: Record<StageKey, number> = {
  novo_lead: 10,
  contato_feito: 20,
  call_agendada: 35,
  proposta_enviada: 55,
  negociacao: 75,
  ganho: 100,
  perdido: 0,
}

function buildStages(overrides: Partial<Record<StageKey, { name?: string; probability?: number }>> = {}): PipelineStage[] {
  return STAGE_ORDER.map((key, order) => ({
    key,
    order,
    name: overrides[key]?.name ?? STAGE_LABEL[key],
    probability: overrides[key]?.probability ?? defaultProbability[key],
    kind: key === "ganho" ? "won" : key === "perdido" ? "lost" : "open",
  }))
}

export const pipelines: Pipeline[] = [
  { id: "pip_sites", name: "Sites", description: "Landing pages, sites institucionais e lojas virtuais", stages: buildStages() },
  {
    id: "pip_sistemas",
    name: "Sistemas",
    description: "Sistemas sob medida e aplicativos",
    stages: buildStages({
      call_agendada: { name: "Diagnóstico agendado", probability: 30 },
      proposta_enviada: { probability: 45 },
      negociacao: { probability: 70 },
    }),
  },
  {
    id: "pip_trafego",
    name: "Tráfego",
    description: "Gestão de tráfego pago recorrente",
    stages: buildStages({ call_agendada: { name: "Auditoria agendada" }, proposta_enviada: { probability: 60 } }),
  },
]

export const lostReasons: LostReason[] = [
  { id: "lr_preco", label: "Preço acima do orçamento" },
  { id: "lr_concorrente", label: "Fechou com concorrente" },
  { id: "lr_sem_resposta", label: "Parou de responder" },
  { id: "lr_timing", label: "Não é o momento" },
  { id: "lr_escopo", label: "Escopo fora do que fazemos" },
  { id: "lr_interno", label: "Vai fazer internamente" },
]

export const catalog: CatalogItem[] = [
  { id: "cat_landing", name: "Landing page", description: "Página única de alta conversão para campanhas", projectType: "site", basePrice: 2500, monthlyFee: 150, deadlineDays: 15, priceFrom: false, includedPages: 1, active: true },
  { id: "cat_institucional", name: "Site institucional", description: "Até 5 páginas com blog opcional", projectType: "site", basePrice: 3500, monthlyFee: 200, deadlineDays: 10, priceFrom: false, includedPages: 5, active: true },
  { id: "cat_loja", name: "Loja virtual", description: "Loja com catálogo, carrinho e checkout", projectType: "site", basePrice: 4000, monthlyFee: 200, deadlineDays: 15, priceFrom: false, includedPages: 6, active: true },
  { id: "cat_ecommerce", name: "E-commerce completo", description: "Loja com integrações de frete, ERP e marketplace", projectType: "site", basePrice: 6000, monthlyFee: 0, deadlineDays: 20, priceFrom: false, includedPages: 10, active: true },
  { id: "cat_portfolio", name: "Portfólio em PDF", description: "Apresentação comercial diagramada", projectType: "outros", basePrice: 1500, monthlyFee: 0, deadlineDays: 3, priceFrom: false, includedPages: 1, active: true },
  { id: "cat_sistema", name: "Sistema", description: "Sistema web sob medida", projectType: "sistema", basePrice: 6000, monthlyFee: 0, deadlineDays: null, priceFrom: true, includedPages: 0, active: true },
  { id: "cat_app", name: "App", description: "Aplicativo iOS e Android", projectType: "app", basePrice: 10000, monthlyFee: 500, deadlineDays: null, priceFrom: true, includedPages: 0, active: true },
  { id: "cat_trafego", name: "Gestão de tráfego", description: "Meta Ads e Google Ads com relatório mensal", projectType: "anuncio", basePrice: 2000, monthlyFee: 2000, deadlineDays: null, priceFrom: false, firstMonthPrice: 1000, includedPages: 0, active: true },
]

export const addons: PricingAddon[] = [
  { id: "add_blog", name: "Blog", price: 600, active: true },
  { id: "add_membros", name: "Área de membros", price: 1800, active: true },
  { id: "add_painel", name: "Painel administrativo", price: 1500, active: true },
  { id: "add_checkout", name: "Checkout/pagamento", price: 900, active: true },
  { id: "add_api", name: "Integração com API externa", price: 1200, active: true },
  { id: "add_copy", name: "Copy", price: 700, active: true },
  { id: "add_seo", name: "SEO avançado", price: 800, active: true },
  { id: "add_animacoes", name: "Animações", price: 500, active: true },
  { id: "add_chat", name: "Chat/WhatsApp", price: 300, active: true },
]

export const hostingPlans: HostingPlan[] = [
  { id: "plan_none", name: "Sem mensalidade", monthly: 0, description: "Cliente cuida da hospedagem" },
  { id: "plan_basico", name: "Básico", monthly: 150, description: "Hospedagem, SSL e backup semanal" },
  { id: "plan_pro", name: "Profissional", monthly: 200, description: "Hospedagem, backup diário e 2h de ajustes/mês" },
  { id: "plan_premium", name: "Premium", monthly: 500, description: "Infra dedicada, monitoramento e 6h de ajustes/mês" },
]

export const pricingRules: PricingRules = {
  minPrice: 2000,
  expressPercent: 30,
  cashDiscountPercent: 10,
  maxInstallments: 6,
  extraPagePrice: 350,
  extraLanguagePercent: 25,
  quoteValidityDays: 15,
}

export const financialCategories: FinancialCategory[] = [
  { id: "fc_projetos", name: "Projetos", type: "receita" },
  { id: "fc_mensalidades", name: "Mensalidades", type: "receita" },
  { id: "fc_trafego", name: "Gestão de tráfego", type: "receita" },
  { id: "fc_folha", name: "Folha e pró-labore", type: "despesa" },
  { id: "fc_ferramentas", name: "Ferramentas e softwares", type: "despesa" },
  { id: "fc_infra", name: "Infraestrutura e servidores", type: "despesa" },
  { id: "fc_impostos", name: "Impostos", type: "despesa" },
  { id: "fc_marketing", name: "Marketing", type: "despesa" },
  { id: "fc_freelas", name: "Freelancers", type: "despesa" },
  { id: "fc_escritorio", name: "Escritório", type: "despesa" },
]

export const quickMessages: QuickMessage[] = [
  { id: "qm_1", title: "Primeiro contato", category: "primeiro_contato", text: "Olá, {nome}! Aqui é da Track For. Recebemos seu interesse em {projeto}. Posso te fazer algumas perguntas rápidas para entender melhor o que você precisa?" },
  { id: "qm_2", title: "Agendar call", category: "primeiro_contato", text: "{nome}, que tal marcarmos uma call de 20 minutos para eu entender seu projeto e te passar uma proposta certeira? Tenho horários amanhã às 10h ou às 15h." },
  { id: "qm_3", title: "Follow-up sem resposta", category: "follow_up", text: "Oi, {nome}! Passando para saber se você conseguiu avaliar nossa conversa. Fico à disposição para tirar qualquer dúvida." },
  { id: "qm_4", title: "Proposta enviada", category: "proposta", text: "{nome}, acabei de te enviar a proposta do seu {projeto}. Ela tem validade de 15 dias. Me conta o que achou?" },
  { id: "qm_5", title: "Lembrete de pagamento", category: "cobranca", text: "Olá, {nome}! Lembrando que a cobrança de {valor} vence em {vencimento}. Segue o link para pagamento: {link}" },
  { id: "qm_6", title: "Projeto entregue", category: "pos_venda", text: "{nome}, seu projeto está no ar! Qualquer ajuste nos próximos 30 dias é por nossa conta. Obrigado pela confiança." },
]

export const company: Company = {
  name: "Track For",
  legalName: "Track For Desenvolvimento de Software Ltda",
  cnpj: "41.287.556/0001-09",
  municipalRegistration: "0812349-001",
  email: "contato@solidtech.com.br",
  whatsapp: "(71) 99812-4410",
  website: "solidtech.com.br",
  address: { zip: "41820-021", street: "Av. Tancredo Neves", number: "1632", complement: "Sala 1205", district: "Caminho das Árvores", city: "Salvador", state: "BA" },
}

export const integrationsBase: Integration[] = [
  { key: "n8n", name: "n8n", description: "Webhooks de saída por evento e chaves de API para automações de entrada.", category: "automacao", status: "conectado", config: { baseUrl: "https://n8n.solidtech.com.br" } },
  { key: "evolution", name: "Evolution API", description: "Instâncias de WhatsApp não oficiais com QR code.", category: "whatsapp", status: "conectado", config: { baseUrl: "https://evo.solidtech.com.br", apiKey: "evo_live_••••••••3f2a" } },
  { key: "whatsapp_cloud", name: "WhatsApp Cloud API", description: "API oficial da Meta para mensagens e templates aprovados.", category: "whatsapp", status: "desconectado", config: { phoneNumberId: "", wabaId: "", token: "" } },
  { key: "meta_lead_ads", name: "Meta Lead Ads", description: "Importa leads dos formulários instantâneos do Facebook e Instagram.", category: "anuncios", status: "erro", errorMessage: "Token de acesso expirado. Reconecte a conta.", config: { pageId: "102938475610293", formIds: "Formulário Sites, Formulário Apps" } },
  { key: "google_calendar", name: "Google Agenda", description: "Sincroniza os eventos da conta Google autorizada.", category: "agenda", status: "desconectado", config: {} },
  { key: "asaas", name: "Asaas", description: "Emissão de boleto, Pix e cartão com baixa automática.", category: "pagamentos", status: "conectado", config: { environment: "producao", apiKey: "$aact_••••••••91bc", walletId: "a1b2-c3d4" } },
  { key: "brasil_nfe", name: "Brasil NFe", description: "Emissão de NFS-e para a prefeitura de Salvador.", category: "fiscal", status: "desconectado", config: { token: "", environment: "homologacao", serviceCode: "1.05" } },
]
