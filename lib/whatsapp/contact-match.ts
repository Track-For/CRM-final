import type { Client, Lead } from "../../types/index"

function identity(input: string) {
  let phone = input.replace(/\D/g, "")
  if (phone.length === 10 || phone.length === 11) phone = `55${phone}`
  return /^55\d{2}9\d{8}$/.test(phone) ? phone.slice(0, 4) + phone.slice(5) : phone
}

/** O painel só associa um contato quando o cadastro é inequívoco. */
export function matchWhatsappContact(phone: string, leads: Lead[], clients: Client[]): { client: Client | undefined; lead: Lead | undefined; ambiguous: boolean } {
  const empty = { client: undefined, lead: undefined, ambiguous: false }
  if (!phone || phone.endsWith("@lid")) return empty
  const key = identity(phone)
  if (!key) return empty
  const matchedLeads = leads.filter(lead => identity(lead.whatsapp) === key)
  const lead = matchedLeads[0]
  const matchedClients = clients.filter(client => !client.deletedAt && !client.conversionReverted && (
    identity(client.whatsapp) === key || client.id === lead?.clientId || Boolean(lead && client.leadId === lead.id)
  ))
  if (matchedLeads.length > 1 || matchedClients.length > 1) return { ...empty, ambiguous: true }
  const client = matchedClients[0]
  if (client && lead?.clientId && client.id !== lead.clientId) return { ...empty, ambiguous: true }
  return { client, lead, ambiguous: false }
}
