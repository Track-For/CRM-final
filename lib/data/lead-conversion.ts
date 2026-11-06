import type { Client, Lead } from "@/types"

/** Uma identidade estável evita duplicar o cliente em conversões repetidas. */
export function clientForLead(lead: Lead, clients: Client[]): Client {
  const existing = clients.find((client) => client.id === lead.clientId)
    ?? clients.find((client) => client.leadId === lead.id)
  if (existing) return existing
  return {
    id: lead.clientId || `cli_lead_${lead.id}`,
    name: lead.company || lead.name,
    legalName: "",
    documentType: lead.company ? "cnpj" : "cpf",
    document: "",
    contactName: lead.name,
    email: lead.email,
    whatsapp: lead.whatsapp,
    address: { zip: "", street: "", number: "", district: "", city: "", state: "" },
    leadId: lead.id,
    ownerId: lead.ownerId,
    status: "ativo",
    createdAt: new Date().toISOString(),
  }
}
