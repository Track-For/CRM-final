import { config } from "dotenv"
import { readFile } from "node:fs/promises"
import { randomBytes, createHash } from "node:crypto"
import assert from "node:assert/strict"
import postgres from "postgres"

config({ path: ".env.local", quiet: true })
assert.ok(["localhost", "127.0.0.1"].includes(new URL(process.env.DATABASE_URL).hostname))
assert.equal(process.env.LOCAL_LOGIN_PAUSED, "true", "Teste HTTP restrito ao ambiente local com pausa de login")
const origin = "http://localhost:3000"
const sql = postgres(process.env.DATABASE_URL, { max: 1 })
const stateIds = []
let createdSettings = false
try {
  const page = await fetch(`${origin}/agenda`)
  assert.equal(page.status, 200)
  const html = await page.text()
  assert.ok(!html.includes("Client Secret"), "Usuário não deve receber um formulário técnico na agenda")
  assert.ok(!html.includes("apps.googleusercontent.com"), "Credenciais não devem estar no fluxo de uso")
  assert.equal((await fetch(`${origin}/configuracoes/google-agenda`)).status, 200)
  const manifest = JSON.parse(await readFile(".next/dev/server/server-reference-manifest.json", "utf8"))
  async function action(name, args = []) {
    const entry = Object.entries(manifest.node).find(([, v]) => v.filename === "lib/google-calendar/actions.ts" && v.exportedName === name)
    assert.ok(entry, `Action ${name} disponível`)
    const endpoint = name === "saveGoogleCalendarSettings" ? "/configuracoes/google-agenda" : "/agenda"
    const response = await fetch(`${origin}${endpoint}`, { method: "POST", headers: { "Next-Action": entry[0], Origin: origin, "Content-Type": "text/plain;charset=UTF-8" }, body: JSON.stringify(args) })
    assert.equal(response.status, 200)
    const text = await response.text()
    const error = text.match(/(?:^|\n)1:E([^\n]+)/)
    if (error) throw new Error(JSON.parse(error[1]).message)
    const index = text.lastIndexOf('1:{')
    return index >= 0 ? JSON.parse(text.slice(index + 2).split("\n")[0]) : undefined
  }
  const state = await action("getGoogleCalendarState")
  assert.ok(!JSON.stringify(state).includes("TokenEncrypted"))
  assert.ok(!JSON.stringify(state).includes("clientSecret"))
  console.log("Agenda e configuração: HTTP 200; interface sem credenciais e respostas sem tokens")
  if ((await sql`select id from google_calendar_settings`).length) {
    console.log("Configuração real existente preservada. Teste temporário de OAuth não executado.")
  } else {
    const initial = await fetch(`${origin}/api/google-calendar/connect`, { redirect: "manual" })
    assert.ok(initial.headers.get("location").endsWith("google=configuration"))
    const secret = randomBytes(24).toString("hex")
    await action("saveGoogleCalendarSettings", [{ clientId: "123-local-test.apps.googleusercontent.com", clientSecret: secret, redirectUri: `${origin}/api/google-calendar/callback` }])
    createdSettings = true
    const saved = (await sql`select client_secret_encrypted from google_calendar_settings where id = 'default'`)[0]
    assert.ok(saved.client_secret_encrypted.startsWith("v1:"))
    assert.ok(!saved.client_secret_encrypted.includes(secret))
    const begin = await fetch(`${origin}/api/google-calendar/connect`, { redirect: "manual" })
    const target = new URL(begin.headers.get("location"))
    assert.equal(target.origin, "https://accounts.google.com")
    assert.equal(target.searchParams.get("access_type"), "offline")
    assert.ok(target.searchParams.get("scope").includes("calendar.events"))
    assert.equal(target.searchParams.get("redirect_uri"), `${origin}/api/google-calendar/callback`)
    assert.ok(!target.searchParams.has("client_secret"))
    const rawState = target.searchParams.get("state")
    const hash = createHash("sha256").update(rawState).digest("hex")
    stateIds.push(hash)
    const cookie = begin.headers.getSetCookie().find(c => c.startsWith("crm_google_calendar_oauth="))?.split(";")[0]
    assert.ok(cookie)
    const callback = `${origin}/api/google-calendar/callback?state=${encodeURIComponent(rawState)}&error=access_denied`
    const noCookie = await fetch(callback, { redirect: "manual" })
    assert.ok(noCookie.headers.get("location").endsWith("google=invalid_state"))
    const cancelled = await fetch(callback, { redirect: "manual", headers: { Cookie: cookie } })
    assert.ok(cancelled.headers.get("location").endsWith("google=cancelled"))
    const replay = await fetch(callback, { redirect: "manual", headers: { Cookie: cookie } })
    assert.ok(replay.headers.get("location").endsWith("google=invalid_state"))
    assert.equal((await sql`select id from google_calendar_oauth_states where id = ${hash}`).length, 0)
    console.log("OAuth: segredo criptografado, estado vinculado ao navegador, cancelamento e bloqueio de reuso verificados")
  }
} finally {
  if (createdSettings) await sql`delete from google_calendar_settings where id = 'default' and client_id = '123-local-test.apps.googleusercontent.com'`
  for (const id of stateIds) await sql`delete from google_calendar_oauth_states where id = ${id}`
  await sql.end()
}
console.log("Sem autorizar conta Google. Configuração temporária removida.")
