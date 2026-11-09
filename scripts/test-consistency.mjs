import test from "node:test"
import assert from "node:assert/strict"
import { build } from "esbuild"
import { mkdir } from "node:fs/promises"
import { pathToFileURL } from "node:url"
import path from "node:path"
const dir = path.resolve("node_modules/.cache/consistency-tests")
await mkdir(dir, { recursive: true })
const outfile = path.join(dir, "rules.mjs")
await build({ stdin: { contents: 'export * from "./lib/data/deal-subscription";export * from "./lib/data/deal-forecast";export * from "./lib/data/selectors";export {mrrAt} from "./components/dashboard/metrics";export {forecast} from "./lib/commercial/metrics";export {stageName} from "./components/sales/utils";export * from "./lib/finance/payment-options";export * from "./lib/finance/payment-status";export * from "./lib/finance/charge-plan";', resolveDir: process.cwd() }, outfile, bundle: true, platform: "node", format: "esm", packages: "external", logLevel: "silent" })
const api = await import(pathToFileURL(outfile).href)

test("primeira mensalidade respeita o dia anunciado e não avança a cada recarga", () => {
  for (const [startDate, billingDay, expected] of [["2026-11-08",10,"2026-11-10"],["2026-11-18",10,"2026-12-10"],["2026-02-01",31,"2026-02-28"],["2028-02-01",31,"2028-02-29"]]) {
    const subscription = { id: "s", status: "ativa", amount: 100, startDate: `${startDate}T15:00:00Z`, billingDay, nextBillingDate: `${expected}T15:00:00Z` }
    const first = api.firstMonthlyReceivable(subscription, []).charge
    assert.equal(first.dueDate.slice(0,10), expected)
    const next = api.nextMonthlyBilling(subscription, [first])
    const correction = api.monthlyForecastChanges({ ...subscription, nextBillingDate: next }, [first])
    assert.equal(correction.patch.dueDate, first.dueDate)
    assert.equal(api.firstMonthlyReceivable(subscription, [first]), null)
  }
})

test("ficha, lista e previsão compartilham saldo restante e probabilidade da etapa", () => {
  const deal = { id:"d", value:1000, probability:10, pipelineId:"p", stage:"negociacao", expectedCloseDate:"2026-11-20" }
  const pipelines = [{ id:"p", stages:[{ key:"negociacao", probability:80, name:"Revisão comercial" }] }]
  const totals = { d:400 }
  assert.equal(api.weightedValue(deal, pipelines, totals), 480)
  assert.equal(api.forecast([deal],pipelines,"2026-11","","",[],totals).weighted,480)
  assert.equal(api.stageName(pipelines,"p","negociacao"),"Revisão comercial")
  assert.equal(api.stageName(pipelines,undefined,"negociacao"),"Revisão comercial")
})

test("cobrança e lançamento têm o mesmo atraso, no fuso do CRM", () => {
  const now = new Date("2026-11-09T01:00:00Z") // ainda dia 8 em São Paulo
  for (const [dueDate,status,expected] of [["2026-11-07","pendente","vencido"],["2026-11-08","pendente","pendente"],["2026-11-07","pago","pago"],["2026-11-07","cancelado","cancelado"]]) {
    const item = { dueDate, status }
    assert.equal(api.paymentStatus(item,now),expected)
    if (status !== "cancelado") assert.equal(api.entryStatusNow(item,now),expected)
  }
})

test("MRR de Financeiro e Relatórios exclui início futuro e respeita cancelamento", () => {
  const now = new Date()
  const subscriptions = [{status:"ativa",amount:100,startDate:"2000-01-01"},{status:"ativa",amount:200,startDate:"2099-01-01"},{status:"cancelada",amount:300,startDate:"2000-01-01",canceledAt:"2001-01-01"},{status:"pausada",amount:400,startDate:"2000-01-01"}]
  assert.equal(api.mrr(subscriptions),100)
  assert.equal(api.mrrAt(subscriptions,now),100)
  assert.equal(api.mrrAt(subscriptions,new Date("2000-06-01")),400)
})

test("opções de pagamento distinguem canal e forma e limitam novas propostas a 12x", () => {
  assert.equal(api.installmentLimit(24),12)
  assert.equal(api.installmentLimit(1),1)
  assert.equal(api.billingLabel({method:"pix",paymentChannel:"pix"}),"Pix direto")
  assert.equal(api.billingLabel({method:"pix",paymentChannel:"asaas"}),"Pix pelo Asaas")
  assert.equal(api.billingLabel({method:"asaas"}),"Cliente escolhe no Asaas")
  assert.equal(api.chargeTermsSchema.safeParse({baseAmount:100,surchargePercent:0,count:13}).success,false)
})

test("envio após emissão mantém total, taxas, quantidade e identificação da parcela", () => {
  const charge = { amount:35,description:"Projeto",installment:2,installments:3,dueDate:"2026-12-10",gatewayId:"pay_fixture",invoiceUrl:"https://sandbox.asaas.com/i/fixture",paymentTerms:{baseAmount:100,surchargePercent:5,count:3,cardFeeMode:"asaas"} }
  const message = api.persistedChargeMessage({charge,name:"Cliente",company:"Empresa"})
  assert.match(message,/105,00/)
  assert.match(message,/taxas do Asaas/)
  assert.match(message,/3x de/)
  assert.match(message,/Parcela 2\/3/)
  assert.match(message,/Vencimento desta parcela/)
  assert(!message.includes("{{link_pagamento}}"))
})
