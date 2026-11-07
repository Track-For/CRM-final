import { config } from "dotenv"
import postgres from "postgres"
import { build } from "esbuild"
import { mkdir } from "node:fs/promises"
import { randomBytes } from "node:crypto"
import assert from "node:assert/strict"
import { pathToFileURL } from "node:url"
import path from "node:path"

config({ path: ".env.local", quiet: true })
const original = process.env.DATABASE_URL
assert.ok(["localhost", "127.0.0.1"].includes(new URL(original).hostname), "Teste restrito ao banco local")
const base = postgres(original, { max: 1, onnotice: () => {} })
const schema = `asaas_out_test_${randomBytes(6).toString("hex")}`
const url = new URL(original); url.searchParams.set("search_path", schema)
const sql = postgres(url.toString(), { max: 1 })
const originalFetch = globalThis.fetch
let api, customerPosts = 0, paymentPosts = 0, notificationPuts = 0
let uncertainPayment = false, missingPayment = false, missingNotification = false, uncertainCustomer = false
const customers = new Map(), payments = new Map(), notifications = new Map()
try {
  await base.unsafe(`create schema "${schema}"`)
  for (const table of ["users", "crm_records", "billing_settings", "boletos", "gateway_events"]) await base.unsafe(`create table "${schema}"."${table}" (like public."${table}" including all)`)
  await sql`insert into users(id,name,email,password_hash,role) values ('test-user','Teste','test@example.invalid','disabled','admin')`
  const dir = path.resolve(".next/local-asaas-outbound"); await mkdir(dir, { recursive: true })
  const outfile = path.join(dir, "actions.mjs")
  await build({ stdin: { contents: 'export { saveClientAndSyncAsaasAction } from "./lib/boleto/customer-actions"; export { issueBoletoAction } from "./lib/boleto/actions"; export { encryptSecret } from "./lib/fiscal/crypto"; import { db } from "./lib/db"; export async function closeDatabase(){await db.$client.end()}', resolveDir: process.cwd(), sourcefile: "asaas-outbound-check.ts" }, outfile, bundle: true, platform: "node", format: "esm", packages: "external", logLevel: "silent", plugins: [{ name: "isolate-fiscal-scheduling", setup(plugin) {
    plugin.onResolve({ filter: /^@\/lib\/fiscal\/automatic-schedule$/ }, () => ({ path: "fiscal-schedule", namespace: "fiscal-fixture" }))
    plugin.onLoad({ filter: /.*/, namespace: "fiscal-fixture" }, () => ({ contents: "export async function schedulePaidChargeInvoice(){}", loader: "js" }))
  } }, { name: "fixture-auth", setup(plugin) {
    plugin.onResolve({ filter: /^@\/lib\/auth\/session$/ }, () => ({ path: "auth", namespace: "fixture" }))
    plugin.onResolve({ filter: /^next\/cache$/ }, () => ({ path: "cache", namespace: "fixture" }))
    plugin.onLoad({ filter: /.*/, namespace: "fixture" }, args => ({ contents: args.path === "auth" ? 'export async function getCurrentUser(){return {id:"test-user",role:process.env.ASAAS_OUTBOUND_ROLE || "admin"}}' : 'export function revalidatePath(){}', loader: "ts" }))
  } }] })
  process.env.DATABASE_URL = url.toString()
  api = await import(pathToFileURL(outfile).href + `?run=${Date.now()}`)
  await sql`insert into billing_settings(id,environment,api_key_encrypted) values ('default','sandbox',${api.encryptSecret("fixture-key")})`
  globalThis.fetch = async (input, options) => {
    const request = new URL(input)
    assert.equal(request.hostname, "api-sandbox.asaas.com", "Nenhuma chamada real permitida")
    const method = options.method
    const body = options.body ? JSON.parse(options.body) : undefined
    if (request.pathname === "/v3/customers" && method === "GET") return Response.json({ data: [...customers.values()].filter(c => c.cpfCnpj === request.searchParams.get("cpfCnpj")), hasMore: false })
    if (request.pathname === "/v3/customers" && method === "POST") {
      customerPosts++; assert.equal(body.notificationDisabled, false)
      const c = { id: `cus_${customerPosts}`, ...body }; customers.set(c.id, c)
      notifications.set(`not_${c.id}`, { id: `not_${c.id}`, event: "PAYMENT_CREATED", enabled: false })
      if (uncertainCustomer) return Response.json({ errors: [{ description: "Cadastro com resposta incerta" }] }, { status: 504 })
      return Response.json(c)
    }
    const customerMatch = request.pathname.match(/^\/v3\/customers\/(cus_\d+)$/)
    if (customerMatch) { const c = customers.get(customerMatch[1]); if (method === "PUT") Object.assign(c, body); return Response.json(c) }
    const notificationMatch = request.pathname.match(/^\/v3\/customers\/(cus_\d+)\/notifications$/)
    if (notificationMatch) return Response.json({ data: missingNotification ? [] : [notifications.get(`not_${notificationMatch[1]}`)] })
    if (request.pathname.startsWith("/v3/notifications/") && method === "PUT") {
      notificationPuts++; const notification = notifications.get(request.pathname.split("/").at(-1)); Object.assign(notification, body); return Response.json(notification)
    }
    if (request.pathname === "/v3/payments" && method === "GET") return Response.json({ data: [...payments.values()].filter(p => p.externalReference === request.searchParams.get("externalReference")) })
    if (request.pathname === "/v3/payments" && method === "POST") {
      paymentPosts++
      const customer = customers.get(body.customer), notification = notifications.get(`not_${body.customer}`)
      assert.equal(customer.notificationDisabled, false)
      assert.equal(notification.enabled, true)
      assert.ok(notification.emailEnabledForCustomer || notification.smsEnabledForCustomer)
      const payment = { id: `pay_${paymentPosts}`, ...body, status: "PENDING", invoiceUrl: `https://sandbox.asaas.com/i/${paymentPosts}` }
      if (!missingPayment) payments.set(payment.id, payment)
      if (uncertainPayment || missingPayment) return Response.json({ errors: [{ description: "Teste de resposta incerta" }] }, { status: 504 })
      return Response.json(payment)
    }
    throw new Error(`Requisição inesperada ${method} ${request.pathname}`)
  }
  const client = { id: "client-test", name: "Empresa teste", legalName: "Cliente teste", document: "11111111111", email: "fixture@example.invalid", whatsapp: "11999999999", contactName: "Cliente teste", documentType: "cpf", ownerId: "test-user", status: "ativo", createdAt: "2026-11-06T15:00:00Z", address: { zip: "01001000", street: "Rua teste", number: "1", district: "Centro", city: "São Paulo", state: "SP" } }
  let result = await api.saveClientAndSyncAsaasAction(client); assert.equal(result.ok, true)
  assert.equal((await api.saveClientAndSyncAsaasAction(client)).ok, true); assert.equal(customerPosts, 1)
  const make = id => ({ charge: { id, clientId: client.id, number: id, description: "Projeto teste", amount: 100, method: "asaas", status: "pendente", dueDate: "2099-01-21T15:00:00Z", installment: 1, installments: 1, createdAt: new Date().toISOString(), digitableLine: "", barcode: "", pixCode: "" }, entry: { id: `ent_${id}`, clientId: client.id, chargeId: id, type: "receita", status: "pendente", description: "Teste", categoryId: "fc_projetos", amount: 100, competenceDate: "2099-01-21T15:00:00Z", dueDate: "2099-01-21T15:00:00Z" }, payer: { name: client.legalName, cpfCnpj: client.document, email: client.email, phone: client.whatsapp } })
  result = await api.issueBoletoAction(make("charge-test")); assert.equal(result.ok, true, result.error); assert.equal(paymentPosts, 1)
  assert.equal([...payments.values()][0].billingType, "UNDEFINED")
  assert.equal((await api.issueBoletoAction(make("charge-test"))).ok, true); assert.equal(paymentPosts, 1)
  const concurrent = await Promise.all([api.issueBoletoAction(make("concurrent")), api.issueBoletoAction(make("concurrent"))]); assert(concurrent.some(item => item.ok)); assert.equal(paymentPosts, 2)
  missingNotification = true; assert.equal((await api.issueBoletoAction(make("no-notification"))).ok, false); assert.equal(paymentPosts, 2)
  missingNotification = false; assert.equal((await api.issueBoletoAction(make("no-notification"))).ok, true); assert.equal(paymentPosts, 3)
  uncertainPayment = true; assert.equal((await api.issueBoletoAction(make("uncertain"))).ok, false); assert.equal(paymentPosts, 4)
  uncertainPayment = false; assert.equal((await api.issueBoletoAction(make("uncertain"))).ok, true); assert.equal(paymentPosts, 4)
  missingPayment = true; assert.equal((await api.issueBoletoAction(make("unconfirmed"))).ok, false); assert.equal(paymentPosts, 5)
  missingPayment = false; assert.equal((await api.issueBoletoAction(make("unconfirmed"))).ok, false); assert.equal(paymentPosts, 5)
  process.env.ASAAS_OUTBOUND_ROLE = "comercial"; assert.equal((await api.issueBoletoAction(make("no-permission"))).ok, false); assert.equal(paymentPosts, 5)
  const charges = await sql`select data from crm_records where resource='charges'`
  assert.equal(charges.length, 4)
  assert(charges.every(row => row.data.status === "pendente" && row.data.gatewayId))
  assert.ok(notificationPuts >= 4)
  process.env.ASAAS_OUTBOUND_ROLE = "admin"
  const smsClient = { ...client, id: "sms-client", document: "22222222222", email: "" }
  const smsResult = await api.saveClientAndSyncAsaasAction(smsClient); assert.equal(smsResult.ok, true)
  const smsInput = make("sms-charge"); smsInput.charge.clientId = smsClient.id; smsInput.entry.clientId = smsClient.id; smsInput.payer.email = undefined; smsInput.payer.cpfCnpj = smsClient.document
  const smsCharge = await api.issueBoletoAction(smsInput); assert.equal(smsCharge.ok, true, smsCharge.error)
  assert.equal(notifications.get(`not_${smsResult.client.asaasCustomerId}`).smsEnabledForCustomer, true)
  const beforeCustomerRetry = customerPosts
  uncertainCustomer = true
  const retryClient = { ...client, id: "retry-client", document: "33333333333" }
  assert.equal((await api.saveClientAndSyncAsaasAction(retryClient)).ok, false)
  uncertainCustomer = false
  assert.equal((await api.saveClientAndSyncAsaasAction(retryClient)).ok, true)
  assert.equal(customerPosts, beforeCustomerRetry + 1)
  const paidInput = make("manual-paid"); paidInput.charge.status = "pago"
  const beforePaidAttempt = paymentPosts
  assert.equal((await api.issueBoletoAction(paidInput)).ok, false)
  assert.equal(paymentPosts, beforePaidAttempt)
  console.log("Cadastro reutilizado; fatura UNDEFINED; envio por e-mail e SMS; pagamento não presumido; clique duplo e resposta incerta sem duplicar; autorização: OK")
} finally {
  globalThis.fetch = originalFetch
  if (api) await api.closeDatabase()
  await sql.end()
  await base.unsafe(`drop schema if exists "${schema}" cascade`)
  await base.end()
}
