import { readFile } from "node:fs/promises"
import assert from "node:assert/strict"
const origin = "http://localhost:3000"
await fetch(`${origin}/whatsapp`)
const manifest = JSON.parse(await readFile(".next/dev/server/server-reference-manifest.json", "utf8"))
async function action(name, args = []) {
  const entry = Object.entries(manifest.node).find(([, v]) => v.filename === "lib/whatsapp/actions.ts" && v.exportedName === name)
  assert.ok(entry, `Action ${name} disponível`)
  const response = await fetch(`${origin}/whatsapp`, { method: "POST", headers: { "Next-Action": entry[0], Origin: origin, "Content-Type": "text/plain;charset=UTF-8" }, body: JSON.stringify(args) })
  const result = await response.text()
  assert.equal(response.status, 200)
  const index = result.lastIndexOf("1:{")
  const line = index >= 0 ? result.slice(index).split("\n")[0] : result.split("\n").find(l => l.startsWith("1:E"))
  if (!line || line.startsWith("1:E")) {
    const error = line?.startsWith("1:E") ? JSON.parse(line.slice(3)).message : "Resposta inesperada"
    console.log("Registros da resposta:", result.split("\n").map(l => l.match(/^[a-f0-9]+:[A-Z]?/)?.[0]).filter(Boolean).join(", "))
    throw new Error(error)
  }
  const value = JSON.parse(line.slice(2))
  if (typeof value.image === "string" && /^\$[a-f0-9]+$/.test(value.image)) {
    const marker = value.image.slice(1) + ":T"
    const start = result.indexOf(marker) + marker.length
    const comma = result.indexOf(",", start)
    const length = parseInt(result.slice(start, comma), 16)
    value.image = result.slice(comma + 1, comma + 1 + length)
  }
  return value
}
const before = await action("getWhatsappConnection")
console.log("Estado da conexão:", before.state)
assert.notEqual(before.state, "unavailable")
const result = await action("connectWhatsapp")
console.log("QR Code real retornado:", result.image?.startsWith("data:image/png;base64,") || false)
console.log("Estado após preparar conexão:", result.connection.state)
assert.ok(result.image || result.connection.state === "connecting" || result.connection.state === "open")
