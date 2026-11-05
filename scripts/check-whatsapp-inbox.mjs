import { readFile } from "node:fs/promises"
import assert from "node:assert/strict"
const origin = "http://localhost:3000"
assert.equal((await fetch(`${origin}/whatsapp`)).status, 200)
const manifest = JSON.parse(await readFile(".next/dev/server/server-reference-manifest.json", "utf8"))
async function action(name, args = []) {
  const entry = Object.entries(manifest.node).find(([, value]) => value.filename === "lib/whatsapp/actions.ts" && value.exportedName === name)
  assert.ok(entry)
  const response = await fetch(`${origin}/whatsapp`, { method: "POST", headers: { "Next-Action": entry[0], Origin: origin, "Content-Type": "text/plain;charset=UTF-8" }, body: JSON.stringify(args) })
  const text = await response.text()
  assert.equal(response.status, 200)
  const error = text.match(/(?:^|\n)1:E([^\n]+)/)
  if (error) throw new Error(JSON.parse(error[1]).message)
  const index = text.lastIndexOf("1:[")
  assert.ok(index >= 0)
  return JSON.parse(text.slice(index + 2).split("\n")[0])
}
const inbox = await action("getWhatsappInbox")
const known = inbox.find(chat => !chat.unresolved && chat.direction === "out")
if (known) {
  const thread = await action("getWhatsappThread", [known.phone])
  assert.ok(thread.some(message => message.direction === "out"))
  console.log("Conversa identificada: respostas enviadas disponíveis pela API da tela.")
}
const pending = inbox.find(chat => chat.unresolved && chat.direction === "out")
if (pending) {
  const thread = await action("getWhatsappThread", [pending.phone])
  assert.ok(thread.some(message => message.direction === "out"))
  console.log("Conversa sem telefone: mensagens enviadas preservadas e visíveis pela API da tela.")
}
console.log("Caixa de entrada verificada:", { conversations: inbox.length, awaitingIdentification: inbox.filter(chat => chat.unresolved).length })
