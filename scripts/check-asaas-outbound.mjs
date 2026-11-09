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
let whatsappOpen = true, whatsappUncertain = false, whatsappPosts = 0
let uncertainPayment = false, missingPayment = false, missingNotification = false, uncertainCustomer = false
const customers = new Map(), payments = new Map(), notifications = new Map()
try {
  await base.unsafe(`create schema "${schema}"`)
  for (const table of ["users", "crm_records", "billing_settings", "boletos", "gateway_events"]) await base.unsafe(`create table "${schema}"."${table}" (like public."${table}" including all)`)
  await sql`insert into users(id,name,email,password_hash,role) values ('test-user','Teste','test@example.invalid','disabled','admin')`
  const dir = path.resolve(".next/local-asaas-outbound"); await mkdir(dir, { recursive: true })
  const outfile = path.join(dir, "actions.mjs")
  await build({ stdin: { contents: 'export { saveClientAndSyncAsaasAction } from "./lib/boleto/customer-actions"; export { issueBoletoAction, quoteAsaasCardAction } from "./lib/boleto/actions"; export { projectReceivables } from "./lib/data/project-receivables"; export { createDirectPixCharge, sendChargeWhatsapp } from "./lib/finance/charge-actions"; export { encryptSecret } from "./lib/fiscal/crypto"; import { db } from "./lib/db"; export async function closeDatabase(){await db.$client.end()}', resolveDir: process.cwd(), sourcefile: "asaas-outbound-check.ts" }, outfile, bundle: true, platform: "node", format: "esm", packages: "external", logLevel: "silent", plugins: [{ name: "isolate-fiscal-scheduling", setup(plugin) {
    plugin.onResolve({ filter: /^@\/lib\/whatsapp\/storage$/ }, () => ({ path: "whatsapp-storage", namespace: "fiscal-fixture" }))
    plugin.onResolve({ filter: /^@\/lib\/fiscal\/automatic-schedule$/ }, () => ({ path: "fiscal-schedule", namespace: "fiscal-fixture" }))
    plugin.onLoad({ filter: /.*/, namespace: "fiscal-fixture" }, args => ({ contents: args.path === "whatsapp-storage" ? "export async function storeMessages(){}" : "export async function schedulePaidChargeInvoice(){}", loader: "js" }))
  } }, { name: "fixture-auth", setup(plugin) {
    plugin.onResolve({ filter: /^@\/lib\/auth\/session$/ }, () => ({ path: "auth", namespace: "fixture" }))
    plugin.onResolve({ filter: /^next\/cache$/ }, () => ({ path: "cache", namespace: "fixture" }))
    plugin.onLoad({ filter: /.*/, namespace: "fixture" }, args => ({ contents: args.path === "auth" ? 'export async function getCurrentUser(){return {id:"test-user",role:process.env.ASAAS_OUTBOUND_ROLE || "admin"}}' : 'export function revalidatePath(){}', loader: "ts" }))
  } }] })
  process.env.DATABASE_URL = url.toString()
  api = await import(pathToFileURL(outfile).href + `?run=${Date.now()}`)
  await sql`insert into billing_settings(id,environment,api_key_encrypted) values ('default','sandbox',${api.encryptSecret("fixture-key")})`
  process.env.EVOLUTION_URL = "https://whatsapp-fixture.invalid"
  process.env.EVOLUTION_API_KEY = "fixture"
  globalThis.fetch = async (input, options) => {
    const request = new URL(input)
    if (request.hostname === "whatsapp-fixture.invalid") {
      if (request.pathname.startsWith("/instance/connectionState/")) return Response.json({ instance: { state: whatsappOpen ? "open" : "close" } })
      assert.ok(request.pathname.startsWith("/message/sendText/"))
      whatsappPosts++
      const sent = JSON.parse(options.body)
      assert.equal(sent.number, "5511999999999")
      assert.ok(!sent.text.includes("{{link_pagamento}}"))
      if (whatsappUncertain) return Response.json({}, { status: 504 })
      return Response.json({ key: { id: `msg_${whatsappPosts}`, fromMe: true, remoteJid: `${sent.number}@s.whatsapp.net` } })
    }
    assert.equal(request.hostname, "api-sandbox.asaas.com", "Nenhuma chamada real permitida")
    const method = options.method
    const body = options.body ? JSON.parse(options.body) : undefined
    if (request.pathname === "/v3/payments/simulate" && method === "POST") {
      assert.deepEqual(body.billingTypes, ["CREDIT_CARD"])
      return Response.json({ value: body.value, creditCard: { netValue: Math.round((body.value * 0.95 - 0.49) * 100) / 100, feePercentage: 5, operationFee: 0.49 } })
    }
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
    if (request.pathname.startsWith("/v3/installments/")) return Response.json({ data: [...payments.values()].filter(p => p.installment === request.pathname.split("/")[3]), hasMore: false })
    if (/^\/v3\/payments\/pay_.*\/identificationField$/.test(request.pathname)) return Response.json({ identificationField: "fixture-line", barCode: "fixture-barcode" })
    if (/^\/v3\/payments\/pay_/.test(request.pathname)) return Response.json(payments.get(request.pathname.split("/").at(-1)))
    if (request.pathname === "/v3/payments" && method === "POST") {
      paymentPosts++
      const customer = customers.get(body.customer), notification = notifications.get(`not_${body.customer}`)
      assert.equal(customer.notificationDisabled, false)
      assert.equal(notification.enabled, true)
      assert.ok(notification.emailEnabledForCustomer || notification.smsEnabledForCustomer)
      if (body.installmentCount) {
        assert.equal(body.value, undefined)
        const cents = Math.round(body.totalValue * 100), per = Math.round(cents / body.installmentCount)
        const group = Array.from({ length: body.installmentCount }, (_, i) => ({ id: `pay_${paymentPosts}_${i + 1}`, ...body, value: (i === body.installmentCount - 1 ? cents - per * i : per) / 100, installment: `ins_${paymentPosts}`, installmentNumber: i + 1, dueDate: `2099-${String(i + 1).padStart(2, "0")}-21`, status: "PENDING", invoiceUrl: `https://sandbox.asaas.com/i/${paymentPosts}/${i + 1}` }))
        for (const payment of group) payments.set(payment.id, payment)
        if (uncertainPayment) return Response.json({}, { status: 504 })
        return Response.json(group[0])
      }
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
  const native = make("native-installments")
  native.charge.method = "cartao"
  native.installmentPlan = { baseAmount: 100, surchargePercent: 10, count: 3 }
  const nativeResult = await api.issueBoletoAction(native)
  assert.equal(nativeResult.ok, true, nativeResult.error)
  assert.deepEqual(nativeResult.charges.map(c => c.amount), [36.67, 36.67, 36.66])
  assert.equal(nativeResult.charges.reduce((sum,c) => sum + Math.round(c.amount * 100), 0), 11000)
  assert.equal(new Set(nativeResult.charges.map(c => c.gatewayInstallmentId)).size, 1)
  assert(nativeResult.charges.every(c => c.status === "pendente" && !c.paidAt && c.method === "cartao"))
  assert.equal(nativeResult.entries[1].dueDate.slice(0,10), "2099-02-21")
  const beforeNativeRetry = paymentPosts
  assert.equal((await api.issueBoletoAction(native)).ok, true)
  assert.equal(paymentPosts, beforeNativeRetry)
  assert.equal((await api.issueBoletoAction({ ...native, installmentPlan: { ...native.installmentPlan, count: 2 } })).ok, false)
  uncertainPayment = true
  const nativeUncertain = { ...make("native-uncertain"), installmentPlan: { baseAmount: 447, surchargePercent: 0, count: 2 } }
  assert.equal((await api.issueBoletoAction(nativeUncertain)).ok, false)
  const beforeUncertainRetry = paymentPosts
  uncertainPayment = false
  assert.equal((await api.issueBoletoAction(nativeUncertain)).ok, true)
  assert.equal(paymentPosts, beforeUncertainRetry)
  await sql`insert into crm_records(resource,id,data,created) values ('settings','company',${sql.json({ company: { pixKey: "fixture-pix" } })},true)`
  const pixInput = { id: "direct-pix", clientId: client.id, description: "Pix teste", dueDate: "2099-01-21", terms: { baseAmount: 100, surchargePercent: 0, count: 3 } }
  const [pix, pixRepeat] = await Promise.all([api.createDirectPixCharge(pixInput), api.createDirectPixCharge(pixInput)])
  assert.equal(pix.charges.length, 3); assert.equal(pixRepeat.charges.length, 3)
  assert.equal(pix.charges[0].pixKey, "fixture-pix")
  assert.equal((await sql`select * from crm_records where resource='charges' and data->>'paymentChannel'='pix'`).length, 3)
  assert.equal(paymentPosts, beforeUncertainRetry, "Pix direto não chama Asaas")
  const [sentA, sentB] = await Promise.all([api.sendChargeWhatsapp("native-installments", "Pague: {{link_pagamento}}"), api.sendChargeWhatsapp("native-installments", "Pague: {{link_pagamento}}")])
  assert(sentA.ok || sentB.ok, JSON.stringify([sentA, sentB])); assert.equal(whatsappPosts, 1, "Envio concorrente não duplica")
  whatsappOpen = false
  await assert.rejects(api.sendChargeWhatsapp(pix.charges[0].id, "Pix fixture"), /desconectado/)
  assert.equal(whatsappPosts, 1)
  whatsappOpen = true; whatsappUncertain = true
  assert.equal((await api.sendChargeWhatsapp(pix.charges[0].id, "Pix fixture")).ok, false)
  const beforeWhatsappRetry = whatsappPosts
  whatsappUncertain = false
  assert.equal((await api.sendChargeWhatsapp(pix.charges[0].id, "Pix fixture")).ok, false)
  assert.equal(whatsappPosts, beforeWhatsappRetry, "Envio incerto exige conferência, sem novo disparo")
  const cardTerms = await api.quoteAsaasCardAction(100, 3)
  assert.equal(cardTerms.cardFeeMode, "asaas")
  const withFees = { ...make("card-with-fees"), installmentPlan: cardTerms }
  withFees.charge.method = "cartao"
  const feeResult = await api.issueBoletoAction(withFees)
  assert.equal(feeResult.ok, true, feeResult.error)
  const chargedCents = feeResult.charges.reduce((sum, c) => sum + Math.round(c.amount * 100), 0)
  assert(chargedCents > 10000)
  assert(Math.round(chargedCents * 0.95 - 49) >= 10000, "Repasse preserva o valor líquido usando a simulação real da conta")
  const beforeFeeRetry = paymentPosts
  assert.equal((await api.issueBoletoAction(withFees)).ok, true)
  assert.equal(paymentPosts, beforeFeeRetry)
  const changedFees = { ...withFees, ...make("card-tampered-fees"), installmentPlan: { ...cardTerms, surchargePercent: 0 } }
  changedFees.charge.method = "cartao"
  assert.equal((await api.issueBoletoAction(changedFees)).ok, false)
  assert.equal(paymentPosts, beforeFeeRetry, "Taxas divergentes bloqueiam a emissão")
  const withoutFees = { ...make("card-without-fees"), installmentPlan: { baseAmount: 100, surchargePercent: 0, count: 3, cardFeeMode: "none" } }
  withoutFees.charge.method = "cartao"
  const noFeeResult = await api.issueBoletoAction(withoutFees)
  assert.equal(noFeeResult.ok, true, noFeeResult.error)
  assert.equal(noFeeResult.charges.reduce((sum, c) => sum + Math.round(c.amount * 100), 0), 10000)
  for (const [method, billingType] of [["asaas", "UNDEFINED"], ["pix", "PIX"], ["boleto", "BOLETO"], ["cartao", "CREDIT_CARD"]]) {
    const deal = { id: `project-${method}`, title: "Projeto com parcelas", stage: "ganho", value: 100, clientId: client.id, wonAt: "2099-01-01", paymentPlan: { method, paymentChannel: "asaas", pixKey: "", milestones: [{ id: "delivery", label: "Entrega", amount: 100, percent: 100, dueDate: "2099-01-21", installments: 3 }] } }
    const { charge, entry } = api.projectReceivables(deal, []).records[0]
    const issued = await api.issueBoletoAction({ charge, entry, installmentPlan: charge.paymentTerms, payer: make("unused").payer })
    assert.equal(issued.ok, true, issued.error)
    assert.equal(issued.charges.length, 3)
    assert.equal(payments.get(issued.charge.gatewayId).billingType, billingType)
    assert.equal(issued.charges.reduce((sum, item) => sum + Math.round(item.amount * 100), 0), 10000)
    assert(issued.charges.every(item => item.milestoneId === "delivery" && item.paymentChannel === "asaas"))
    assert.equal(api.projectReceivables(deal, issued.charges).records.length, 0, "Recarga preserva as parcelas nativas emitidas")
    const beforeRetry = paymentPosts
    assert.equal((await api.issueBoletoAction({ charge, entry, installmentPlan: charge.paymentTerms, payer: make("unused").payer })).ok, true)
    assert.equal(paymentPosts, beforeRetry, "Repetição da etapa não duplica o parcelamento")
  }
  for (const [kind, document] of [["cpf", "444.444.444-44"], ["cnpj", "44.444.444/0001-44"]]) {
    const digits = document.replace(/\D/g, "")
    const beforeCreation = customerPosts
    let remoteId
    for (const suffix of ["new", "reuse"]) {
      const localClient = { ...client, id: `issue-${kind}-${suffix}`, document }
      await sql`insert into crm_records(resource,id,data) values ('clients',${localClient.id},${sql.json(localClient)})`
      const input = make(`charge-${kind}-${suffix}`)
      input.charge.clientId = localClient.id
      input.entry.clientId = localClient.id
      input.payer.cpfCnpj = document
      const issued = await api.issueBoletoAction(input)
      assert.equal(issued.ok, true, issued.error)
      assert.equal(customerPosts, beforeCreation + 1, `${kind}: criar apenas quando o documento não existe`)
      const [saved] = await sql`select data from crm_records where resource='clients' and id=${localClient.id}`
      assert.equal(saved.data.asaasEnvironment, "sandbox")
      remoteId ||= saved.data.asaasCustomerId
      assert.equal(saved.data.asaasCustomerId, remoteId, `${kind}: reutilizar cliente pelo documento, mesmo sem vínculo local prévio`)
      assert.equal(customers.get(remoteId).cpfCnpj, digits)
      assert.equal(payments.get(issued.charge.gatewayId).customer, remoteId)
    }
  }
  process.env.ASAAS_OUTBOUND_ROLE = "comercial"
  await assert.rejects(api.createDirectPixCharge({ ...pixInput, id: "forbidden" }), /permissão/)
  await assert.rejects(api.sendChargeWhatsapp("native-installments", "Mensagem"), /permissão/)
  console.log("Pix direto; parcelamento nativo; acréscimo; arredondamento; recuperação; WhatsApp com link real; concorrência e resposta incerta sem duplicar: OK")
  console.log("Cadastro reutilizado; fatura UNDEFINED; envio por e-mail e SMS; pagamento não presumido; clique duplo e resposta incerta sem duplicar; autorização: OK")
} finally {
  globalThis.fetch = originalFetch
  if (api) await api.closeDatabase()
  await sql.end()
  await base.unsafe(`drop schema if exists "${schema}" cascade`)
  await base.end()
}
