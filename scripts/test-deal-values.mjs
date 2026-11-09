import { test } from "node:test"
import assert from "node:assert/strict"
import { dealValuesSchema } from "../lib/data/deal-values.ts"
import { monthlyForecastChanges, subscriptionForDeal } from "../lib/data/deal-subscription.ts"
import { projectReceivables } from "../lib/data/project-receivables.ts"
import { dealDateInput, dealDateSchema, dealDateToIso, todayDealDate } from "../lib/data/deal-dates.ts"

test("projeto e manutenção aceitam zero e rejeitam valores negativos ou inválidos", () => {
  for (const values of [{ value: 0, monthlyFee: 0 }, { value: 0, monthlyFee: 100 }, { value: 100, monthlyFee: 0 }]) assert.ok(dealValuesSchema.safeParse(values).success)
  for (const amount of [-1, NaN, Infinity]) {
    assert.equal(dealValuesSchema.safeParse({ value: amount, monthlyFee: 0 }).success, false)
    assert.equal(dealValuesSchema.safeParse({ value: 0, monthlyFee: amount }).success, false)
  }
})
const deal = { id: "zero-project", stage: "ganho", clientId: "client", title: "Projeto gratuito", value: 0, monthlyFee: 0, wonAt: "2026-11-06T15:00:00.000Z", stageChangedAt: "2026-11-06T15:00:00.000Z", paymentPlan: { method: "pix", milestones: [] } }
test("datas de negócio respeitam o calendário e o dia em São Paulo", () => {
  assert(dealDateSchema.safeParse(todayDealDate()).success)
  assert.equal(dealDateToIso("2026-10-20"), "2026-10-20T15:00:00.000Z")
  assert.equal(dealDateInput("2026-11-01T02:59:00Z"), "2026-10-31")
  assert.equal(dealDateInput(dealDateToIso("2026-10-20")), "2026-10-20")
  for (const value of ["", "invalid", "2026-02-30", "2026-13-01"]) assert.throws(() => dealDateToIso(value))
  assert.equal(dealDateInput(""), "")
  assert.equal(dealDateInput("invalid"), "")
})
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

test("previsões preservam o vencimento corrigido manualmente", () => {
  const dueDate = "2026-10-21T15:00:00.000Z"
  const project = { ...deal, value: 750, paymentPlan: { method: "pix", milestones: [{ id: "delivery", label: "Entrega", amount: 750, dueDate: "2026-11-24" }] } }
  const charge = { id: "edited", dealId: deal.id, milestoneId: "delivery", status: "pendente", automatic: true, dueDate, dueDateOverridden: true }
  const forecast = projectReceivables(project, [charge]).records[0]
  assert.equal(forecast.charge.dueDate, dueDate)
  assert.equal(forecast.entry.dueDate, dueDate)
  assert.equal(forecast.entry.competenceDate, dueDate)
  assert.equal(forecast.charge.dueDateOverridden, true)
  assert.equal(monthlyForecastChanges({ id: "monthly", startDate: "2026-11-09T15:00:00.000Z" }, [{ ...charge, id: "chg_first_monthly" }]), null)
})

test("plano distingue Pix direto de Pix no Asaas e preserva o parcelamento por etapa", () => {
  const project = { ...deal, value: 100, paymentPlan: { method: "pix", paymentChannel: "asaas", milestones: [{ id: "delivery", label: "Entrega", amount: 100, dueDate: "2026-11-24", installments: 3 }] } }
  const record = projectReceivables(project, []).records[0]
  assert.equal(record.charge.method, "pix")
  assert.equal(record.charge.paymentChannel, "asaas")
  assert.deepEqual(record.charge.paymentTerms, { baseAmount: 100, surchargePercent: 0, count: 3 })
  const direct = projectReceivables({ ...project, paymentPlan: { ...project.paymentPlan, paymentChannel: "pix" } }, []).records[0]
  assert.equal(direct.charge.paymentChannel, "pix")
  assert.equal(direct.charge.paymentTerms, undefined)
  assert.equal(projectReceivables({ ...project, paymentPlan: { ...project.paymentPlan, paymentChannel: undefined, method: "cartao" } }, []).records[0].charge.paymentChannel, "asaas")
})
