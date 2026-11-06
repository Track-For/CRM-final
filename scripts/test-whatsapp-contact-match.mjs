import { test } from "node:test"
import assert from "node:assert/strict"
import { matchWhatsappContact } from "../lib/whatsapp/contact-match.ts"

const lead = { id: "lead-a", name: "Pessoa A", whatsapp: "(11) 99999-9999", clientId: "client-a" }
const client = { id: "client-a", leadId: lead.id, whatsapp: "5511999999999" }
test("contexto do WhatsApp associa telefone com formatação e nono dígito", () => {
  const match = matchWhatsappContact("551199999999", [lead], [client])
  assert.equal(match.lead.id, lead.id)
  assert.equal(match.client.id, client.id)
  assert.equal(match.ambiguous, false)
})
test("cadastros duplicados não exibem contexto de uma pessoa arbitrária", () => {
  for (const match of [
    matchWhatsappContact(client.whatsapp, [lead, { ...lead, id: "lead-b" }], [client]),
    matchWhatsappContact(client.whatsapp, [lead], [client, { ...client, id: "client-b" }]),
    matchWhatsappContact(client.whatsapp, [{ ...lead, clientId: "other" }], [client]),
  ]) {
    assert.equal(match.ambiguous, true)
    assert.equal(match.lead, undefined)
    assert.equal(match.client, undefined)
  }
})
test("LID não identificado e telefone vazio não recebem dados de cadastro", () => {
  for (const phone of ["", "@", "99999999999@lid"]) {
    const match = matchWhatsappContact(phone, [{ ...lead, whatsapp: "" }], [client])
    assert.equal(match.lead, undefined)
    assert.equal(match.client, undefined)
  }
})
