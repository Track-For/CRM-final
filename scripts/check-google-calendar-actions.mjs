import { config } from "dotenv"
import postgres from "postgres"
import { build } from "esbuild"
import { mkdir } from "node:fs/promises"
import { randomBytes } from "node:crypto"
import assert from "node:assert/strict"
import { pathToFileURL } from "node:url"
import path from "node:path"

config({ path: ".env.local", quiet: true })
process.env.APP_ENCRYPTION_KEY ||= randomBytes(32).toString("base64")
const originalUrl = process.env.DATABASE_URL
assert.ok(["localhost", "127.0.0.1"].includes(new URL(originalUrl).hostname), "Teste restrito ao Postgres local")
const base = postgres(originalUrl, { max: 1, onnotice: () => {} })
const schema = `gcal_test_${randomBytes(6).toString("hex")}`
const testUrl = new URL(originalUrl)
testUrl.searchParams.set("search_path", schema)
const sql = postgres(testUrl.toString(), { max: 1 })
const originalFetch = globalThis.fetch
let api
let tokens = 0, created = 0, patched = 0, deleted = 0
let invalidRefresh = false, failPage = false
const calendars = [{ id: "owner@test.invalid", summary: "Agenda de teste", accessRole: "owner", primary: true }, { id: "reader@test.invalid", summary: "Leitura", accessRole: "reader" }]
const resources = new Map()
const defaultEvents = [
  { id: "timed", etag: '"1"', summary: "Reunião", start: { dateTime: "2026-11-05T10:00:00-03:00" }, end: { dateTime: "2026-11-05T11:00:00-03:00" } },
  { id: "all_day", etag: '"1"', summary: "Dia inteiro", start: { date: "2026-11-06" }, end: { date: "2026-11-07" } },
]
try {
  await base.unsafe(`create schema "${schema}"`)
  for (const table of ["users", "google_calendar_settings", "google_calendar_connections"]) await base.unsafe(`create table "${schema}"."${table}" (like public."${table}" including all)`)
  assert.equal((await sql`select current_schema() as name`)[0].name, schema)
  await sql`insert into users (id, name, email, password_hash, role) values ('user-a', 'Teste A', 'a@test.invalid', 'disabled', 'admin'), ('user-b', 'Teste B', 'b@test.invalid', 'disabled', 'admin')`
  const dir = path.resolve(".next/local-google-calendar-tests")
  await mkdir(dir, { recursive: true })
  const file = path.join(dir, "actions.mjs")
  await build({ stdin: { contents: 'export * from "./lib/google-calendar/actions"; export { googleAccessToken } from "./lib/google-calendar/settings"; export { encryptSecret } from "./lib/fiscal/crypto"; import { db } from "./lib/db"; export async function closeTestDatabase() { await db.$client.end(); }', resolveDir: process.cwd(), sourcefile: "google-calendar-action-test-entry.ts" }, outfile: file, bundle: true, platform: "node", format: "esm", packages: "external", logLevel: "silent", plugins: [{ name: "local-auth-fixture", setup(plugin) { plugin.onResolve({ filter: /^@\/lib\/auth\/session$/ }, () => ({ path: "auth", namespace: "local-auth-fixture" })); plugin.onLoad({ filter: /.*/, namespace: "local-auth-fixture" }, () => ({ contents: 'export async function requireUser() { return { id: process.env.GCAL_TEST_USER, name: "Usuário teste", email: "test@test.invalid", role: process.env.GCAL_TEST_ROLE || "admin", totpEnabled: false }; }', loader: "ts" })); } }] })
  process.env.DATABASE_URL = testUrl.toString()
  process.env.GCAL_TEST_USER = "user-a"
  api = await import(pathToFileURL(file).href + `?run=${Date.now()}`)
  await api.saveGoogleCalendarSettings({ clientId: "123-test.apps.googleusercontent.com", clientSecret: "local-test-secret", redirectUri: "http://localhost:3000/api/google-calendar/callback" })
  const settings = (await sql`select * from google_calendar_settings`)[0]
  assert.ok(settings.client_secret_encrypted.startsWith("v1:"))
  assert.ok(!JSON.stringify(await api.getGoogleCalendarState()).includes("local-test-secret"))
  async function connection(user, events = []) {
    await sql`insert into google_calendar_connections (user_id, google_subject, email, client_id, access_token_encrypted, refresh_token_encrypted, token_expires_at, calendars, selected_calendar_id, events) values (${user}, ${`sub-${user}`}, ${`${user}@test.invalid`}, '123-test.apps.googleusercontent.com', ${api.encryptSecret('access-old')}, ${api.encryptSecret('refresh-test')}, ${new Date(0)}, ${sql.json(calendars)}, 'owner@test.invalid', ${sql.json(events)})`
  }
  await connection("user-a")
  globalThis.fetch = async (input, options = {}) => {
    const url = new URL(input)
    if (url.origin === "https://oauth2.googleapis.com") {
      assert.equal(new URLSearchParams(options.body).get("refresh_token"), "refresh-test")
      tokens++
      return invalidRefresh ? Response.json({ error: "invalid_grant" }, { status: 400 }) : Response.json({ access_token: "access-fresh", expires_in: 3600 })
    }
    assert.equal(url.origin, "https://www.googleapis.com", "Nenhum acesso externo fora da API simulada")
    assert.equal(options.headers.Authorization, "Bearer access-fresh")
    if (url.pathname.endsWith("/calendarList")) return Response.json({ items: calendars })
    const parts = url.pathname.split("/")
    const eventId = parts[parts.length - 1]
    if ((options.method || "GET") === "POST") {
      const body = JSON.parse(options.body)
      if (resources.has(body.id)) return Response.json({ error: {} }, { status: 409 })
      const item = { ...body, etag: '"created"', status: "confirmed", reminders: body.reminders, conferenceData: { entryPoints: [{ entryPointType: "video", uri: "https://meet.google.com/local-test" }] }, extendedProperties: { private: { ...body.extendedProperties.private, otherApp: "preservar" } } }
      resources.set(item.id, item); created++
      return Response.json(item)
    }
    if (options.method === "PATCH") {
      const current = resources.get(eventId)
      assert.equal(options.headers["If-Match"], current.etag)
      const body = JSON.parse(options.body)
      assert.equal(body.reminders, undefined)
      assert.equal(body.conferenceData, undefined)
      assert.equal(body.extendedProperties.private.otherApp, "preservar")
      const item = { ...current, ...body, etag: '"updated"' }
      resources.set(eventId, item); patched++
      return Response.json(item)
    }
    if (options.method === "DELETE") {
      assert.equal(options.headers["If-Match"], resources.get(eventId).etag)
      resources.delete(eventId); deleted++
      return new Response(null, { status: 204 })
    }
    if (eventId !== "events") return Response.json(resources.get(eventId))
    if (url.searchParams.get("pageToken") === "page-2") {
      if (failPage) return Response.json({ error: {} }, { status: 500 })
      return Response.json({ items: [{ ...defaultEvents[0], status: "cancelled", id: "cancelled" }] })
    }
    assert.equal(url.searchParams.get("singleEvents"), "true")
    return Response.json({ items: defaultEvents, nextPageToken: "page-2" })
  }
  const refreshed = await Promise.all([api.googleAccessToken("user-a"), api.googleAccessToken("user-a")])
  assert.deepEqual(refreshed, ["access-fresh", "access-fresh"]); assert.equal(tokens, 1)
  console.log("Renovação de token: concorrência e criptografia verificadas")
  const range = { from: "2026-11-01T00:00:00Z", to: "2026-12-01T00:00:00Z" }
  let state = await api.syncGoogleCalendarRange(range)
  assert.equal(state.events.length, 2)
  assert.ok(state.events.find(e => e.allDay).google.readOnly)
  assert.ok(!JSON.stringify(state).includes("access-fresh"))
  failPage = true
  await assert.rejects(api.syncGoogleCalendarRange(range))
  assert.deepEqual((await api.getGoogleCalendarState()).events, state.events)
  failPage = false
  console.log("Sincronização: paginação, dia inteiro e preservação do cache em falhas verificadas")
  process.env.GCAL_TEST_USER = "user-b"
  assert.deepEqual((await api.getGoogleCalendarState()).events, [])
  assert.equal((await api.getGoogleCalendarState()).email, null)
  process.env.GCAL_TEST_ROLE = "financeiro"
  await assert.rejects(api.getGoogleCalendarAdminSettings())
  delete process.env.GCAL_TEST_ROLE
  process.env.GCAL_TEST_USER = "user-a"
  const input = { title: "Evento criado no teste", type: "call", start: "2026-11-07T13:00:00Z", end: "2026-11-07T14:00:00Z", reminderMinutes: 15 }
  state = await api.createGoogleCalendarEvent("draft-test-001", input)
  state = await api.createGoogleCalendarEvent("draft-test-001", input)
  assert.equal(created, 1)
  const event = state.events.find(e => e.title === input.title)
  assert.equal(state.events.filter(e => e.id === event.id).length, 1)
  await assert.rejects(api.createGoogleCalendarEvent("draft-test-001", { ...input, title: "Mudança após criação" }))
  state = await api.updateGoogleCalendarEvent(event.id, event.google.etag, { ...input, title: "Atualizado" })
  const updated = state.events.find(e => e.id === event.id)
  assert.equal(updated.title, "Atualizado")
  await assert.rejects(api.updateGoogleCalendarEvent(event.id, event.google.etag, input))
  assert.equal(patched, 1)
  state = await api.deleteGoogleCalendarEvent(updated.id, updated.google.etag)
  assert.ok(!state.events.some(e => e.id === updated.id)); assert.equal(deleted, 1)
  console.log("Criação idempotente, edição com ETag e exclusão confirmada: verificadas sem chamadas reais ao Google")
  await api.selectGoogleCalendar("reader@test.invalid")
  await assert.rejects(api.createGoogleCalendarEvent("readonly-test", input))
  assert.equal(created, 1)
  state = await api.syncGoogleCalendarRange(range)
  assert.ok(state.events.every(e => e.google.readOnly))
  await connection("user-b", [{ ...state.events[0], id: "private-b", title: "Somente usuário B", ownerId: "user-b" }])
  assert.ok(!(await api.getGoogleCalendarState()).events.some(e => e.title === "Somente usuário B"))
  invalidRefresh = true
  await sql`update google_calendar_connections set token_expires_at = ${new Date(0)} where user_id = 'user-a'`
  await assert.rejects(api.googleAccessToken("user-a"))
  assert.equal((await api.getGoogleCalendarState()).needsReconnect, true)
  await api.disconnectGoogleCalendar()
  assert.deepEqual((await api.getGoogleCalendarState()).events, [])
  assert.equal((await sql`select user_id from google_calendar_connections where user_id = 'user-b'`).length, 1)
  console.log("Permissões de leitura, isolamento entre usuários, revogação e desconexão individual: verificados")
} finally {
  globalThis.fetch = originalFetch
  if (api) await api.closeTestDatabase()
  await sql.end()
  await base.unsafe(`drop schema if exists "${schema}" cascade`)
  await base.end()
  process.env.DATABASE_URL = originalUrl
  delete process.env.GCAL_TEST_USER
  delete process.env.GCAL_TEST_ROLE
}
console.log("Schema de teste removido. Nenhuma conta Google ou configuração real foi alterada.")
