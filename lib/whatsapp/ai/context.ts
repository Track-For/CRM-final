import { randomUUID } from "node:crypto"
import { and, eq, sql } from "drizzle-orm"
import { db, crmRecords, whatsappMessages, whatsappContacts, invoices } from "@/lib/db"
import { sha256Hex } from "@/lib/auth/session"
import { HERMES_SCOPE, buildCustomerContext, contactIdentity, contextRequestSchema, hermesPermissionsSchema, matchContact } from "./policy"

export class ContextError extends Error { constructor(public status: number, message: string) { super(message) } }
export async function getHermesCustomerContext(authorization: string | null, input: unknown) {
  const token = authorization?.match(/^Bearer (sk_live_[A-Za-z0-9_-]{43})$/i)?.[1]
  if (!token) throw new ContextError(401, "Acesso não autorizado.")
  const [key] = await db.select().from(crmRecords).where(sql`${crmRecords.resource}='apiKeys' and ${crmRecords.deleted}=false and ${crmRecords.data}->>'tokenHash'=${sha256Hex(token)} and ${crmRecords.data}->'scopes' ? ${HERMES_SCOPE}`).limit(1)
  if (!key) throw new ContextError(403, "Chave inválida, revogada ou sem permissão para atendimento.")
  const permissions = hermesPermissionsSchema.safeParse(key.data.contextPermissions)
  const instance = process.env.EVOLUTION_INSTANCE || "crm-principal"
  if (!permissions.success || key.data.whatsappInstance !== instance) throw new ContextError(403, "Acesso não habilitado para esta instância.")
  const parsed = contextRequestSchema.safeParse(input)
  if (!parsed.success) throw new ContextError(400, "Informe apenas o identificador da conversa individual.")
  const chatId = parsed.data.chatId
  let phone = chatId
  if (/^\d{7,30}@lid$/.test(chatId)) {
    const [mapping] = await db.select({ phone: whatsappContacts.phone }).from(whatsappContacts).where(and(eq(whatsappContacts.instance, instance), eq(whatsappContacts.lid, chatId))).limit(1)
    if (!mapping) throw new ContextError(409, "O telefone desta conversa ainda não foi identificado. Encaminhe para a equipe.")
    phone = mapping.phone
  }
  const identity = contactIdentity(phone === chatId ? phone : `${phone}@s.whatsapp.net`)
  if (!identity) throw new ContextError(400, "Identificador de contato inválido. Grupos não são permitidos.")
  const aliases = identity.startsWith("55") && identity.length === 12 ? [identity, `${identity.slice(0, 4)}9${identity.slice(4)}`] : [identity]
  const recent = await db.select({ id: whatsappMessages.id }).from(whatsappMessages).where(sql`${whatsappMessages.instance}=${instance} and ${whatsappMessages.direction}='in' and ${whatsappMessages.phone} in (${sql.join(aliases.map(phone => sql`${phone}`), sql`, `)}) and ${whatsappMessages.sentAt} >= now() - interval '30 days'`).limit(1)
  if (!recent.length) throw new ContextError(409, "Não há mensagem recebida recente deste contato no CRM. Sincronize o WhatsApp antes de consultar.")
  const bucket = `${key.id}:${sha256Hex(identity).slice(0, 16)}:${Math.floor(Date.now() / 60000)}`
  const [rate] = await db.insert(crmRecords).values({ resource: "hermesRate", id: bucket, created: true, data: { count: 1 } }).onConflictDoUpdate({ target: [crmRecords.resource, crmRecords.id], set: { data: sql`jsonb_build_object('count',(${crmRecords.data}->>'count')::int+1)`, updatedAt: new Date() }, setWhere: sql`(${crmRecords.data}->>'count')::int < 30` }).returning({ id: crmRecords.id })
  if (!rate) throw new ContextError(429, "Limite de consultas atingido. Tente novamente em um minuto.")
  // Busca identidades primeiro; registros de atendimento são filtrados por IDs em seguida.
  const identities = await db.select({ resource: crmRecords.resource, id: crmRecords.id, data: crmRecords.data }).from(crmRecords).where(sql`${crmRecords.resource} in ('clients','leads') and ${crmRecords.deleted}=false`)
  const match = matchContact(identity, identities)
  const clientId = match.status === "matched" ? match.client?.id : undefined
  const leadIds = match.status === "matched" ? match.leads.map(lead => lead.id) : []
  const categories = [...(permissions.data.projects ? ["projects"] : []), ...(permissions.data.billing && clientId ? ["charges", "subscriptions"] : []), ...(permissions.data.quotes ? ["quotes"] : [])]
  const records = match.status === "matched" && categories.length && (clientId || leadIds.length) ? await db.select({ resource: crmRecords.resource, id: crmRecords.id, data: crmRecords.data }).from(crmRecords).where(sql`${crmRecords.deleted}=false and ${crmRecords.resource} in (${sql.join(categories.map(value => sql`${value}`), sql`, `)}) and ${clientId ? sql`(${crmRecords.data}->>'clientId'=${clientId}${leadIds.length ? sql` or (${crmRecords.data}->>'clientId' is null and ${crmRecords.data}->>'leadId' in (${sql.join(leadIds.map(id => sql`${id}`), sql`, `)}))` : sql``})` : sql`${crmRecords.data}->>'clientId' is null and ${crmRecords.data}->>'leadId' in (${sql.join(leadIds.map(id => sql`${id}`), sql`, `)})`}`) : []
  if (permissions.data.billing && clientId) {
    const fiscal = await db.select({ id: invoices.id, number: invoices.number, status: invoices.status, amount: invoices.amount, issuedAt: invoices.issuedAt }).from(invoices).where(eq(invoices.clientId, clientId)).limit(50)
    for (const row of fiscal) records.push({ resource: "invoices", id: row.id, data: { clientId, number: row.number, status: row.status, amount: Number(row.amount), issuedAt: row.issuedAt?.toISOString() || null } })
  }
  const context = { ...buildCustomerContext(match, records, permissions.data), truncated: false }
  const sections = ["projects", "charges", "subscriptions", "invoices", "quotes"] as const
  while (Buffer.byteLength(JSON.stringify(context)) > 100000) {
    const largest = [...sections].sort((a, b) => JSON.stringify(context[b]).length - JSON.stringify(context[a]).length)[0]
    if (!context[largest].length) break
    context[largest].pop(); context.truncated = true
  }
  if (context.projects.length >= 50 || context.charges.length >= 100 || context.quotes.length >= 50 || context.subscriptions.length >= 50 || context.invoices.length >= 50) context.truncated = true
  if (context.truncated) context.instructions.push("A consulta contém um recorte dos registros. Não apresente totais gerais nem afirme que a lista é completa.")
  const now = new Date().toISOString()
  // Não persiste perguntas, respostas, documentos ou o conteúdo consultado no log.
  await db.insert(crmRecords).values({ resource: "hermesAudit", id: randomUUID(), created: true, data: { keyId: key.id, contactHash: sha256Hex(identity), match: match.status, queriedAt: now, categories } })
  const [activeKey] = await db.update(crmRecords).set({ data: sql`${crmRecords.data} || ${JSON.stringify({ lastUsedAt: now })}::jsonb` }).where(sql`${crmRecords.resource}='apiKeys' and ${crmRecords.id}=${key.id} and ${crmRecords.deleted}=false`).returning({ id: crmRecords.id })
  if (!activeKey) throw new ContextError(403, "A chave foi revogada durante a consulta.")
  return { ...context, queriedAt: now }
}
