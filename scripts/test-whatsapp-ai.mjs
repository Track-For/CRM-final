import { test } from "node:test"
import assert from "node:assert/strict"
import { build } from "esbuild"
import { mkdir } from "node:fs/promises"
import { pathToFileURL } from "node:url"
import path from "node:path"
const dir = path.resolve(".next/whatsapp-ai-unit"); await mkdir(dir, { recursive: true })
const outfile = path.join(dir, "policy.mjs")
await build({ entryPoints: ["lib/whatsapp/ai/policy.ts"], outfile, bundle: true, platform: "node", format: "esm", packages: "external", logLevel: "silent" })
const { buildCustomerContext, matchContact, contactIdentity, safePaymentUrl, contextRequestSchema } = await import(pathToFileURL(outfile).href)
const permissions = { projects: true, billing: true, quotes: true, publicInformation: "Atendimento de segunda a sexta" }
const row = (resource, id, data) => ({ resource, id, data: { id, ...data } })
const client = row("clients", "client-a", { whatsapp: "(71) 99999-9999", name: "Cliente A", contactName: "Contato A", leadId: "lead-a", document: "private-cpf", email: "private-email", address: "private-address", status: "ativo" })
const lead = row("leads", "lead-a", { name: "Contato A", whatsapp: "+5571999999999", clientId: "client-a", notes: "private-note" })
const records = [client, lead, row("clients", "client-b", { whatsapp: "(11) 98888-8888", name: "CLIENTE B PRIVADO" }), row("projects", "project-a", { clientId: "client-a", name: "Projeto A", value: 123, privateNote: "private-note", stages: [{ name: "Design", status: "em_andamento", description: "private-description", assigneeId: "private-owner" }] }), row("projects", "project-b", { clientId: "client-b", name: "PROJETO B PRIVADO" }), row("charges", "charge-a", { clientId: "client-a", amount: 100, status: "pendente", invoiceUrl: "https://www.asaas.com/i/fixture", gatewayCustomerId: "private-gateway" }), row("quotes", "draft", { clientId: "client-a", status: "rascunho", total: 900, notes: "private-quote" }), row("quotes", "sent", { clientId: "client-a", status: "enviado", total: 500, number: "ORC-A", notes: "private-quote" }), row("quotes", "other-client", { clientId: "client-b", leadId: "lead-a", status: "enviado", number: "OTHER CLIENT" })]
test("identifica o mesmo brasileiro com e sem nono dígito; bloqueia grupos e LID não resolvido", () => {
  assert.equal(contactIdentity("(71) 99999-9999"), contactIdentity("557199999999@s.whatsapp.net"))
  assert.equal(contactIdentity("+15551234567"), "15551234567")
  assert.equal(contactIdentity("15551234567@s.whatsapp.net"), "15551234567")
  for (const value of ["123456789@lid", "120363000@g.us", "status@broadcast", "outra pessoa"]) assert.equal(contactIdentity(value), null)
})
test("contexto inclui somente os dados permitidos do próprio cliente", () => {
  const match = matchContact(contactIdentity(client.data.whatsapp), records)
  const context = buildCustomerContext(match, records, permissions)
  assert.equal(context.customer.name, "Contato A"); assert.equal(context.projects.length, 1)
  assert.equal(context.charges.length, 1); assert.equal(context.quotes.length, 1)
  const serialized = JSON.stringify(context)
  for (const marker of ["private-", "CLIENTE B", "PROJETO B", "OTHER CLIENT", "rascunho"]) assert.equal(serialized.includes(marker), false)
})
test("dados de contato ambíguo ou desconhecido não são liberados", () => {
  const duplicate = row("clients", "duplicate", { ...client.data, id: "duplicate" })
  const ambiguous = matchContact(contactIdentity(client.data.whatsapp), [...records, duplicate])
  assert.equal(ambiguous.status, "ambiguous")
  for (const match of [ambiguous, { status: "unknown" }]) {
    const context = buildCustomerContext(match, records, permissions)
    assert.equal(context.customer, null); assert.equal(context.projects.length, 0); assert.equal(context.charges.length, 0); assert.equal(context.handoffRequired, true)
  }
})
test("desativar uma categoria remove seus dados; não libera propostas de outro cliente por lead", () => {
  const context = buildCustomerContext(matchContact(contactIdentity(client.data.whatsapp), records), records, { ...permissions, projects: false, billing: false, quotes: false })
  for (const key of ["projects", "charges", "subscriptions", "invoices", "quotes"]) assert.deepEqual(context[key], [])
  const leadOnly = buildCustomerContext({ status: "matched", client: null, leads: [lead.data] }, records, permissions)
  assert.equal(leadOnly.quotes.length, 0)
})
test("pagamento só usa HTTPS do provedor e request não aceita filtros de outro cliente", () => {
  for (const value of ["javascript:alert(1)", "https://asaas.com.evil.example", "https://user:pass@asaas.com", "http://asaas.com", "https://example.com"]) assert.equal(safePaymentUrl(value), null)
  assert.ok(safePaymentUrl("https://www.asaas.com/i/fixture"))
  assert.equal(contextRequestSchema.safeParse({ chatId: "5571999999999", clientId: "other-client" }).success, false)
})
