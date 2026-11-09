import { createHash, randomUUID } from "node:crypto"
import { pipelines as defaults } from "@/lib/mock/static"
import { phoneIdentity, normalizePhone } from "@/lib/whatsapp/normalize"
import type { Deal, Lead, Pipeline } from "@/types"
import type { Prospect } from "./types"

export type SalesRow = { resource: string; id: string; deleted: boolean; data: Record<string, unknown> }
export function prospectContactSalesPlan(prospect: Prospect, actorId: string, rows: SalesRow[], now: string) {
  const id = prospect.origem === "receita_federal" ? `cnpj_${prospect.cnpj}` : `maps_${prospect.id}`
  const phone = prospect.whatsapp || prospect.telefone || ""
  const phoneKey = phone ? phoneIdentity(normalizePhone(phone)) : ""
  const email = (prospect.email || "").trim().toLowerCase()
  const activeLeads = rows.filter(r => r.resource === "leads" && !r.deleted)
  const direct = activeLeads.find(r => r.id === id)
  const matches = activeLeads.filter(r => (phoneKey && typeof r.data.whatsapp === "string" && r.data.whatsapp && phoneIdentity(normalizePhone(r.data.whatsapp)) === phoneKey) || (email && String(r.data.email || "").trim().toLowerCase() === email))
  if (!direct && matches.length > 1) throw Error("Há mais de um lead com o contato desta empresa. Revise os cadastros antes de vinculá-la às vendas.")
  const saved = direct || matches[0]
  if (!saved && rows.some(r => r.resource === "leads" && r.id === id && r.deleted)) throw Error("O lead desta empresa foi excluído. Restaure ou revise o cadastro para registrar a venda.")
  let lead = saved ? { ...saved.data, id: saved.id } as unknown as Lead : {
    id, name: prospect.nome, company: prospect.nome, whatsapp: phone, email: prospect.email || "",
    projectType: "outros", revenue: "sem_faturamento", source: "manual", temperature: "frio", status: "em_contato",
    ownerId: actorId, utm: { source: prospect.origem || "google_maps", medium: "prospeccao", campaign: `${prospect.categoria || ""} - ${prospect.cidade || ""}` }, createdAt: now, updatedAt: now,
  } satisfies Lead
  const deals = rows.filter(r => r.resource === "deals" && !r.deleted && (r.data.leadId === lead.id || (lead.clientId && r.data.clientId === lead.clientId)))
    .map(r => ({ ...r.data, id: r.id }) as unknown as Deal).sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""))
  const savedDeal = deals.find(d => !d.wonAt && !d.lostAt && !["ganho", "perdido"].includes(d.stage)) || deals[0]
  const storedPipelines = rows.filter(r => r.resource === "pipelines")
  const pipelines = [...storedPipelines.filter(r => !r.deleted).map(r => ({ ...r.data, id: r.id }) as unknown as Pipeline), ...defaults.filter(p => !storedPipelines.some(r => r.id === "pip_services" && !r.deleted) && !storedPipelines.some(r => r.id === p.id))]
  const preferred = lead.projectType === "sistema" || lead.projectType === "app" ? "pip_sistemas" : lead.projectType === "anuncio" ? "pip_trafego" : "pip_sites"
  const eligible = pipelines.filter(p => p.stages.some(s => s.key === "contato_feito" && s.kind === "open"))
  const pipeline = savedDeal ? pipelines.find(p => p.id === savedDeal.pipelineId) : eligible.find(p => p.id === preferred) || eligible[0]
  const targetStage = pipeline?.stages.find(s => s.key === "contato_feito" && s.kind === "open")
  const move = savedDeal?.stage === "novo_lead" && !savedDeal.wonAt && !savedDeal.lostAt
  if ((!savedDeal || move) && !targetStage) throw Error("Configure a etapa Contato feito em um funil ativo para registrar esta empresa em Vendas.")
  const dealId = `deal_prospect_${createHash("sha256").update(lead.id).digest("hex").slice(0, 32)}`
  if (!savedDeal && rows.some(r => r.resource === "deals" && r.id === dealId && r.deleted)) throw Error("O negócio desta empresa foi excluído. Revise o cadastro em Vendas.")
  const deal: Deal = savedDeal ? move ? {
    ...savedDeal, stage: "contato_feito", probability: targetStage!.probability, stageChangedAt: now,
    history: [...(savedDeal.history || []), { id: randomUUID(), type: "stage", description: "Contato confirmado por mensagem na prospecção", authorId: actorId, createdAt: now, fromStage: savedDeal.stage, toStage: "contato_feito" }],
  } : savedDeal : {
    id: dealId, title: prospect.nome, leadId: lead.id, ...(lead.clientId ? { clientId: lead.clientId } : {}), pipelineId: pipeline!.id,
    stage: "contato_feito", projectType: lead.projectType, source: lead.source, value: 0, monthlyFee: 0, probability: targetStage!.probability,
    expectedCloseDate: "", ownerId: lead.ownerId || actorId, stageChangedAt: now, createdAt: now,
    history: [{ id: randomUUID(), type: "created", description: "Negócio criado após envio confirmado na prospecção", authorId: actorId, createdAt: now, toStage: "contato_feito" }],
  }
  const terminal = deal.wonAt || deal.lostAt || ["ganho", "perdido"].includes(deal.stage)
  const changeLead = Boolean(saved && !terminal && ["novo", "perdido"].includes(lead.status))
  if (changeLead) lead = { ...lead, status: "em_contato", updatedAt: now }
  return { lead, deal, leadCreated: !saved, leadChanged: changeLead, dealCreated: !savedDeal, dealMoved: Boolean(move) }
}
