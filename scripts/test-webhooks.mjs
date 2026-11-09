import { test } from "node:test"
import assert from "node:assert/strict"
import { createHmac } from "node:crypto"
import { build } from "esbuild"
import { mkdir } from "node:fs/promises"
import { pathToFileURL } from "node:url"
import path from "node:path"

const dir = path.resolve(".next/webhook-unit"); await mkdir(dir, { recursive: true })
const outfile = path.join(dir, "transport.mjs")
await build({ stdin: { contents: 'export { deliverWebhook } from "./lib/integrations/webhooks"', resolveDir: process.cwd() }, outfile, bundle: true, platform: "node", format: "esm", packages: "external", logLevel: "silent", plugins: [{ name: "transport-fixture", setup(plugin) {
  plugin.onResolve({ filter: /^(node:dns\/promises|node:https|@\/lib\/db)$/ }, args => ({ path: args.path, namespace: "fixture" }))
  plugin.onLoad({ filter: /.*/, namespace: "fixture" }, args => ({ contents: args.path === "node:dns/promises" ? 'export async function lookup(){return [{address:globalThis.fixtureAddress||"8.8.8.8",family:4}]}' : args.path === "@/lib/db" ? 'export const db={}; export const crmRecords={}; export const users={};' : `import {EventEmitter} from "node:events";
    export function request(url, options, callback){
      const req=new EventEmitter(); req.setTimeout=()=>req; req.destroy=error=>req.emit("error",error);
      req.end=body=>{globalThis.fixtureSent={url:String(url),options,body}; globalThis.fixtureCalls=(globalThis.fixtureCalls||0)+1;
        options.lookup(url.hostname,{},(error,address,family)=>{if(error) req.emit("error",error); else if(address!==globalThis.fixtureAddress && address!=="8.8.8.8") req.emit("error",Error("DNS não fixado")); else {if(family!==options.family) req.emit("error",Error("Família inconsistente")); else callback({statusCode:globalThis.fixtureStatus||204,destroy(){}})}})
      };return req;
    }`, loader: "ts" }))
} }] })
const { deliverWebhook } = await import(pathToFileURL(outfile).href)
const webhook = { id: "fixture", url: "https://hooks.example.com/path", event: "lead.created", secret: "fixture-secret-long", active: true }
test("entrega fixa DNS e assina exatamente o corpo enviado", async () => {
  const result = await deliverWebhook(webhook, "lead.created", { id: "lead-fixture" }, "delivery-fixture")
  assert.equal(result.status, 204)
  const { options, body } = globalThis.fixtureSent
  assert.equal(options.headers["X-Solid-Delivery"], "delivery-fixture")
  assert.equal(options.headers["X-Solid-Signature"], createHmac("sha256", webhook.secret).update(body).digest("hex"))
  assert.deepEqual(JSON.parse(body).data, { id: "lead-fixture" })
})
test("DNS privado bloqueia a entrega antes da conexão", async () => {
  const previous = globalThis.fixtureCalls
  globalThis.fixtureAddress = "127.0.0.1"
  await assert.rejects(deliverWebhook(webhook, webhook.event, {}))
  assert.equal(globalThis.fixtureCalls, previous)
  delete globalThis.fixtureAddress
})
test("redirecionamento não dispara uma segunda requisição", async () => {
  const before = globalThis.fixtureCalls
  globalThis.fixtureStatus = 307
  const result = await deliverWebhook(webhook, webhook.event, {})
  assert.equal(result.status, 307); assert.equal(globalThis.fixtureCalls, before + 1)
  delete globalThis.fixtureStatus
})
