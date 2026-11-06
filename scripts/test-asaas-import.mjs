import { test } from "node:test"
import assert from "node:assert/strict"
import { matchAsaasClient, matchAsaasCharge, matchAsaasSubscription, importedReceivable, asaasSubscriptionSnapshot } from "../lib/boleto/import-normalize.ts"
import { createAsaasClient, mapAsaasStatus } from "../lib/boleto/asaas.ts"

const client = { id: "cli", name: "Empresa", document: "12.345.678/0001-90", email: "contato@example.com" }
const customer = { id: "cus", cpfCnpj: "12345678000190", email: "contato@example.com" }
const payment = { id: "pay", customer: "cus", value: 447, dueDate: "2026-11-21", status: "RECEIVED", billingType: "BOLETO", paymentDate: "2026-11-20", subscription: "sub_remote", invoiceUrl: "https://www.asaas.com/i/test" }
const subscription = { id: "sub_local", clientId: client.id, dealId: "deal", amount: 447, status: "ativa" }

test("vincula cliente por referência ou documento; não usa nome nem documento vazio", () => {
  assert.equal(matchAsaasClient(customer, [client], "producao"), client)
  assert.equal(matchAsaasClient({ id: "cus", name: "Empresa" }, [client], "producao"), undefined)
  assert.equal(matchAsaasClient(customer, [client, { ...client, id: "duplicado" }], "producao"), undefined)
  assert.equal(matchAsaasClient(customer, [client, { ...client, id: "excluido", deletedAt: "2026-01-01" }], "producao"), client)
  assert.equal(matchAsaasClient({ id: "cus", externalReference: "cli" }, [client], "producao"), client)
})
test("não associa documento conflitante por e-mail", () => {
  assert.equal(matchAsaasClient({ ...customer, cpfCnpj: "99999999000199" }, [client], "producao"), undefined)
})
test("vincula mensalidade somente quando a correspondência é única", () => {
  assert.equal(matchAsaasSubscription(payment, client, [subscription], "producao"), subscription)
  assert.equal(matchAsaasSubscription(payment, client, [subscription, { ...subscription, id: "outro" }], "producao"), undefined)
})
test("concilia previsão da mesma competência; isola meses e ambientes", () => {
  const old = { id: "chg_first_sub_local", clientId: "cli", subscriptionId: "sub_local", dueDate: "2026-11-09", amount: 447, status: "pendente", method: "asaas" }
  assert.equal(matchAsaasCharge(payment, client, [old], "producao", subscription), old)
  assert.equal(matchAsaasCharge({ ...payment, dueDate: "2026-10-21" }, client, [old], "producao", subscription), undefined)
  assert.equal(matchAsaasCharge(payment, client, [{ ...old, gatewayId: "pay", gatewayEnvironment: "sandbox" }], "producao", subscription), undefined)
})
test("Asaas fornece valor, vencimento, pagamento e link reais; preserva ID", () => {
  const record = importedReceivable(payment, client, "producao", "pago", undefined, subscription)
  assert.equal(record.charge.amount, 447)
  assert.equal(record.charge.dueDate, "2026-11-21T15:00:00.000Z")
  assert.equal(record.charge.paidAt, "2026-11-20T15:00:00.000Z")
  assert.equal(record.charge.invoiceUrl, payment.invoiceUrl)
  assert.equal(record.entry.categoryId, "fc_mensalidades")
  assert.equal(record.charge.subscriptionId, "sub_local")
  assert.equal(record.charge.dealId, "deal")
  assert.equal(record.charge.automatic, false)
  assert.equal(record.charge.pixCode, "")
  assert.equal(importedReceivable(payment, client, "producao", "pago", record.charge, subscription).charge.id, record.charge.id)
})
test("não inventa data de recebimento; cancelamento retira receita prevista", () => {
  assert.equal(importedReceivable({ ...payment, paymentDate: null }, client, "producao", "pago").charge.paidAt, undefined)
  const canceled = importedReceivable(payment, client, "producao", "cancelado")
  assert.equal(canceled.entryDeleted, true)
  assert.equal(canceled.charge.status, "cancelado")
  assert.equal(importedReceivable({ ...payment, value: NaN }, client, "producao", "pago"), null)
  assert.equal(mapAsaasStatus("RECEIVED"), "pago")
  assert.equal(mapAsaasStatus("OVERDUE"), "vencido")
})
test("consulta todas as páginas por GET sem criar cobranças", async () => {
  const original = globalThis.fetch, calls = []
  globalThis.fetch = async (url, options) => {
    assert.equal(options.method, "GET"); assert.equal(options.body, undefined)
    calls.push(new URL(url))
    return Response.json(calls.length === 1 ? { data: [{ id: "first" }], hasMore: true } : { data: [{ id: "second" }], hasMore: false })
  }
  try {
    const result = await createAsaasClient("test-key", "sandbox").listPayments()
    assert.deepEqual(result.map(item => item.id), ["first", "second"])
    assert.equal(calls[1].searchParams.get("offset"), "1")
    assert.equal(calls[0].searchParams.get("limit"), "100")
  } finally { globalThis.fetch = original }
})
test("Pix recebido fora do Asaas nunca é sobrescrito por valor e mês", () => {
  const manual = { id: "chg_first_sub_local", clientId: "cli", subscriptionId: "sub_local", dueDate: "2026-11-08", amount: 447, status: "pago", method: "pix", paidAt: "2026-11-06T15:00:00.000Z" }
  const pending = { ...payment, status: "PENDING", paymentDate: null, dueDate: "2026-11-08" }
  assert.equal(matchAsaasCharge(pending, client, [manual], "producao", subscription), undefined)
  assert.equal(matchAsaasCharge({ ...pending, externalReference: manual.id }, client, [manual], "producao", subscription), undefined)
  assert.equal(importedReceivable(pending, client, "producao", "pendente", manual, subscription), null)
  assert.notEqual(importedReceivable(pending, client, "producao", "pendente", undefined, subscription).charge.id, manual.id)
  assert.equal(manual.status, "pago")
  assert.equal(manual.paidAt, "2026-11-06T15:00:00.000Z")
})
test("cobranças Asaas pendentes não mudam a mensalidade Pix para Asaas", () => {
  const manual = { ...subscription, method: "pix", asaasSubscriptionId: "sub_remote", asaasEnvironment: "producao", billingDay: 8, nextBillingDate: "2026-11-08T15:00:00.000Z" }
  const remote = importedReceivable({ ...payment, status: "PENDING", paymentDate: null }, client, "producao", "pendente", undefined, manual).charge
  assert.equal(asaasSubscriptionSnapshot(manual, [remote], "producao"), null)
  assert.equal(manual.method, "pix"); assert.equal(manual.billingDay, 8)
})
test("mensalidade escolhida como Asaas usa o vencimento da plataforma", () => {
  const source = { ...subscription, method: "asaas", asaasSubscriptionId: "sub_remote", asaasEnvironment: "producao" }
  const snapshot = asaasSubscriptionSnapshot(source, [importedReceivable(payment, client, "producao", "pago", undefined, source).charge], "producao")
  assert.equal(snapshot.method, "asaas"); assert.equal(snapshot.billingDay, 21)
  assert.equal(snapshot.nextBillingDate, "2026-12-21T15:00:00.000Z")
})
test("fatura avulsa de mensalidade mantém a categoria de receita recorrente", () => {
  const existing = { id: "local-month", clientId: "cli", subscriptionId: "sub_local", gatewayId: "pay", gatewayEnvironment: "producao", amount: 447, dueDate: "2026-11-21T15:00:00.000Z", status: "pendente", method: "asaas", digitableLine: "", barcode: "" }
  const snapshot = importedReceivable({ ...payment, subscription: null }, client, "producao", "pago", existing)
  assert.equal(snapshot.charge.subscriptionId, "sub_local")
  assert.equal(snapshot.entry.categoryId, "fc_mensalidades")
})
