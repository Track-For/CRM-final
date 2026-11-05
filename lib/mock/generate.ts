import { addDays, addMonths, endOfMonth, setDate, setHours, setMinutes, startOfDay, startOfMonth, subDays, subMonths } from "date-fns"
import type {
  Activity,
  AdSpend,
  ApiKey,
  CalendarEvent,
  Charge,
  ChargeStatus,
  Client,
  Contract,
  Deal,
  DealHistoryEntry,

  FinancialEntry,
  Integration,
  IntegrationLog,
  Invoice,
  Lead,
  LeadSource,
  LeadStatus,
  Note,
  Notification,
  PaymentMethod,
  Project,
  ProjectType,
  PublicForm,
  Quote,
  QuoteStatus,
  RevenueRange,
  StageKey,
  Subscription,
  Task,
  TaskPriority,
  TaskStatus,
  Temperature,
  Webhook,
  WhatsappInstance,
  WhatsappMessage,
} from "@/types"
import { STAGE_ORDER } from "@/lib/constants"
import { maskCnpj, maskCpf } from "@/lib/format"
import { calculateQuote } from "@/lib/pricing"
import { createRandom, type Random } from "./random"
import * as base from "./static"

export interface MockDatabase {
  users: typeof base.users
  pipelines: typeof base.pipelines
  lostReasons: typeof base.lostReasons
  catalog: typeof base.catalog
  addons: typeof base.addons
  hostingPlans: typeof base.hostingPlans
  pricingRules: typeof base.pricingRules
  financialCategories: typeof base.financialCategories
  quickMessages: typeof base.quickMessages
  company: typeof base.company
  integrations: Integration[]
  leads: Lead[]
  deals: Deal[]
  quotes: Quote[]
  clients: Client[]
  projects: Project[]
  contracts: Contract[]
  subscriptions: Subscription[]
  charges: Charge[]
  entries: FinancialEntry[]
  invoices: Invoice[]
  events: CalendarEvent[]
  tasks: Task[]
  activities: Activity[]
  notes: Note[]
  messages: WhatsappMessage[]
  forms: PublicForm[]
  webhooks: Webhook[]
  apiKeys: ApiKey[]
  whatsappInstances: WhatsappInstance[]
  integrationLogs: IntegrationLog[]
  notifications: Notification[]
  adSpend: AdSpend[]
}

const LEAD_SEED: [string, string][] = [
  ["Mariana Castilho", "Castilho Arquitetura"],
  ["Thiago Rezende", "Rezende Contabilidade"],
  ["Fernanda Lacerda", "Studio Lacerda Pilates"],
  ["Gustavo Nogueira", "Nogueira Imóveis"],
  ["Aline Barreto", "Barreto Odontologia"],
  ["Ricardo Magalhães", "RM Logística"],
  ["Priscila Fontes", "Ateliê Fontes"],
  ["Eduardo Sampaio", "Sampaio Advocacia"],
  ["Letícia Andrade", "Clínica Bem Viver"],
  ["Felipe Cardoso", "Cardoso Auto Peças"],
  ["Beatriz Quintela", "Quintela Doces"],
  ["Rodrigo Pimentel", "Pimentel Engenharia"],
  ["Vanessa Torres", "Torres Moda Fitness"],
  ["André Lobato", "Lobato Academia"],
  ["Carolina Meireles", "Meireles Nutrição"],
  ["Henrique Bastos", "Bastos Pet Shop"],
  ["Tatiane Vasconcelos", "TV Eventos"],
  ["Lucas Figueiredo", "Figueiredo Energia Solar"],
  ["Isabela Prado", "Prado Cosméticos"],
  ["Murilo Assunção", "Assunção Transportes"],
  ["Natália Guimarães", "Guimarães Café Especial"],
  ["Otávio Brandão", "Brandão Educação"],
  ["Renata Coutinho", "Coutinho Joias"],
  ["Sérgio Medeiros", "Medeiros Climatização"],
  ["Daniela Queiroz", "Queiroz Buffet"],
  ["Paulo Saldanha", "Saldanha Materiais de Construção"],
  ["Camila Rocha Lima", "Vila Verde Hortifruti"],
  ["Júlio Antunes", "Antunes Fisioterapia"],
  ["Larissa Peixoto", "Peixoto Turismo"],
  ["Marcelo Siqueira", "Siqueira Seguros"],
  ["Elaine Correia", "Correia Moda Praia"],
  ["Rafael Dantas", "Dantas Barbearia"],
  ["Simone Leal", "Leal Escola de Idiomas"],
  ["Vítor Amaral", "Amaral Tech Solutions"],
  ["Gabriela Falcão", "Falcão Decor"],
  ["Leandro Matos", "Matos Delivery"],
  ["Patrícia Rangel", "Rangel Psicologia"],
  ["Caio Bittencourt", "Bittencourt Games"],
  ["Mônica Freitas", "Freitas Floricultura"],
  ["Igor Valadares", "Valadares Consultoria"],
]

const CITIES: [string, string, string][] = [
  ["Salvador", "BA", "Pituba"],
  ["Salvador", "BA", "Caminho das Árvores"],
  ["Lauro de Freitas", "BA", "Vilas do Atlântico"],
  ["Feira de Santana", "BA", "Centro"],
  ["Aracaju", "SE", "Jardins"],
  ["Recife", "PE", "Boa Viagem"],
  ["São Paulo", "SP", "Pinheiros"],
  ["Belo Horizonte", "MG", "Savassi"],
]

const STREETS = ["Rua das Hortênsias", "Av. Paulo VI", "Rua Ceará", "Av. Manoel Dias da Silva", "Rua Alagoinhas", "Av. Santos Dumont", "Rua Rio Grande do Sul", "Rua Marques de Leão"]

const DEAL_STAGES: StageKey[] = [
  "novo_lead", "novo_lead", "novo_lead",
  "contato_feito", "contato_feito", "contato_feito", "contato_feito",
  "call_agendada", "call_agendada", "call_agendada", "call_agendada",
  "proposta_enviada", "proposta_enviada", "proposta_enviada", "proposta_enviada",
  "negociacao", "negociacao", "negociacao",
  "ganho", "ganho", "ganho", "ganho", "ganho",
  "perdido", "perdido",
]

/** Dias atrás em que o lead entrou, por etapa do negócio. */
const LEAD_AGE: Record<StageKey, [number, number]> = {
  novo_lead: [0, 5],
  contato_feito: [3, 16],
  call_agendada: [6, 22],
  proposta_enviada: [10, 32],
  negociacao: [14, 40],
  ganho: [18, 40],
  perdido: [20, 50],
}

const STAGE_TO_LEAD_STATUS: Record<StageKey, LeadStatus> = {
  novo_lead: "novo",
  contato_feito: "em_contato",
  call_agendada: "em_contato",
  proposta_enviada: "qualificado",
  negociacao: "qualificado",
  ganho: "convertido",
  perdido: "perdido",
}

const SELLERS = ["usr_camila", "usr_bruno", "usr_rafael"]
const OPS = ["usr_juliana", "usr_diego"]

let counter = 0
const uid = (prefix: string) => `${prefix}_${(++counter).toString(36).padStart(4, "0")}`

function slugEmail(name: string, company: string, r: Random) {
  const first = name.split(" ")[0].toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
  const domain = company.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z]/g, "").slice(0, 16)
  return r.chance(0.35) ? `${first}.${domain}@gmail.com` : `${first}@${domain}.com.br`
}

function phone(r: Random) {
  const ddd = r.pick(["71", "71", "71", "75", "79", "81", "11", "31"])
  return `(${ddd}) 9${r.digits(4)}-${r.digits(4)}`
}

function at(date: Date, hour: number, minute = 0) {
  return setMinutes(setHours(date, hour), minute)
}

function iso(date: Date) {
  return date.toISOString()
}

function boletoLine(r: Random) {
  return `23793.${r.digits(5)} ${r.digits(5)}.${r.digits(6)} ${r.digits(5)}.${r.digits(6)} ${r.digits(1)} ${r.digits(14)}`
}

function pixCode(r: Random, amount: number) {
  return `00020126580014BR.GOV.BCB.PIX0136${r.digits(8)}-${r.digits(4)}-${r.digits(4)}-${r.digits(4)}-${r.digits(12)}5204000053039865406${amount.toFixed(2)}5802BR5915TRACK FOR LTDA6008SALVADOR62070503***6304${r.digits(4)}`
}

export function createMockDatabase(now: Date = new Date()): MockDatabase {
  counter = 0
  const r = createRandom(20261021)
  const today = startOfDay(now)
  const daysAgo = (n: number, hour = r.int(8, 18)) => at(subDays(today, n), hour, r.pick([0, 15, 30, 45]))

  const pipelineFor = (t: ProjectType) => (t === "sistema" || t === "app" ? "pip_sistemas" : t === "anuncio" ? "pip_trafego" : "pip_sites")
  const catalogFor = (t: ProjectType) => {
    if (t === "app") return "cat_app"
    if (t === "sistema") return "cat_sistema"
    if (t === "anuncio") return "cat_trafego"
    if (t === "outros") return "cat_portfolio"
    return r.pick(["cat_landing", "cat_institucional", "cat_loja", "cat_ecommerce"])
  }
  const leadCatalog = new Map<string, string>()
  const catalogOf = (lead: Lead) => {
    if (!leadCatalog.has(lead.id)) leadCatalog.set(lead.id, catalogFor(lead.projectType))
    return leadCatalog.get(lead.id)!
  }

  /* ---------------------------- Leads ---------------------------- */
  const projectTypes: ProjectType[] = []
  const leads: Lead[] = LEAD_SEED.map(([name, company], i) => {
    const projectType = r.weighted<ProjectType>([["site", 10], ["sistema", 5], ["app", 3], ["anuncio", 2], ["outros", 1]])
    projectTypes.push(projectType)
    let createdDaysAgo: number
    let status: LeadStatus
    if (i < 25) {
      const stage = DEAL_STAGES[i]
      const [min, max] = LEAD_AGE[stage]
      createdDaysAgo = r.int(min, max)
      status = STAGE_TO_LEAD_STATUS[stage]
    } else if (i < 35) {
      createdDaysAgo = r.int(90, 420)
      status = "convertido"
    } else {
      createdDaysAgo = r.int(0, 12)
      status = i === 39 ? "perdido" : r.pick<LeadStatus>(["novo", "novo", "em_contato"])
    }
    const source = r.weighted<LeadSource>([["meta_ads", 10], ["google_ads", 7], ["instagram", 6], ["indicacao", 5], ["site", 4], ["whatsapp", 3], ["manual", 2]])
    const paid = source === "meta_ads" || source === "google_ads" || source === "instagram"
    const createdAt = daysAgo(createdDaysAgo)
    return {
      id: `lead_${String(i + 1).padStart(3, "0")}`,
      name,
      company,
      whatsapp: phone(r),
      email: slugEmail(name, company, r),
      projectType,
      revenue: r.weighted<RevenueRange>([["abaixo_10k", 3], ["10k_50k", 5], ["acima_50k", 3], ["acima_100k", 2], ["sem_faturamento", 1]]),
      source,
      temperature: r.weighted<Temperature>([["quente", 3], ["morno", 4], ["frio", 3]]),
      status,
      ownerId: r.pick(SELLERS),
      utm: paid
        ? {
            source: source === "google_ads" ? "google" : source === "instagram" ? "instagram" : "facebook",
            medium: source === "google_ads" ? "cpc" : "paid_social",
            campaign: r.pick(["sites-out26", "apps-lancamento", "lojas-black-friday", "trafego-pme"]),
            content: r.pick(["video-depoimento", "carrossel-portfolio", "estatico-oferta", undefined]),
            term: source === "google_ads" ? r.pick(["criar site profissional", "empresa de aplicativo", "loja virtual preço"]) : undefined,
          }
        : {},
      formId: paid || source === "site" ? r.pick(["form_site", "form_app", "form_trafego"]) : undefined,
      createdAt: iso(createdAt),
      updatedAt: iso(createdAt),
    }
  })

  /* --------------------------- Negócios --------------------------- */
  const quotes: Quote[] = []
  let quoteSeq = 41
  const buildQuote = (lead: Lead, dealId: string, status: QuoteStatus, createdAt: Date): Quote => {
    const catalogItemId = catalogOf(lead)
    const item = base.catalog.find((c) => c.id === catalogItemId)!
    const addonIds =
      lead.projectType === "anuncio" || lead.projectType === "outros"
        ? []
        : base.addons.filter(() => r.chance(lead.projectType === "site" ? 0.25 : 0.45)).map((a) => a.id)
    const pages = item.includedPages > 0 ? item.includedPages + r.pick([0, 0, 1, 2, 3]) : 0
    const languages = r.chance(0.15) ? 2 : 1
    const express = r.chance(0.2)
    const payment = r.pick(["avista", "parcelado", "entrada"] as const)
    const installments = payment === "parcelado" ? r.pick([3, 4, 6]) : 1
    const hostingPlan = item.monthlyFee ? base.hostingPlans.find((p) => p.monthly === item.monthlyFee) : base.hostingPlans[0]
    const manualDiscount = r.chance(0.2) ? r.pick([200, 300, 500]) : 0
    const calc = calculateQuote(
      { catalogItem: item, pages, languages, addonIds, express, hostingPlan, payment, installments, manualDiscount },
      base.addons,
      base.pricingRules,
    )
    const sentAt = status === "rascunho" ? undefined : addDays(createdAt, 0)
    return {
      id: `quo_${quoteSeq}`,
      number: `ORC-${String(quoteSeq++).padStart(4, "0")}`,
      leadId: lead.id,
      dealId,
      status,
      catalogItemId,
      pages,
      languages,
      addonIds,
      express,
      hostingPlanId: hostingPlan?.id,
      payment,
      installments,
      manualDiscount,
      subtotal: calc.subtotal,
      total: calc.total,
      monthlyFee: calc.monthlyFee,
      deadlineDays: calc.deadlineDays,
      validUntil: iso(addDays(createdAt, base.pricingRules.quoteValidityDays)),
      notes: "",
      ownerId: lead.ownerId,
      createdAt: iso(createdAt),
      sentAt: sentAt ? iso(sentAt) : undefined,
      viewedAt: status === "visualizado" || status === "aceito" || status === "recusado" ? iso(addDays(createdAt, 1)) : undefined,
    }
  }

  const deals: Deal[] = DEAL_STAGES.map((stage, i) => {
    const lead = leads[i]
    const pipelineId = pipelineFor(lead.projectType)
    const pipeline = base.pipelines.find((p) => p.id === pipelineId)!
    const leadCreated = new Date(lead.createdAt)
    const createdAt = addDays(leadCreated, r.int(0, 2))
    const id = `deal_${String(i + 1).padStart(3, "0")}`
    const idx = STAGE_ORDER.indexOf(stage)
    const ageDays = Math.max(0, Math.round((today.getTime() - startOfDay(createdAt).getTime()) / 86400000))
    // Alguns negócios abertos ficam parados de propósito (> 7 dias).
    const stale = stage !== "ganho" && stage !== "perdido" && stage !== "novo_lead" && i % 3 === 0
    const stageChangedDaysAgo = stale ? Math.min(ageDays, r.int(8, 18)) : Math.min(ageDays, r.int(0, 6))
    const stageChangedAt = daysAgo(stageChangedDaysAgo)

    const history: DealHistoryEntry[] = [
      { id: uid("dh"), type: "created", description: "Negócio criado a partir do lead", authorId: lead.ownerId, createdAt: iso(createdAt), toStage: "novo_lead" },
    ]
    const path = stage === "perdido" ? STAGE_ORDER.slice(1, r.int(2, 4)) : STAGE_ORDER.slice(1, idx + 1)
    const steps = path.length
    path.forEach((s, k) => {
      const prev = k === 0 ? "novo_lead" : path[k - 1]
      const when = k === steps - 1 ? stageChangedAt : addDays(createdAt, Math.round(((k + 1) / (steps + 1)) * Math.max(1, ageDays - stageChangedDaysAgo)))
      history.push({ id: uid("dh"), type: "stage", description: `Movido de etapa`, authorId: lead.ownerId, createdAt: iso(when), fromStage: prev, toStage: s })
    })
    if (stage === "perdido") {
      history.push({ id: uid("dh"), type: "lost", description: "Negócio marcado como perdido", authorId: lead.ownerId, createdAt: iso(stageChangedAt), toStage: "perdido" })
    }

    let value: number
    let monthlyFee: number
    if (idx >= 3 || stage === "perdido") {
      const qStatus: QuoteStatus =
        stage === "ganho" ? "aceito" : stage === "perdido" ? "recusado" : stage === "negociacao" ? "visualizado" : r.pick(["enviado", "visualizado"])
      const quoteDate = stage === "perdido" ? addDays(createdAt, 2) : subDays(stageChangedAt, stage === "proposta_enviada" ? 0 : r.int(1, 3))
      const q = buildQuote(lead, id, qStatus, quoteDate < createdAt ? createdAt : quoteDate)
      quotes.push(q)
      history.push({ id: uid("dh"), type: "quote", description: `Orçamento ${q.number} enviado`, authorId: lead.ownerId, createdAt: q.createdAt })
      value = q.total
      monthlyFee = q.monthlyFee
    } else {
      const item = base.catalog.find((c) => c.id === catalogOf(lead))!
      value = item.priceFrom ? item.basePrice + r.int(2, 14) * 1000 : (item.firstMonthPrice ?? item.basePrice)
      monthlyFee = item.monthlyFee
      if (stage === "call_agendada" && i % 2 === 0) {
        const q = buildQuote(lead, id, "rascunho", daysAgo(r.int(0, 2)))
        quotes.push(q)
      }
    }
    history.sort((a, b) => a.createdAt.localeCompare(b.createdAt))

    const probability = pipeline.stages.find((s) => s.key === stage)!.probability
    return {
      id,
      title: `${base.catalog.find((c) => c.id === catalogOf(lead))?.name ?? "Projeto"} — ${lead.company}`,
      leadId: lead.id,
      pipelineId,
      stage,
      projectType: lead.projectType,
      source: lead.source,
      value,
      monthlyFee,
      probability,
      expectedCloseDate: iso(stage === "ganho" ? stageChangedAt : addDays(today, r.int(3, 40))),
      ownerId: lead.ownerId,
      lostReasonId: stage === "perdido" ? r.pick(base.lostReasons).id : undefined,
      lostNote: stage === "perdido" ? "Cliente informou que vai adiar o projeto para o próximo semestre." : undefined,
      wonAt: stage === "ganho" ? iso(stageChangedAt) : undefined,
      lostAt: stage === "perdido" ? iso(stageChangedAt) : undefined,
      stageChangedAt: iso(stageChangedAt),
      createdAt: iso(createdAt),
      history,
    }
  })

  // Corrige os títulos usando o item do orçamento real, quando existir.
  for (const deal of deals) {
    const q = quotes.find((x) => x.dealId === deal.id)
    if (q) {
      const lead = leads.find((l) => l.id === deal.leadId)!
      deal.title = `${base.catalog.find((c) => c.id === q.catalogItemId)!.name} — ${lead.company}`
    }
  }

  // Orçamento expirado para um lead antigo ainda aberto
  {
    const lead = leads[36]
    const q = buildQuote(lead, "", "expirado", daysAgo(28))
    q.dealId = undefined
    quotes.push(q)
  }

  /* --------------------------- Clientes --------------------------- */
  const clientLeads = [...leads.slice(18, 23), ...leads.slice(25, 35)]
  const clients: Client[] = clientLeads.map((lead, i) => {
    const [city, state, district] = r.pick(CITIES)
    const isCpf = i === 3 || i === 9
    const doc = isCpf ? maskCpf(r.digits(11)) : maskCnpj(`${r.digits(8)}0001${r.digits(2)}`)
    const deal = deals.find((d) => d.leadId === lead.id)
    const createdAt = deal?.wonAt ?? iso(addDays(new Date(lead.createdAt), r.int(5, 20)))
    lead.clientId = `cli_${String(i + 1).padStart(3, "0")}`
    if (deal) deal.clientId = lead.clientId
    return {
      id: lead.clientId,
      name: lead.company,
      legalName: isCpf ? lead.name : `${lead.company} ${r.pick(["Ltda", "ME", "EIRELI", "S/S Ltda"])}`,
      documentType: isCpf ? "cpf" : "cnpj",
      document: doc,
      municipalRegistration: isCpf ? undefined : `${r.digits(6)}-${r.digits(3)}`,
      email: lead.email,
      whatsapp: lead.whatsapp,
      contactName: lead.name,
      address: {
        zip: `${r.digits(5)}-${r.digits(3)}`,
        street: r.pick(STREETS),
        number: String(r.int(12, 2400)),
        complement: r.chance(0.4) ? `Sala ${r.int(101, 1408)}` : undefined,
        district,
        city,
        state,
      },
      leadId: lead.id,
      ownerId: lead.ownerId,
      status: i === 14 ? "inativo" : "ativo",
      createdAt,
    }
  })

  /* --------------------------- Projetos --------------------------- */
  const projects: Project[] = []
  const contracts: Contract[] = []
  clients.forEach((client, i) => {
    const lead = leads.find((l) => l.id === client.leadId)!
    const deal = deals.find((d) => d.leadId === lead.id)
    const start = new Date(client.createdAt)
    const value = deal?.value ?? r.pick([3500, 4000, 6000, 9800, 14500, 22000])
    const itemName = base.catalog.find((c) => c.id === catalogOf(lead))!.name
    projects.push({
      id: uid("prj"),
      clientId: client.id,
      dealId: deal?.id,
      name: `${itemName} ${client.name}`,
      projectType: lead.projectType,
      status: deal ? (i % 2 === 0 ? "em_andamento" : "planejamento") : i === 13 ? "pausado" : "entregue",
      value,
      startDate: iso(start),
      deliveryDate: iso(addDays(start, deal ? r.int(15, 45) : r.int(15, 30))),
    })
    contracts.push({
      id: uid("ctr"),
      clientId: client.id,
      title: `Contrato de prestação de serviços — ${itemName}`,
      status: deal && i === 4 ? "aguardando_assinatura" : client.status === "inativo" ? "encerrado" : "vigente",
      value,
      monthly: deal?.monthlyFee ?? (lead.projectType === "app" ? 500 : lead.projectType === "anuncio" ? 2000 : 200),
      startDate: iso(start),
      endDate: iso(addMonths(start, 12)),
    })
    if (!deal && i % 4 === 1) {
      projects.push({
        id: uid("prj"),
        clientId: client.id,
        name: `Evolução ${client.name} — fase 2`,
        projectType: "sistema",
        status: "em_andamento",
        value: r.pick([4800, 7500, 12000]),
        startDate: iso(daysAgo(r.int(5, 25))),
        deliveryDate: iso(addDays(today, r.int(5, 30))),
      })
    }
  })

  /* ------------------------- Mensalidades ------------------------- */
  const subscriptions: Subscription[] = []
  clients.forEach((client, i) => {
    const lead = leads.find((l) => l.id === client.leadId)!
    if (i < 5 && i !== 1 && i !== 3) return // ganhos recentes ainda sem recorrência, exceto dois
    if (lead.projectType === "outros") return
    const amount = lead.projectType === "anuncio" ? 2000 : lead.projectType === "app" ? 500 : r.pick([150, 200, 200])
    const canceled = i === 14 || i === 11
    const start = new Date(client.createdAt)
    subscriptions.push({
      id: uid("sub"),
      clientId: client.id,
      description: lead.projectType === "anuncio" ? "Gestão de tráfego mensal" : lead.projectType === "app" ? "Manutenção do aplicativo" : amount === 150 ? "Hospedagem Básico" : "Hospedagem Profissional",
      amount,
      method: r.pick<PaymentMethod>(["boleto", "pix", "pix", "cartao"]),
      billingDay: r.pick([5, 10, 15, 20, 25]),
      status: canceled ? "cancelada" : "ativa",
      startDate: iso(start),
      nextBillingDate: iso(today),
      canceledAt: canceled ? iso(daysAgo(r.int(10, 50))) : undefined,
      cancelReason: canceled ? r.pick(["Cliente migrou a hospedagem", "Encerramento das atividades"]) : undefined,
    })
  })
  for (const s of subscriptions) {
    const dueThisMonth = setDate(today, s.billingDay)
    s.nextBillingDate = iso(dueThisMonth >= today ? dueThisMonth : setDate(addMonths(today, 1), s.billingDay))
  }

  /* -------------------------- Cobranças -------------------------- */
  const charges: Charge[] = []
  let chargeSeq = 1201
  const pushCharge = (c: Omit<Charge, "id" | "number" | "digitableLine" | "barcode" | "pixCode" | "createdAt">) => {
    charges.push({
      ...c,
      id: `chg_${chargeSeq}`,
      number: `COB-${chargeSeq++}`,
      digitableLine: boletoLine(r),
      barcode: `2379${r.digits(40)}`,
      pixCode: pixCode(r, c.amount),
      createdAt: iso(subDays(new Date(c.dueDate), 10)),
    })
  }
  const activeSubs = subscriptions.filter((s) => s.status === "ativa").slice(0, 10)
  activeSubs.forEach((s, k) => {
    const lastDue = setDate(subMonths(today, 1), s.billingDay)
    const lastLate = k === 2 || k === 6
    pushCharge({
      clientId: s.clientId,
      subscriptionId: s.id,
      description: `${s.description} — ${lastDue.toLocaleDateString("pt-BR", { month: "long" })}`,
      amount: s.amount,
      method: s.method,
      installment: 1,
      installments: 1,
      dueDate: iso(lastDue),
      paidAt: lastLate ? undefined : iso(addDays(lastDue, r.int(-2, 1))),
      status: lastLate ? "vencido" : "pago",
    })
    const due = setDate(today, s.billingDay)
    let status: ChargeStatus = "pendente"
    let paidAt: string | undefined
    if (due < today) {
      status = k === 4 ? "vencido" : "pago"
      paidAt = status === "pago" ? iso(addDays(due, r.int(-2, 0))) : undefined
    }
    pushCharge({
      clientId: s.clientId,
      subscriptionId: s.id,
      description: `${s.description} — ${due.toLocaleDateString("pt-BR", { month: "long" })}`,
      amount: s.amount,
      method: s.method,
      installment: 1,
      installments: 1,
      dueDate: iso(due),
      paidAt,
      status,
    })
  })
  deals
    .filter((d) => d.stage === "ganho")
    .forEach((d, k) => {
      const won = new Date(d.wonAt!)
      const half = Math.round(d.value / 2)
      const entryPaid = k !== 4
      pushCharge({
        clientId: d.clientId!,
        dealId: d.id,
        description: `Entrada 50% — ${d.title}`,
        amount: half,
        method: k % 2 ? "boleto" : "pix",
        installment: 1,
        installments: 2,
        dueDate: iso(addDays(won, 2)),
        paidAt: entryPaid ? iso(addDays(won, 1)) : undefined,
        status: entryPaid ? "pago" : addDays(won, 2) < today ? "vencido" : "pendente",
      })
      pushCharge({
        clientId: d.clientId!,
        dealId: d.id,
        description: `Entrega 50% — ${d.title}`,
        amount: d.value - half,
        method: k % 2 ? "boleto" : "pix",
        installment: 2,
        installments: 2,
        dueDate: iso(addDays(today, r.int(6, 35))),
        status: k === 3 ? "cancelado" : "pendente",
      })
    })

  projects
    .filter((p) => p.name.startsWith("Evolução"))
    .forEach((p, k) => {
      const half = Math.round(p.value / 2)
      const first = new Date(p.startDate)
      pushCharge({ clientId: p.clientId, description: `Parcela 1/2 — ${p.name}`, amount: half, method: "boleto", installment: 1, installments: 2, dueDate: iso(first), paidAt: iso(first), status: "pago" })
      pushCharge({ clientId: p.clientId, description: `Parcela 2/2 — ${p.name}`, amount: p.value - half, method: "boleto", installment: 2, installments: 2, dueDate: p.deliveryDate, status: k === 1 && new Date(p.deliveryDate) < today ? "vencido" : "pendente" })
    })

  /* ------------------------ Notas fiscais ------------------------ */
  const invoices: Invoice[] = []
  let nfSeq = 318
  charges
    .filter((c) => c.status === "pago")
    .slice(0, 12)
    .forEach((c, k) => {
      const status = k === 2 ? "rejeitada" : k === 5 ? "cancelada" : k === 11 ? "processando" : "emitida"
      invoices.push({
        id: uid("nfs"),
        number: status === "emitida" || status === "cancelada" ? String(nfSeq++) : null,
        clientId: c.clientId,
        chargeId: c.id,
        serviceDescription: c.description.includes("Hospedagem")
          ? "Serviços de hospedagem, manutenção e suporte de website"
          : c.description.includes("tráfego")
            ? "Serviços de gestão de campanhas de mídia paga"
            : "Desenvolvimento de software e website sob encomenda",
        serviceCode: c.description.includes("tráfego") ? "17.06" : "1.05",
        issRate: 5,
        retentions: { ir: 0, pis: 0, cofins: 0, csll: 0, inss: 0, issRetido: k === 7 },
        amount: c.amount,
        status,
        issuedAt: c.paidAt!,
        verificationCode: status === "emitida" ? `${r.digits(4)}-${r.digits(4)}` : undefined,
        rejectionReason: status === "rejeitada" ? "E160 — Inscrição municipal do tomador inválida" : undefined,
      })
    })

  /* ------------------------- Lançamentos ------------------------- */
  const entries: FinancialEntry[] = []
  for (const c of charges) {
    if (c.status === "cancelado") continue
    entries.push({
      id: uid("ent"),
      type: "receita",
      description: c.description,
      categoryId: c.subscriptionId ? (c.amount >= 2000 ? "fc_trafego" : "fc_mensalidades") : "fc_projetos",
      amount: c.amount,
      competenceDate: c.dueDate,
      dueDate: c.dueDate,
      paidAt: c.paidAt,
      status: c.status === "pago" ? "pago" : c.status === "vencido" ? "vencido" : "pendente",
      clientId: c.clientId,
      chargeId: c.id,
    })
  }
  for (let m = 5; m >= 2; m--) {
    const month = subMonths(today, m)
    const mrr = 2900 + (5 - m) * 350
    entries.push({ id: uid("ent"), type: "receita", description: "Mensalidades consolidadas", categoryId: "fc_mensalidades", amount: mrr, competenceDate: iso(setDate(month, 10)), dueDate: iso(setDate(month, 10)), paidAt: iso(setDate(month, 11)), status: "pago" })
    entries.push({ id: uid("ent"), type: "receita", description: "Projetos entregues", categoryId: "fc_projetos", amount: r.int(14, 32) * 1000, competenceDate: iso(setDate(month, 20)), dueDate: iso(setDate(month, 20)), paidAt: iso(setDate(month, 20)), status: "pago" })
  }
  const expenses: [string, string, number, string][] = [
    ["Folha e pró-labore", "fc_folha", 14800, "Equipe interna"],
    ["Ferramentas (Figma, GitHub, Notion)", "fc_ferramentas", 1240, "Diversos"],
    ["Servidores e hospedagem", "fc_infra", 1890, "AWS / Hostinger"],
    ["Simples Nacional", "fc_impostos", 3100, "Receita Federal"],
    ["Anúncios Track For", "fc_marketing", 3500, "Meta / Google"],
    ["Freelancer design", "fc_freelas", 2200, "Estúdio Linha"],
    ["Aluguel coworking", "fc_escritorio", 1600, "Hub Salvador"],
  ]
  for (let m = 5; m >= -1; m--) {
    const month = m >= 0 ? subMonths(today, m) : addMonths(today, 1)
    for (const [description, categoryId, amount, supplier] of expenses) {
      const due = setDate(month, categoryId === "fc_folha" ? 5 : categoryId === "fc_impostos" ? 20 : 15)
      const value = categoryId === "fc_freelas" || categoryId === "fc_marketing" ? Math.round(amount * (0.7 + r.next() * 0.6)) : amount
      const paid = due < today
      entries.push({
        id: uid("ent"),
        type: "despesa",
        description,
        categoryId,
        amount: value,
        competenceDate: iso(due),
        dueDate: iso(due),
        paidAt: paid ? iso(due) : undefined,
        status: paid ? "pago" : "pendente",
        supplier,
      })
    }
  }
  // Uma conta a pagar vencida para aparecer em "Contas a pagar"
  entries.push({ id: uid("ent"), type: "despesa", description: "Licença anual de plugin de e-commerce", categoryId: "fc_ferramentas", amount: 890, competenceDate: iso(daysAgo(4)), dueDate: iso(daysAgo(4)), status: "vencido", supplier: "WooExtensions" })

  /* --------------------------- Agenda --------------------------- */
  const events: CalendarEvent[] = []
  const monthStart = startOfMonth(today)
  const monthEnd = endOfMonth(today)
  const daysInMonth = monthEnd.getDate()
  const dayInMonth = (preferFuture: boolean) => {
    const d = today.getDate()
    const day = preferFuture && d < daysInMonth ? r.int(d, daysInMonth) : r.int(1, Math.max(1, d - 1))
    return setDate(monthStart, day)
  }
  const pushEvent = (e: Omit<CalendarEvent, "id" | "end"> & { minutes?: number }) => {
    const start = new Date(e.start)
    const { minutes, ...rest } = e
    events.push({ ...rest, id: uid("evt"), end: iso(new Date(start.getTime() + (minutes ?? 45) * 60000)) })
  }
  deals.forEach((d, i) => {
    const lead = leads.find((l) => l.id === d.leadId)!
    if (d.stage === "call_agendada") {
      pushEvent({ title: `Call de diagnóstico — ${lead.name}`, type: "call", start: iso(at(i % 2 ? today : dayInMonth(true), r.pick([9, 10, 14, 16]), 0)), leadId: lead.id, dealId: d.id, ownerId: d.ownerId, meetingUrl: `https://meet.google.com/${r.digits(3)}-${r.digits(4)}-${r.digits(3)}`, reminderMinutes: 15, minutes: 30 })
    }
    if (d.stage === "contato_feito" || d.stage === "proposta_enviada") {
      pushEvent({ title: `Follow-up — ${lead.name}`, type: "followup", start: iso(at(dayInMonth(i % 3 !== 0), r.pick([10, 11, 15, 17]), 30)), leadId: lead.id, dealId: d.id, ownerId: d.ownerId, reminderMinutes: 30, minutes: 15 })
    }
    if (d.stage === "negociacao") {
      pushEvent({ title: `Reunião de negociação — ${lead.company}`, type: "reuniao", start: iso(at(dayInMonth(true), 15, 0)), leadId: lead.id, dealId: d.id, ownerId: d.ownerId, meetingUrl: `https://meet.google.com/${r.digits(3)}-${r.digits(4)}-${r.digits(3)}`, reminderMinutes: 60, minutes: 60 })
    }
    if (d.stage === "ganho") {
      pushEvent({ title: `Kickoff do projeto — ${lead.company}`, type: "reuniao", start: iso(at(dayInMonth(false), 10, 0)), dealId: d.id, clientId: d.clientId, ownerId: "usr_juliana", meetingUrl: `https://meet.google.com/${r.digits(3)}-${r.digits(4)}-${r.digits(3)}`, reminderMinutes: 30, minutes: 60 })
    }
  })
  projects
    .filter((p) => p.status === "em_andamento" || p.status === "planejamento")
    .slice(0, 5)
    .forEach((p) => {
      pushEvent({ title: `Entrega — ${p.name}`, type: "entrega", start: iso(at(dayInMonth(true), 17, 0)), clientId: p.clientId, ownerId: r.pick(OPS), reminderMinutes: 1440, minutes: 30 })
    })
  charges
    .filter((c) => c.status !== "cancelado" && c.dueDate >= iso(monthStart) && c.dueDate <= iso(monthEnd) && c.amount >= 1000)
    .slice(0, 4)
    .forEach((c) => {
      const client = clients.find((x) => x.id === c.clientId)!
      pushEvent({ title: `Cobrança ${c.number} — ${client.name}`, type: "cobranca", start: iso(at(new Date(c.dueDate), 9, 0)), clientId: client.id, ownerId: "usr_marcos", reminderMinutes: 1440, minutes: 15 })
    })
  // Compromissos de hoje para o dashboard
  pushEvent({ title: "Alinhamento semanal comercial", type: "reuniao", start: iso(at(today, 8, 30)), ownerId: "usr_rafael", meetingUrl: "https://meet.google.com/sol-tech-com", minutes: 30 })
  events.sort((a, b) => a.start.localeCompare(b.start))

  /* --------------------------- Tarefas --------------------------- */
  const TASK_TITLES = [
    "Montar wireframe da home",
    "Configurar domínio e DNS",
    "Revisar copy da página de serviços",
    "Integrar checkout Asaas",
    "Publicar versão de homologação",
    "Ajustar responsivo do menu",
    "Configurar pixel da Meta e GA4",
    "Criar banco de dados e migrations",
    "Enviar contrato para assinatura",
    "Gravar vídeo de treinamento do painel",
    "Subir catálogo de produtos",
    "Configurar e-mails transacionais",
    "Revisar campanha de remarketing",
    "Otimizar imagens e performance",
    "Preparar apresentação da proposta",
    "Criar fluxo de automação no n8n",
    "Testes de compra ponta a ponta",
    "Documentar API para o cliente",
    "Reunião de handoff com o cliente",
    "Atualizar plugin e backup do site",
  ]
  const statusPlan: TaskStatus[] = ["todo", "todo", "todo", "todo", "todo", "todo", "doing", "doing", "doing", "doing", "doing", "review", "review", "review", "done", "done", "done", "done", "done", "todo"]
  const activeProjects = projects.filter((p) => p.status !== "entregue")
  const tasks: Task[] = TASK_TITLES.map((title, i) => {
    const status = statusPlan[i]
    const project = i === 14 ? undefined : activeProjects[i % activeProjects.length]
    const dealForProposal = i === 14 ? deals.find((d) => d.stage === "negociacao") : undefined
    const due = addDays(today, status === "done" ? -r.int(1, 10) : r.int(-6, 12))
    const checklistSize = r.int(0, 5)
    const doneCount = status === "done" ? checklistSize : status === "todo" ? 0 : r.int(0, checklistSize)
    const commentsCount = r.int(0, 3)
    return {
      id: `tsk_${String(i + 1).padStart(3, "0")}`,
      title,
      description: `Atividade do projeto${project ? ` ${project.name}` : ""}. Seguir o escopo aprovado e registrar o andamento aqui.`,
      status,
      priority: r.weighted<TaskPriority>([["baixa", 2], ["media", 4], ["alta", 3], ["urgente", 1]]),
      assigneeId: i === 8 || i === 14 ? "usr_camila" : r.pick(OPS),
      clientId: project?.clientId,
      dealId: dealForProposal?.id ?? project?.dealId,
      leadId: dealForProposal?.leadId,
      projectName: project?.name ?? dealForProposal?.title,
      dueDate: iso(at(due, 18, 0)),
      checklist: Array.from({ length: checklistSize }, (_, k) => ({ id: uid("chk"), text: ["Levantar referências", "Validar com o cliente", "Executar", "Revisar internamente", "Publicar"][k], done: k < doneCount })),
      comments: Array.from({ length: commentsCount }, (_, k) => ({ id: uid("cmt"), authorId: r.pick([...OPS, "usr_rafael"]), text: ["Cliente aprovou a primeira versão.", "Aguardando acesso ao painel da hospedagem.", "Subi os ajustes, pode revisar?"][k], createdAt: iso(daysAgo(r.int(0, 6))) })),
      attachments: r.chance(0.35) ? [{ id: uid("att"), name: "briefing-cliente.pdf", size: 482000, mime: "application/pdf", createdAt: iso(daysAgo(r.int(2, 10))) }] : [],
      order: i,
      createdAt: iso(daysAgo(r.int(3, 20))),
    }
  })

  /* --------------------- Atividades e WhatsApp --------------------- */
  const activities: Activity[] = []
  const notes: Note[] = []
  const messages: WhatsappMessage[] = []
  leads.forEach((lead, i) => {
    const created = new Date(lead.createdAt)
    activities.push({ id: uid("act"), type: lead.formId ? "formulario" : "status", title: lead.formId ? "Lead entrou pelo formulário" : "Lead cadastrado", description: lead.utm.campaign ? `Campanha ${lead.utm.campaign}` : undefined, leadId: lead.id, authorId: lead.ownerId, createdAt: lead.createdAt })
    if (lead.status === "novo" && i >= 3) return
    const firstContact = addDays(created, 0)
    firstContact.setHours(firstContact.getHours() + 1)
    activities.push({ id: uid("act"), type: "whatsapp", title: "Primeira mensagem enviada no WhatsApp", leadId: lead.id, authorId: lead.ownerId, createdAt: iso(firstContact) })
    const deal = deals.find((d) => d.leadId === lead.id)
    if (deal) {
      activities.push({ id: uid("act"), type: "negocio", title: `Negócio criado: ${deal.title}`, leadId: lead.id, dealId: deal.id, authorId: lead.ownerId, createdAt: deal.createdAt })
      const q = quotes.find((x) => x.dealId === deal.id)
      if (q && q.sentAt) activities.push({ id: uid("act"), type: "orcamento", title: `Orçamento ${q.number} enviado pelo WhatsApp`, leadId: lead.id, dealId: deal.id, authorId: lead.ownerId, createdAt: q.sentAt })
      if (STAGE_ORDER.indexOf(deal.stage) >= 2) activities.push({ id: uid("act"), type: "ligacao", title: "Call de diagnóstico realizada", description: "Entendeu o escopo, quer começar o quanto antes.", leadId: lead.id, dealId: deal.id, authorId: lead.ownerId, createdAt: iso(addDays(new Date(deal.createdAt), 2)) })
    }
    if (i % 3 === 0) {
      const text = r.pick([
        "Prefere contato depois das 14h. Já tem domínio registrado.",
        "Pediu referências de projetos parecidos no mesmo segmento.",
        "Tem urgência por causa de uma campanha que começa no mês que vem.",
        "Quem decide é o sócio; incluir os dois na próxima call.",
      ])
      notes.push({ id: uid("note"), text, leadId: lead.id, authorId: lead.ownerId, createdAt: iso(addDays(created, 1)) })
      activities.push({ id: uid("act"), type: "nota", title: "Nota adicionada", description: text, leadId: lead.id, authorId: lead.ownerId, createdAt: iso(addDays(created, 1)) })
    }
    const firstName = lead.name.split(" ")[0]
    const convo: [WhatsappMessage["direction"], string][] = [
      ["in", `Olá! Vi o anúncio de vocês e quero saber mais sobre ${lead.projectType === "app" ? "aplicativo" : lead.projectType === "sistema" ? "sistema sob medida" : lead.projectType === "anuncio" ? "gestão de tráfego" : "criação de site"}.`],
      ["out", `Olá, ${firstName}! Aqui é da Track For. Que bom falar com você. Me conta um pouco sobre a ${lead.company}?`],
      ["in", "Hoje a gente vende bastante pelo Instagram, mas queria algo mais profissional."],
      ["out", "Perfeito. Consigo te mostrar alguns projetos parecidos. Podemos marcar uma call de 20 minutos?"],
    ]
    if (deal && STAGE_ORDER.indexOf(deal.stage) >= 2) {
      convo.push(["in", "Pode ser amanhã às 10h?"], ["out", "Fechado! Te mando o link da reunião por aqui."])
    }
    if (deal && STAGE_ORDER.indexOf(deal.stage) >= 3 && deal.stage !== "perdido") {
      convo.push(["out", "Acabei de te enviar a proposta. Qualquer dúvida estou por aqui."], ["in", "Recebi, vou analisar com meu sócio e te retorno."])
    }
    convo.forEach(([direction, text], k) => {
      const when = new Date(created.getTime() + (k + 1) * 47 * 60000 + (k > 3 ? (k - 3) * 86400000 : 0))
      messages.push({ id: uid("msg"), leadId: lead.id, direction, text, status: "lida", createdAt: iso(when > now ? now : when) })
    })
  })

  /* -------------------------- Formulários -------------------------- */
  const commonFields = (projectDefault?: string) => [
    { id: uid("ff"), key: "name", label: "Nome completo", type: "text" as const, placeholder: "Seu nome", required: true },
    { id: uid("ff"), key: "whatsapp", label: "WhatsApp", type: "tel" as const, placeholder: "(71) 99999-9999", required: true },
    { id: uid("ff"), key: "email", label: "E-mail", type: "email" as const, placeholder: "voce@empresa.com.br", required: true },
    { id: uid("ff"), key: "company", label: "Empresa", type: "text" as const, placeholder: "Nome da empresa", required: false },
    { id: uid("ff"), key: "projectType", label: "Tipo de projeto", type: "select" as const, required: true, options: ["Aplicativo", "Sistema", "Site ou Loja virtual", "Anúncio online", "Outros"], placeholder: projectDefault },
    { id: uid("ff"), key: "revenue", label: "Faturamento mensal", type: "select" as const, required: true, options: ["Abaixo de R$10.000", "Entre R$10.000 e R$50.000", "Acima de R$50.000", "Acima de R$100.000", "Não tenho faturamento"] },
  ]
  const forms: PublicForm[] = [
    { id: "form_site", name: "Orçamento de site", slug: "orcamento-site", active: true, title: "Seu site profissional em poucos dias", description: "Preencha em menos de 1 minuto e receba uma proposta personalizada pelo WhatsApp.", fields: commonFields("Site ou Loja virtual"), submitLabel: "Quero minha proposta", successTitle: "Recebemos seus dados", successMessage: "Nossa equipe vai te chamar no WhatsApp em instantes. Se preferir, já marque uma call com a gente.", ctaLabel: "Gostaria de marcar uma call", whatsappNumber: base.company.whatsapp, defaultSource: "meta_ads", submissions: 0, createdAt: iso(daysAgo(120)) },
    { id: "form_app", name: "Quero um aplicativo", slug: "aplicativo", active: true, title: "Tire seu aplicativo do papel", description: "Conte rapidamente sobre sua ideia e receba um diagnóstico gratuito.", fields: [...commonFields("Aplicativo"), { id: uid("ff"), key: "message", label: "Conte sobre sua ideia", type: "textarea", placeholder: "O que o app precisa fazer?", required: false }], submitLabel: "Enviar ideia", successTitle: "Ideia recebida", successMessage: "Um especialista vai falar com você no WhatsApp para entender os detalhes.", ctaLabel: "Gostaria de marcar uma call", whatsappNumber: base.company.whatsapp, defaultSource: "google_ads", submissions: 0, createdAt: iso(daysAgo(90)) },
    { id: "form_trafego", name: "Gestão de tráfego", slug: "trafego", active: false, title: "Mais clientes com anúncios bem feitos", description: "Receba uma auditoria gratuita das suas campanhas.", fields: commonFields("Anúncio online"), submitLabel: "Quero a auditoria", successTitle: "Tudo certo", successMessage: "Vamos analisar suas campanhas e te chamar no WhatsApp.", ctaLabel: "Gostaria de marcar uma call", whatsappNumber: base.company.whatsapp, defaultSource: "instagram", submissions: 0, createdAt: iso(daysAgo(45)) },
  ]
  for (const f of forms) f.submissions = leads.filter((l) => l.formId === f.id).length + r.int(20, 80)

  /* -------------------------- Integrações -------------------------- */
  const integrations: Integration[] = base.integrationsBase.map((i) => ({
    ...i,
    config: { ...i.config },
    lastSyncAt: i.status === "desconectado" ? undefined : iso(subDays(now, i.status === "erro" ? 2 : 0)),
  }))
  const webhooks: Webhook[] = [
    { id: "wh_1", event: "lead.created", url: "https://n8n.solidtech.com.br/webhook/lead-criado", secret: "whsec_8f2b1c9d", active: true, lastStatus: 200, lastSentAt: iso(daysAgo(0)) },
    { id: "wh_2", event: "deal.stage_changed", url: "https://n8n.solidtech.com.br/webhook/negocio-etapa", secret: "whsec_1a7e4d2c", active: true, lastStatus: 200, lastSentAt: iso(daysAgo(0)) },
    { id: "wh_3", event: "deal.won", url: "https://n8n.solidtech.com.br/webhook/negocio-ganho", secret: "whsec_7b3f9e0a", active: true, lastStatus: 200, lastSentAt: iso(daysAgo(3)) },
    { id: "wh_4", event: "payment.confirmed", url: "https://n8n.solidtech.com.br/webhook/pagamento", secret: "whsec_c4d8a2f1", active: true, lastStatus: 500, lastSentAt: iso(daysAgo(1)) },
    { id: "wh_5", event: "invoice.issued", url: "https://n8n.solidtech.com.br/webhook/nfse", secret: "whsec_e9b2c7d4", active: false },
    { id: "wh_6", event: "task.overdue", url: "https://n8n.solidtech.com.br/webhook/tarefa-atrasada", secret: "whsec_5f1a3b8e", active: true, lastStatus: 200, lastSentAt: iso(daysAgo(0)) },
  ]
  const apiKeys: ApiKey[] = [
    { id: "key_1", name: "n8n produção", prefix: "sk_live_4f8a", scopes: ["leads:write", "deals:read"], createdAt: iso(daysAgo(80)), lastUsedAt: iso(daysAgo(0)) },
    { id: "key_2", name: "Landing pages", prefix: "sk_live_91cd", scopes: ["leads:write"], createdAt: iso(daysAgo(40)), lastUsedAt: iso(daysAgo(1)) },
  ]
  const whatsappInstances: WhatsappInstance[] = [
    { id: "wa_1", name: "Comercial", number: "(71) 99812-4410", status: "conectado", webhookUrl: "https://crm.solidtech.com.br/api/webhooks/evolution/comercial", messagesToday: 84 },
    { id: "wa_2", name: "Financeiro", number: "(71) 99230-7781", status: "aguardando_qr", webhookUrl: "https://crm.solidtech.com.br/api/webhooks/evolution/financeiro", messagesToday: 0 },
  ]
  const LOG_EVENTS: [IntegrationLog["integration"], string, IntegrationLog["direction"]][] = [
    ["n8n", "lead.created", "saida"],
    ["n8n", "deal.stage_changed", "saida"],
    ["n8n", "payment.confirmed", "saida"],
    ["evolution", "messages.upsert", "entrada"],
    ["evolution", "send.message", "saida"],
    ["meta_lead_ads", "leadgen", "entrada"],
    ["asaas", "PAYMENT_RECEIVED", "entrada"],
    ["asaas", "payments.create", "saida"],
    ["google_calendar", "events.insert", "saida"],
  ]
  const integrationLogs: IntegrationLog[] = Array.from({ length: 32 }, (_, i) => {
    const [integration, event, direction] = r.pick(LOG_EVENTS)
    const failed = integration === "meta_lead_ads" ? i % 2 === 0 : event === "payment.confirmed" ? i % 3 === 0 : r.chance(0.08)
    const lead = r.pick(leads)
    return {
      id: uid("log"),
      integration,
      event,
      direction,
      status: failed ? "erro" : i === 3 ? "pendente" : "sucesso",
      statusCode: failed ? (integration === "meta_lead_ads" ? 401 : 500) : i === 3 ? 0 : 200,
      payload: JSON.stringify({ event, data: { id: lead.id, name: lead.name, whatsapp: lead.whatsapp } }, null, 2),
      response: failed ? JSON.stringify({ error: integration === "meta_lead_ads" ? "OAuthException: token expirado" : "Internal Server Error" }) : JSON.stringify({ ok: true }),
      attempts: failed ? r.int(1, 3) : 1,
      createdAt: iso(new Date(now.getTime() - i * r.int(40, 260) * 60000)),
    }
  })

  /* ------------------------- Notificações ------------------------- */
  const hot = leads.filter((l) => l.status === "novo")
  const overdueCharge = charges.find((c) => c.status === "vencido")
  const notifications: Notification[] = [
    { id: uid("ntf"), title: "Novo lead pelo formulário", description: `${hot[0]?.name ?? "Lead"} pediu orçamento de ${hot[0] ? "projeto" : ""}`, kind: "lead", read: false, href: hot[0] ? `/leads/${hot[0].id}` : "/leads", createdAt: iso(subDays(now, 0)) },
    { id: uid("ntf"), title: "Pagamento confirmado", description: "Asaas confirmou o recebimento de uma cobrança via Pix", kind: "pagamento", read: false, href: "/financeiro/cobrancas", createdAt: iso(new Date(now.getTime() - 3 * 3600000)) },
    { id: uid("ntf"), title: "Cobrança vencida", description: overdueCharge ? `${overdueCharge.number} está vencida` : "Há cobranças vencidas", kind: "pagamento", read: false, href: "/financeiro/cobrancas", createdAt: iso(new Date(now.getTime() - 6 * 3600000)) },
    { id: uid("ntf"), title: "Tarefas atrasadas", description: "Existem tarefas da operação com prazo vencido", kind: "tarefa", read: false, href: "/tarefas", createdAt: iso(subDays(now, 1)) },
    { id: uid("ntf"), title: "Meta Lead Ads com erro", description: "Token expirado, reconecte a integração", kind: "integracao", read: true, href: "/integracoes/meta_lead_ads", createdAt: iso(subDays(now, 2)) },
    { id: uid("ntf"), title: "Call em 30 minutos", description: "Você tem uma call de diagnóstico agendada", kind: "agenda", read: true, href: "/agenda", createdAt: iso(subDays(now, 1)) },
  ]

  const adSpend: AdSpend[] = [
    { source: "meta_ads", amount: 4500 },
    { source: "google_ads", amount: 3200 },
    { source: "instagram", amount: 800 },
    { source: "indicacao", amount: 0 },
    { source: "site", amount: 0 },
    { source: "whatsapp", amount: 0 },
    { source: "manual", amount: 0 },
  ]

  return {
    users: base.users,
    pipelines: base.pipelines,
    lostReasons: base.lostReasons,
    catalog: base.catalog,
    addons: base.addons,
    hostingPlans: base.hostingPlans,
    pricingRules: base.pricingRules,
    financialCategories: base.financialCategories,
    quickMessages: base.quickMessages,
    company: base.company,
    integrations,
    leads,
    deals,
    quotes,
    clients,
    projects,
    contracts,
    subscriptions,
    charges,
    entries,
    invoices,
    events,
    tasks,
    activities,
    notes,
    messages,
    forms,
    webhooks,
    apiKeys,
    whatsappInstances,
    integrationLogs,
    notifications,
    adSpend,
  }
}

