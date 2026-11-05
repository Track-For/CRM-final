import { readFile } from "node:fs/promises"
import { randomBytes } from "node:crypto"
import assert from "node:assert/strict"
import { config } from "dotenv"
import postgres from "postgres"

config({ path: ".env.local", quiet: true })
assert.ok(["127.0.0.1", "localhost"].includes(new URL(process.env.DATABASE_URL).hostname), "Teste restrito ao banco local")
assert.equal(process.env.LOCAL_LOGIN_PAUSED, "true", "O teste HTTP usa a pausa de login do ambiente de desenvolvimento")
const origin = "http://localhost:3000"
const sql = postgres(process.env.DATABASE_URL, { max: 1 })
const stateIds = []
let createdSettings = false
try {
  const page = await fetch(`${origin}/instagram`)
  assert.equal(page.status, 200)
  const html = await page.text()
  assert.ok(html.includes("Instagram"))
  assert.ok(!html.includes("App ID da Meta"), "Tela de uso não deve pedir credenciais técnicas")
  assert.ok(!html.includes("App Secret"), "Tela de uso não deve mostrar formulário técnico")
  assert.equal((await fetch(`${origin}/configuracoes/instagram`)).status, 200)
  console.log("Página /instagram: HTTP 200")
  const manifest = JSON.parse(await readFile(".next/dev/server/server-reference-manifest.json", "utf8"))
  async function action(name, args = []) {
    const entry = Object.entries(manifest.node).find(([, v]) => v.filename === "lib/instagram/actions.ts" && v.exportedName === name)
    assert.ok(entry, `Action ${name} disponível`)
    const response = await fetch(`${origin}/instagram`, { method: "POST", headers: { "Next-Action": entry[0], Origin: origin, "Content-Type": "text/plain;charset=UTF-8" }, body: JSON.stringify(args) })
    const result = await response.text()
    assert.equal(response.status, 200)
    const failure = result.match(/(?:^|\n)1:E([^\n]+)/)
    if (failure) throw new Error(JSON.parse(failure[1]).message)
    const index = result.lastIndexOf('1:{')
    return index >= 0 ? JSON.parse(result.slice(index + 2).split("\n")[0]) : undefined
  }
  const overview = await action("getInstagramOverview")
  assert.equal(overview.canManage, true)
  assert.ok(!JSON.stringify(overview).includes("appSecretEncrypted"))
  console.log("Visão do Instagram: nenhuma credencial exposta")
  const existing = await sql`select id from instagram_settings`
  if (existing.length) {
    console.log("Configuração existente preservada. Testes de autorização temporária não executados.")
  } else {
    const unconfigured = await fetch(`${origin}/api/instagram/connect`, { redirect: "manual" })
    assert.ok(unconfigured.headers.get("location").endsWith("/instagram?notice=configuration"))
    const secret = randomBytes(24).toString("hex")
    await action("saveInstagramSettings", [{ appId: "123456789012345", appSecret: secret, redirectUri: `${origin}/api/instagram/callback`, graphVersion: "v25.0" }])
    createdSettings = true
    const settings = (await sql`select app_secret_encrypted from instagram_settings where id = 'default'`)[0]
    assert.ok(settings.app_secret_encrypted.startsWith("v1:"))
    assert.ok(!settings.app_secret_encrypted.includes(secret))
    assert.ok(!JSON.stringify(await action("getInstagramOverview")).includes(secret))
    console.log("Configuração: segredo criptografado e ausente das respostas")
    const begin = await fetch(`${origin}/api/instagram/connect`, { redirect: "manual" })
    assert.equal(begin.status, 307)
    const target = new URL(begin.headers.get("location"))
    assert.equal(target.origin, "https://www.facebook.com")
    assert.equal(target.searchParams.get("redirect_uri"), `${origin}/api/instagram/callback`)
    assert.equal(target.searchParams.get("scope"), "pages_show_list,pages_read_engagement,instagram_basic")
    assert.ok(!target.searchParams.has("client_secret"))
    const state = target.searchParams.get("state")
    const cookie = begin.headers.getSetCookie().find(c => c.startsWith("crm_instagram_oauth="))?.split(";")[0]
    assert.ok(cookie)
    const { createHash } = await import("node:crypto")
    const hash = createHash("sha256").update(state).digest("hex")
    stateIds.push(hash)
    assert.equal((await sql`select id from instagram_oauth_states where id = ${hash}`).length, 1)
    const missingCookie = await fetch(`${origin}/api/instagram/callback?state=${encodeURIComponent(state)}&error=access_denied`, { redirect: "manual" })
    assert.ok(missingCookie.headers.get("location").endsWith("notice=invalid_state"))
    const cancelled = await fetch(`${origin}/api/instagram/callback?state=${encodeURIComponent(state)}&error=access_denied`, { redirect: "manual", headers: { Cookie: cookie } })
    assert.ok(cancelled.headers.get("location").endsWith("notice=cancelled"))
    const replay = await fetch(`${origin}/api/instagram/callback?state=${encodeURIComponent(state)}&error=access_denied`, { redirect: "manual", headers: { Cookie: cookie } })
    assert.ok(replay.headers.get("location").endsWith("notice=invalid_state"))
    assert.equal((await sql`select id from instagram_oauth_states where id = ${hash}`).length, 0)
    console.log("OAuth: redirecionamento, vínculo ao navegador, cancelamento e bloqueio de reuso verificados")
  }
} finally {
  if (createdSettings) await sql`delete from instagram_settings where id = 'default' and app_id = '123456789012345'`
  for (const id of stateIds) await sql`delete from instagram_oauth_states where id = ${id}`
  await sql.end()
}
console.log("Sem chamadas de autorização à Meta. Nenhuma conta real conectada; dados temporários removidos.")
