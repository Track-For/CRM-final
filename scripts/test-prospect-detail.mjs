import test from "node:test"
import assert from "node:assert/strict"
import { build } from "esbuild"
import { mkdir } from "node:fs/promises"
import { pathToFileURL } from "node:url"
import path from "node:path"

const dir = path.resolve("node_modules/.cache/prospect-detail-tests")
await mkdir(dir, { recursive: true })
const outfile = path.join(dir, "actions.mjs")
await build({ stdin: { contents: 'export {getProspectDetail,updateProspect} from "./lib/prospecting/actions"; export {prospectUrl} from "./lib/prospecting/links"', resolveDir: process.cwd() }, outfile, bundle: true, platform: "node", format: "esm", packages: "external", logLevel: "silent", plugins: [{ name: "auth-fixture", setup(p) {
  p.onResolve({ filter: /^@\/lib\/auth\/session$/ }, () => ({ path: "auth", namespace: "fixture" }))
  p.onLoad({ filter: /.*/, namespace: "fixture" }, () => ({ contents: 'export async function requireUser(){if(!globalThis.__prospectRole)throw Error("Não autenticado");return {id:"fixture",role:globalThis.__prospectRole}}', loader: "js" }))
} }] })
const api = await import(pathToFileURL(outfile).href)

test("ficha carrega dados completos e etapas personalizadas; alterações retornam os dados persistidos", async () => {
  const originalFetch = globalThis.fetch
  globalThis.__prospectRole = "comercial"
  const calls = []
  let prospect = { id: "maps_fixture-1", nome: "Empresa de teste", instagram: "@exemplo", status: "novo", obs: "", retorno: null, historico: [{ t: 1800000000, tipo: "criado", txt: "Encontrado na busca" }] }
  const stages = [{ id: "novo", nome: "Novo" }, { id: "diagnostico", nome: "Diagnóstico" }]
  globalThis.fetch = async (url, options) => {
    const pathname = new URL(url).pathname
    calls.push({ pathname, method: options.method, body: options.body })
    if (pathname === "/api/config") return Response.json({ etapas: stages })
    assert.equal(pathname, `/api/leads/${prospect.id}`)
    if (options.method === "PATCH") prospect = { ...prospect, ...JSON.parse(options.body) }
    return Response.json(prospect)
  }
  try {
    assert.deepEqual(await api.getProspectDetail(prospect.id), { prospect, stages })
    const changes = { status: "diagnostico", obs: "Conversar sobre o site", retorno: 1800100000 }
    const updated = await api.updateProspect(prospect.id, changes)
    assert.equal(updated.status, "diagnostico"); assert.equal(updated.obs, changes.obs); assert.equal(updated.retorno, changes.retorno)
    assert.equal(calls.at(-1).method, "PATCH")
    assert.deepEqual(JSON.parse(calls.at(-1).body), changes)
    assert.deepEqual((await api.getProspectDetail(prospect.id)).prospect, updated)
    const cleared = await api.updateProspect(prospect.id, { obs: "", retorno: null })
    assert.equal(cleared.obs, ""); assert.equal(cleared.retorno, null)
    const count = calls.length
    for (const input of [{}, { nome: "não permitido" }, { obs: "x".repeat(2001) }, { retorno: -1 }]) await assert.rejects(api.updateProspect(prospect.id, input))
    await assert.rejects(api.getProspectDetail("../config"))
    assert.equal(calls.length, count)
    for (const role of ["financeiro", "operacao", null]) {
      globalThis.__prospectRole = role
      await assert.rejects(api.getProspectDetail(prospect.id))
      await assert.rejects(api.updateProspect(prospect.id, { status: "fechado" }))
    }
    assert.equal(calls.length, count, "sem permissão não acessa nem altera o motor")
    globalThis.__prospectRole = "admin"
    globalThis.fetch = async () => new Response("indisponível", { status: 503 })
    await assert.rejects(api.getProspectDetail(prospect.id), /503/)
    await assert.rejects(api.updateProspect(prospect.id, { status: "novo" }), /503/)
  } finally { globalThis.fetch = originalFetch; delete globalThis.__prospectRole }
})

test("links da coleta normalizam sites e redes sociais e rejeitam protocolos executáveis", () => {
  assert.equal(api.prospectUrl("exemplo.com.br"), "https://exemplo.com.br/")
  assert.equal(api.prospectUrl("@oticas.felipe", "instagram"), "https://instagram.com/oticas.felipe")
  assert.equal(api.prospectUrl("oticas.felipe", "facebook"), "https://facebook.com/oticas.felipe")
  assert.equal(api.prospectUrl("https://maps.google.com/?q=empresa"), "https://maps.google.com/?q=empresa")
  for (const value of ["javascript:alert(1)", "data:text/html,test", "https://user:password@example.com", "", undefined]) assert.equal(api.prospectUrl(value), undefined)
})
