import { test } from "node:test"
import assert from "node:assert/strict"
import { build } from "esbuild"
import { mkdir } from "node:fs/promises"
import { pathToFileURL } from "node:url"
import path from "node:path"

const dir = path.resolve(".next/session-bootstrap-test")
await mkdir(dir, { recursive: true })
const outfile = path.join(dir, "store.mjs")
const values = new Map([["solidtech-ui", JSON.stringify({ state: { role: "admin", density: "compacta", period: "mes" }, version: 0 })]])
const originalStorage = Object.getOwnPropertyDescriptor(globalThis, "localStorage")
const originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window")
Object.defineProperty(globalThis, "localStorage", { configurable: true, value: { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) } })
Object.defineProperty(globalThis, "window", { configurable: true, value: { localStorage: globalThis.localStorage } })
const fixtures = {
  "@/lib/auth/user-actions": "export async function getCrmIdentity(){return globalThis.__bootstrapFixture.identity()}",
  "@/lib/data/api": "export async function getDatabase(){return globalThis.__bootstrapFixture.database()}",
}
await build({ stdin: { contents: 'export {useCrmStore} from "./lib/store/crm-store"; export {useUiStore} from "./lib/store/ui-store"', resolveDir: process.cwd() }, outfile, bundle: true, platform: "node", format: "esm", packages: "external", logLevel: "silent", plugins: [{ name: "session-fixtures", setup(plugin) {
  plugin.onResolve({ filter: /.*/ }, args => args.path in fixtures ? { path: args.path, namespace: "fixture" } : undefined)
  plugin.onLoad({ filter: /.*/, namespace: "fixture" }, args => ({ contents: fixtures[args.path], loader: "js" }))
} }] })
const { useCrmStore: store, useUiStore: ui } = await import(pathToFileURL(outfile).href)
const identity = (id, role) => ({ current: { id, role }, users: [{ id, role }] })

test("troca de sessão limpa dados anteriores, ignora respostas antigas e não recupera papel do navegador", async () => {
  try {
    ui.getState().setRole("comercial")
    // Restaura uma preferência antiga após o setRole gravar preferências atuais.
    values.set("solidtech-ui", JSON.stringify({ state: { role: "admin", density: "compacta" }, version: 0 }))
    await ui.persist.rehydrate()
    assert.equal(ui.getState().role, "comercial")
    assert.equal(ui.getState().density, "compacta")
    assert.equal("role" in JSON.parse(values.get("solidtech-ui")).state, false)

    globalThis.__bootstrapFixture = { database: async () => ({ entries: [{ id: "private-entry" }] }), identity: async () => identity("admin-a", "admin") }
    await store.getState().bootstrap()
    assert.equal(store.getState().currentUserId, "admin-a")
    let releaseOld
    globalThis.__bootstrapFixture.database = () => new Promise(resolve => { releaseOld = resolve })
    const old = store.getState().bootstrap(true)
    assert.deepEqual(store.getState().entries, [], "A carga nova deve apagar dados do usuário anterior imediatamente")
    assert.equal(store.getState().status, "loading")
    globalThis.__bootstrapFixture = { database: async () => ({ entries: [] }), identity: async () => identity("sales-b", "comercial") }
    await store.getState().bootstrap(true)
    releaseOld({ entries: [{ id: "stale-entry" }] })
    await old
    assert.equal(store.getState().currentUserId, "sales-b")
    assert.equal(ui.getState().role, "comercial")
    assert.deepEqual(store.getState().entries, [])
    globalThis.__bootstrapFixture.database = async () => { throw Error("Sessão expirada") }
    await store.getState().bootstrap(true)
    assert.equal(store.getState().status, "error")
    assert.equal(store.getState().currentUserId, "")
    assert.deepEqual(store.getState().entries, [])
  } finally {
    delete globalThis.__bootstrapFixture
    if (originalStorage) Object.defineProperty(globalThis, "localStorage", originalStorage)
    else delete globalThis.localStorage
    if (originalWindow) Object.defineProperty(globalThis, "window", originalWindow)
    else delete globalThis.window
  }
})
