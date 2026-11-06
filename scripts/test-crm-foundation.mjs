import { test } from "node:test"
import assert from "node:assert/strict"
import { canUseResource, assertResourceAccess } from "../lib/data/resource-policy.ts"
import { buildFormSchema } from "../lib/forms/validation.ts"
import { webhookUrl, isPublicAddress } from "../lib/security/webhook-url.ts"
import { textPdf } from "../lib/quotes/pdf.ts"

test("papéis não podem editar financeiro, credenciais ou configurações fora das permissões", () => {
  for (const role of ["comercial", "operacao"]) for (const resource of ["charges", "entries", "subscriptions", "settings", "apiKeys", "webhooks"]) {
    assert.equal(canUseResource(role, resource, "write"), false)
    assert.throws(() => assertResourceAccess(role, resource, "write"))
  }
  for (const role of ["admin", "comercial", "operacao", "financeiro"]) for (const resource of ["users", "userInvitations", "publicFormRate", "unknown"]) assert.equal(canUseResource(role, resource, "write"), false)
  assert.equal(canUseResource("financeiro", "entries", "write"), true)
  assert.equal(canUseResource("comercial", "leads", "write"), true)
})
test("formulário valida obrigatórios, opções, e-mail, telefone e tamanho no servidor", () => {
  const schema = buildFormSchema([{ key: "name", type: "text", required: true, label: "Nome" }, { key: "email", type: "email", required: true, label: "E-mail" }, { key: "whatsapp", type: "tel", label: "Telefone" }, { key: "choice", type: "select", options: ["Site"], label: "Projeto" }])
  const value = { name: "Teste", email: "test@example.invalid", whatsapp: "(71) 99999-9999", choice: "Site" }
  assert.ok(schema.safeParse(value).success)
  for (const patch of [{ name: "" }, { email: "inválido" }, { whatsapp: "123" }, { choice: "adulterado" }, { name: "a".repeat(4001) }]) assert.equal(schema.safeParse({ ...value, ...patch }).success, false)
})
test("webhooks rejeitam rede privada, metadados, protocolos e credenciais", () => {
  for (const url of ["http://example.com", "https://127.0.0.1", "https://169.254.169.254", "https://localhost", "https://[::1]", "https://example.com:8443", "https://user:pass@example.com"]) assert.throws(() => webhookUrl(url))
  for (const address of ["10.0.0.1", "100.64.0.1", "172.16.1.1", "192.168.0.1", "::ffff:127.0.0.1", "fe80::1", "2001:db8::1", "0.0.0.0"]) assert.equal(isPublicAddress(address), false)
  assert.equal(webhookUrl("https://hooks.example.com/path").hostname, "hooks.example.com")
  assert.equal(isPublicAddress("8.8.8.8"), true)
})
test("PDF possui offsets válidos, escapa texto e pagina propostas longas", () => {
  const data = Buffer.from(textPdf(["Proposta João (teste) \\", ...Array.from({ length: 120 }, (_, i) => `Linha ${i}`)]))
  const text = data.toString("latin1")
  assert.ok(text.startsWith("%PDF-1.4")); assert.match(text, /\/Count 3/)
  assert.ok(text.includes("João \\(teste\\) \\\\"))
  const offset = Number(text.match(/startxref\n(\d+)/)[1]); assert.equal(data.subarray(offset, offset + 4).toString(), "xref")
  const entries = text.slice(offset).split("\n").slice(3).filter(line => /^\d{10} 00000 n/.test(line))
  entries.forEach((entry, index) => assert.ok(text.slice(Number(entry.slice(0, 10))).startsWith(`${index + 1} 0 obj`)))
})
