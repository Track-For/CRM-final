import test from "node:test"
import assert from "node:assert/strict"
import { build } from "esbuild"
import { mkdir } from "node:fs/promises"
import { pathToFileURL } from "node:url"
import path from "node:path"
const dir = path.resolve("node_modules/.cache/receipt-tests"); await mkdir(dir, { recursive: true })
const outfile = path.join(dir, "metrics.mjs")
await build({ stdin: { contents: 'export * from "./lib/finance/receipts"; export {forecast} from "./lib/commercial/metrics"; export {computeKpis} from "./components/dashboard/metrics"; export {periodMonthBuckets,revenueByMonth} from "./lib/data/selectors"', resolveDir: process.cwd() }, outfile, bundle: true, platform: "node", format: "esm", packages: "external", logLevel: "silent" })
const api = await import(pathToFileURL(outfile).href)
const september = { from: new Date("2026-09-01T03:00:00Z"), to: new Date("2026-10-01T02:59:59.999Z") }
const november = { from: new Date("2026-11-01T03:00:00Z"), to: new Date("2026-12-01T02:59:59.999Z") }
const charge = (id, patch = {}) => ({ id, status: "pago", amount: 750, paidAt: "2026-09-18T15:00:00Z", dueDate: "2026-11-18T15:00:00Z", dealId: "d", clientId: "c", ...patch })
const entry = (id, patch = {}) => ({ id, type: "receita", status: "pago", amount: 750, paidAt: "2026-09-18T15:00:00Z", dueDate: "2026-11-18T15:00:00Z", categoryId: "fc_projetos", ...patch })
test("pagamento em setembro entra em setembro mesmo quando o negócio é ganho em novembro", () => {
  const deals = [{ id: "d", stage: "ganho", value: 1500, wonAt: "2026-11-06T15:00:00Z", ownerId: "seller", source: "site" }]
  const charges = [charge("first"), charge("last", { paidAt: "2026-09-24T15:00:00Z" }), charge("monthly", { amount: 150, subscriptionId: "s" })]
  const { receipts } = api.collectReceipts(charges, [entry("mirror", { chargeId: "first" })], deals)
  assert.equal(api.receiptTotals(api.receiptsIn(receipts, september.from, september.to)).total, 1650)
  assert.equal(api.receiptTotals(api.receiptsIn(receipts, november.from, november.to)).total, 0)
  assert.equal(api.receiptTotals(receipts).monthly, 150)
  assert.equal(receipts[0].ownerId, "seller")
  const data = { leads: [], deals, charges, subscriptions: [] }
  assert.equal(api.computeKpis(september, data).sales, 1650)
  assert.equal(api.computeKpis(november, data).sales, 0)
  assert.equal(api.computeKpis(november, data).ticket, 1500)
})
test("mensalidades contam quando pagas; parcelas abertas, canceladas ou arquivadas não contam", () => {
  const charges = [charge("monthly", { amount: 100, subscriptionId: "s" }), charge("pending", { status: "pendente" }), charge("cancelled", { status: "cancelado" }), charge("archived", { deletedAt: "2026-09-20" }), charge("reverted", { conversionReverted: true }), charge("waiting", { awaitingProjectPayment: true })]
  const { receipts } = api.collectReceipts(charges, [entry("mirror", { chargeId: "archived" })])
  assert.deepEqual(api.receiptTotals(receipts), { total: 100, monthly: 100, other: 0, count: 1, average: 100 })
})
test("não duplica cobrança e espelho; receitas avulsas entram uma vez e despesas não entram", () => {
  const charges = [charge("paid", { amount: 0.1 })]
  const entries = [entry("mirror-a", { chargeId: "paid" }), entry("mirror-b", { chargeId: "paid" }), entry("manual-monthly", { amount: 0.2, categoryId: "fc_mensalidades" }), entry("expense", { type: "despesa" })]
  assert.deepEqual(api.receiptTotals(api.collectReceipts(charges, entries).receipts), { total: 0.3, monthly: 0.2, other: 0.1, count: 2, average: 0.15 })
})
test("data ausente ou inválida não é substituída por vencimento, competência ou ganho", () => {
  const { receipts, undated } = api.collectReceipts([charge("missing", { paidAt: undefined }), charge("invalid", { paidAt: "invalid" })], [entry("no-date", { paidAt: undefined, competenceDate: "2026-09-18" })])
  assert.equal(receipts.length, 0); assert.equal(undated, 3)
})
test("gráfico realizado usa pagamento; previsto continua no vencimento", () => {
  const rows = api.revenueByMonth([entry("paid"), entry("pending", { status: "pendente", amount: 250 })], [{ ...september, label: "set/26" }, { ...november, label: "nov/26" }])
  assert.deepEqual(rows, [{ month: "set/26", realizado: 750, previsto: 0 }, { month: "nov/26", realizado: 0, previsto: 1000 }])
})

test("projeção desconta parcelas já recebidas e mantém mensalidades fora do saldo do projeto", () => {
  const deals = [{ id: "d", title: "Projeto", pipelineId: "p", stage: "negociacao", probability: 100, value: 1000, expectedCloseDate: "2026-11-20T15:00:00Z", ownerId: "seller" }]
  const { receipts } = api.collectReceipts([charge("first", { amount: 400 }), charge("monthly", { amount: 100, subscriptionId: "s", paidAt: "2026-11-10T15:00:00Z" })], [], deals)
  const result = api.forecast(deals, [], "2026-11", "", "", receipts)
  assert.equal(result.closed, 100); assert.equal(result.weighted, 600); assert.equal(result.potential, 600); assert.equal(result.projected, 700)
})

test("contratos ganhos entram integralmente pelo vencimento, sem duplicar recebimentos ou negócios abertos", () => {
  const deals = [
    { id: "d", title: "Contrato antigo", stage: "ganho", value: 2000, wonAt: "2026-09-01", ownerId: "seller", pipelineId: "p" },
    { id: "open", title: "Oportunidade", stage: "negociacao", value: 1000, probability: 60, expectedCloseDate: "2026-11-20", ownerId: "seller", pipelineId: "p" },
    { id: "other", stage: "ganho", ownerId: "other", pipelineId: "q" },
    { id: "lost", stage: "perdido" },
  ]
  const charges = [
    charge("received", { amount: 300, paidAt: "2026-11-03" }),
    ...["pendente", "vencido"].map((status, i) => charge(`due-${i}`, { status, amount: 100.01 + i, paidAt: undefined })),
    charge("december", { status: "pendente", amount: 500, dueDate: "2026-12-01T03:00:00Z" }),
    charge("boundary", { status: "pendente", amount: 50, dueDate: "2026-12-01T02:59:59Z" }),
    charge("undated", { status: "pendente", dueDate: "" }),
    charge("invalid", { status: "pendente", dueDate: "invalid" }),
    charge("monthly", { status: "pendente", subscriptionId: "s" }),
    charge("monthly-category", { status: "pendente" }),
    charge("archived", { status: "pendente", deletedAt: "archived" }),
    charge("reverted", { status: "pendente", conversionReverted: true }),
    charge("waiting", { status: "pendente", awaitingProjectPayment: true }),
    charge("cancelled", { status: "cancelado" }),
    charge("open", { status: "pendente", dealId: "open" }),
    charge("lost", { status: "pendente", dealId: "lost" }),
    charge("other", { status: "pendente", dealId: "other", amount: 42 }),
  ]
  const entries = [entry("mirror", { status: "pendente", chargeId: "due-0" }), entry("monthly-mirror", { chargeId: "monthly-category", categoryId: "fc_mensalidades" })]
  const { receipts } = api.collectReceipts(charges, entries, deals)
  const pending = api.collectContractReceivables([...charges, charges[1]], entries, deals)
  const result = api.forecast(deals, [], "2026-11", "seller", "p", receipts, undefined, pending)
  assert.equal(result.closed, 300)
  assert.equal(result.contractedReceivable, 251.02)
  assert.equal(result.weighted, 600)
  assert.equal(result.projected, 1151.02)
  assert.equal(result.potential, 1000)
  assert.equal(result.missingDueDate, 2)
  assert.deepEqual(result.receivables.map(r => r.id), ["due-0", "due-1", "boundary"])
  assert.equal(api.forecast(deals, [], "2026-12", "seller", "p", receipts, undefined, pending).contractedReceivable, 500)
  assert.equal(api.forecast(deals, [], "2026-11", "", "q", receipts, undefined, pending).contractedReceivable, 42)
  assert.equal(api.forecast(deals, [], "2026-11", "other", "p", receipts, undefined, pending).contractedReceivable, 0)
  const paidCharges = charges.map(c => ["due-0", "due-1", "boundary"].includes(c.id) ? { ...c, status: "pago", paidAt: "2026-11-21" } : c)
  const afterPayment = api.forecast(deals, [], "2026-11", "seller", "p", api.collectReceipts(paidCharges, entries, deals).receipts, undefined, api.collectContractReceivables(paidCharges, entries, deals))
  assert.equal(afterPayment.contractedReceivable, 0)
  assert.equal(afterPayment.projected, result.projected)
})

test("histórico mensal acompanha o período escolhido e inclui meses anteriores ao mês atual", () => {
  const historical = api.periodMonthBuckets({ from: new Date(2025, 0, 1), to: new Date(2025, 11, 31, 23, 59, 59) })
  assert.equal(historical.length, 12)
  assert.equal(historical[0].key, "2025-01"); assert.equal(historical[11].key, "2025-12")
  const septemberHistory = api.periodMonthBuckets({ from: new Date(2026, 8, 1), to: new Date(2026, 8, 30, 23, 59, 59) })
  assert.equal(septemberHistory.length, 6); assert.equal(septemberHistory[0].key, "2026-04"); assert.equal(septemberHistory[5].key, "2026-09")
})

test("histórico confirmado: setembro 1500, outubro 597, novembro 597 e 4 Let Homes pendente", () => {
  const charges = [
    charge("dourado-inicio", { paidAt: "2026-09-18T15:00:00Z" }),
    charge("dourado-entrega", { paidAt: "2026-09-24T15:00:00Z" }),
    charge("dourado-out", { amount: 150, subscriptionId: "dourado-monthly", paidAt: "2026-10-08T15:00:00Z" }),
    charge("moda-out", { amount: 447, subscriptionId: "moda-monthly", paidAt: "2026-10-21T15:00:00Z" }),
    charge("dourado-nov", { amount: 150, subscriptionId: "dourado-monthly", paidAt: "2026-11-06T15:00:00Z" }),
    charge("moda-nov", { amount: 447, subscriptionId: "moda-monthly", paidAt: "2026-11-03T15:00:00Z" }),
    ...[400, 600, 1000].map((amount, i) => charge(`4let-${i}`, { amount, dealId: "4let", status: "pendente", paidAt: undefined })),
  ]
  const mirrors = charges.map(c => entry(`entry-${c.id}`, { chargeId: c.id, status: c.status, amount: c.amount, paidAt: c.paidAt }))
  const { receipts } = api.collectReceipts(charges, mirrors)
  assert.equal(receipts.length, 6)
  for (const [month, total, monthly] of [["09", 1500, 0], ["10", 597, 597], ["11", 597, 597]]) {
    const start = `2026-${month}-01T03:00:00Z`
    const next = `2026-${String(Number(month) + 1).padStart(2, "0")}-01T02:59:59.999Z`
    const actual = api.receiptTotals(api.receiptsIn(receipts, start, next))
    assert.equal(actual.total, total); assert.equal(actual.monthly, monthly); assert.equal(actual.count, 2)
  }
  assert.equal(api.receiptTotals(receipts.filter(r => r.dealId === "4let")).total, 0)
})
