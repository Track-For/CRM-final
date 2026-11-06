import { test } from "node:test"
import assert from "node:assert/strict"
import { dealValuesSchema } from "../lib/data/deal-values.ts"
import { subscriptionForDeal } from "../lib/data/deal-subscription.ts"
import { projectReceivables } from "../lib/data/project-receivables.ts"

test("projeto e manutenção aceitam zero e rejeitam valores negativos ou inválidos", () => {
  for (const values of [{ value: 0, monthlyFee: 0 }, { value: 0, monthlyFee: 100 }, { value: 100, monthlyFee: 0 }]) assert.ok(dealValuesSchema.safeParse(values).success)
  for (const amount of [-1, NaN, Infinity]) {
    assert.equal(dealValuesSchema.safeParse({ value: amount, monthlyFee: 0 }).success, false)
    assert.equal(dealValuesSchema.safeParse({ value: 0, monthlyFee: amount }).success, false)
  }
})
const deal = { id: "zero-project", stage: "ganho", clientId: "client", title: "Projeto gratuito", value: 0, monthlyFee: 0, wonAt: "2026-11-06T15:00:00.000Z", stageChangedAt: "2026-11-06T15:00:00.000Z", paymentPlan: { method: "pix", milestones: [] } }
test("projeto e manutenção zerados não criam recebíveis ou mensalidade", () => {
  assert.deepEqual(projectReceivables(deal, []).records, [])
  assert.equal(subscriptionForDeal(deal, []), null)
})
test("zerar o projeto remove apenas previsões editáveis e preserva pagamentos e emissões", () => {
  const forecast = { id: "forecast", dealId: deal.id, automatic: true, status: "pendente" }
  const paid = { ...forecast, id: "paid", status: "pago" }
  const issued = { ...forecast, id: "issued", gatewayId: "pay_existing" }
  assert.deepEqual(projectReceivables(deal, [forecast, paid, issued]).remove.map(item => item.id), ["forecast"])
})
test("manutenção paga sem valor de projeto usa o ganho como referência", () => {
  const subscription = subscriptionForDeal({ ...deal, monthlyFee: 100 }, [])
  assert.equal(subscription.status, "ativa")
  assert.equal(subscription.startDate, "2026-11-09T15:00:00.000Z")
  assert.equal(subscription.amount, 100)
  assert.equal(subscriptionForDeal({ ...deal, monthlyFee: 100, wonAt: "", stageChangedAt: "" }, []).status, "aguardando")
})
