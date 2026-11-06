import { test } from "node:test"
import assert from "node:assert/strict"
import { renderMessage, unresolvedVariables, leadMessageValues } from "../lib/messages/templates.ts"
import { messageTemplateSchema } from "../lib/messages/validation.ts"
import { canUseResource } from "../lib/data/resource-policy.ts"

test("substitui variáveis repetidas sem interpretar o conteúdo do lead", () => {
  assert.equal(renderMessage("Oi {nome}, {nome}! {empresa}", { nome: "Ana {empresa}", empresa: "Acme" }), "Oi Ana {empresa}, Ana {empresa}! Acme")
})
test("dados ausentes continuam visíveis para impedir envio incompleto", () => {
  const text = renderMessage("{nome} {empresa} {valor} {valor}", { nome: "Ana", empresa: "" })
  assert.deepEqual(unresolvedVariables(text), ["{empresa}", "{valor}"])
})
test("variáveis usam os dados do lead escolhido", () => {
  const values = leadMessageValues({ name: "Ana", company: "Acme", email: "ana@example.com", whatsapp: "5511999999999", projectType: "landing_page" })
  assert.equal(renderMessage("{nome} / {empresa} / {projeto}", values), "Ana / Acme / landing page")
})
test("valida modelos e bloqueia assunto com quebra de linha", () => {
  const model = { id: "test", title: "Primeiro contato", category: "primeiro_contato", text: "Olá {nome}" }
  assert.ok(messageTemplateSchema.safeParse(model).success)
  for (const patch of [{ text: " " }, { category: "invalido" }, { subject: "Oi\r\nBcc: teste@example.com" }, { text: "x".repeat(10001) }]) assert.equal(messageTemplateSchema.safeParse({ ...model, ...patch }).success, false)
})
test("somente administração e comercial podem editar modelos", () => {
  assert.ok(canUseResource("comercial", "quickMessages", "write"))
  assert.ok(canUseResource("admin", "quickMessages", "write"))
  assert.equal(canUseResource("financeiro", "quickMessages", "write"), false)
  assert.equal(canUseResource("operacao", "quickMessages", "write"), false)
})
