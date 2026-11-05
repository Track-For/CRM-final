import { test } from "node:test"
import assert from "node:assert/strict"
import { CALENDAR_SCOPES, eventPayload, googleCreationId, googleLocalId, normalizeGoogleEvent, validateGoogleRedirect, writableCalendar } from "../lib/google-calendar/normalize.ts"
import { GoogleCalendarError, googleCalendarRequest, googleTokenRequest } from "../lib/google-calendar/client.ts"
import { eventsOnDay, layoutDay } from "../components/agenda/utils.ts"
const calendar = { id: "primary@test.invalid", summary: "Teste", accessRole: "owner" }
const raw = { id: "evt123", etag: '"1"', summary: "Reunião", start: { dateTime: "2026-11-05T10:00:00-03:00" }, end: { dateTime: "2026-11-05T11:00:00-03:00" } }

test("eventos Google têm IDs estáveis e isolados por usuário e agenda", () => {
  assert.equal(googleLocalId("a", "calendar", "id"), googleLocalId("a", "calendar", "id"))
  assert.notEqual(googleLocalId("a", "calendar", "id"), googleLocalId("b", "calendar", "id"))
  assert.notEqual(googleLocalId("a", "calendar", "id"), googleLocalId("a", "other", "id"))
  assert.match(googleCreationId("a", "request"), /^[0-9a-v]{5,1024}$/)
})
test("preserva o fuso horário e reconhece ocorrências de séries", () => {
  const event = normalizeGoogleEvent({ ...raw, recurringEventId: "series", hangoutLink: "https://meet.google.com/test" }, calendar, "user")
  assert.equal(event.start, raw.start.dateTime)
  assert.equal(event.google.recurring, true)
  assert.equal(event.google.readOnly, false)
  assert.equal(event.meetingUrl, "https://meet.google.com/test")
})
test("eventos de dia inteiro mantêm a data local e são consultivos no CRM", () => {
  const event = normalizeGoogleEvent({ ...raw, start: { date: "2026-11-05" }, end: { date: "2026-11-07" } }, calendar, "user")
  assert.equal(event.start, "2026-11-05T00:00:00")
  assert.equal(event.end, "2026-11-07T00:00:00")
  assert.equal(event.allDay, true); assert.equal(event.google.readOnly, true)
})
test("agendas sem permissão e eventos especiais não permitem edição", () => {
  assert.equal(writableCalendar({ ...calendar, accessRole: "reader" }), false)
  assert.equal(normalizeGoogleEvent(raw, { ...calendar, accessRole: "reader" }, "user").google.readOnly, true)
  assert.equal(normalizeGoogleEvent({ ...raw, eventType: "birthday" }, calendar, "user").google.readOnly, true)
  assert.equal(normalizeGoogleEvent({ ...raw, visibility: "private" }, { ...calendar, accessRole: "writerWithoutPrivateAccess" }, "user").google.readOnly, true)
})
test("ignora exclusões e recursos inválidos; bloqueia links executáveis", () => {
  assert.equal(normalizeGoogleEvent({ ...raw, status: "cancelled" }, calendar, "user"), null)
  assert.equal(normalizeGoogleEvent({ ...raw, end: undefined }, calendar, "user"), null)
  assert.equal(normalizeGoogleEvent({ ...raw, htmlLink: "javascript:alert(1)" }, calendar, "user").google.htmlLink, undefined)
})
test("metadados de CRM e lembretes são convertidos sem criar convidados", () => {
  const payload = eventPayload({ title: "Call", type: "call", start: raw.start.dateTime, end: raw.end.dateTime, leadId: "lead-test", reminderMinutes: 15 })
  assert.equal(payload.start.dateTime, "2026-11-05T13:00:00.000Z")
  assert.equal(payload.extendedProperties.private.crmLeadId, "lead-test")
  assert.equal(payload.reminders.overrides[0].minutes, 15)
  assert.equal(payload.attendees, undefined)
  assert.ok(CALENDAR_SCOPES.includes("https://www.googleapis.com/auth/calendar.events"))
  assert.ok(!CALENDAR_SCOPES.includes("https://www.googleapis.com/auth/calendar"))
})
test("callback aceita somente HTTPS ou loopback e não permite parâmetros arbitrários", () => {
  assert.equal(validateGoogleRedirect("http://localhost:3000/api/google-calendar/callback"), "http://localhost:3000/api/google-calendar/callback")
  assert.throws(() => validateGoogleRedirect("http://example.com/api/google-calendar/callback"))
  assert.throws(() => validateGoogleRedirect("https://example.com/api/google-calendar/callback?token=secret"))
})
test("clientes usam Bearer e POST para tokens, preservam ETag e sanitizam erros", async () => {
  const previous = globalThis.fetch
  try {
    globalThis.fetch = async (url, options) => {
      assert.equal(new URL(url).hostname, "www.googleapis.com")
      assert.equal(new URL(url).searchParams.has("access_token"), false)
      assert.equal(options.headers.Authorization, "Bearer test")
      assert.equal(options.headers["If-Match"], '"1"')
      return Response.json({ error: { message: "segredo que não pode vazar" } }, { status: 412 })
    }
    await assert.rejects(googleCalendarRequest("/calendars/primary/events/id", "test", { method: "PATCH", etag: '"1"', body: {} }), error => error instanceof GoogleCalendarError && error.message.includes("mudou") && !error.message.includes("segredo"))
    globalThis.fetch = async (url, options) => {
      assert.equal(String(url), "https://oauth2.googleapis.com/token")
      assert.equal(options.method, "POST")
      assert.equal(new URLSearchParams(options.body).get("client_secret"), "secret")
      return Response.json({ error: "invalid_grant", error_description: "dado privado" }, { status: 400 })
    }
    await assert.rejects(googleTokenRequest({ client_secret: "secret", refresh_token: "refresh" }), error => error instanceof GoogleCalendarError && error.reason === "invalid_grant" && !error.message.includes("dado privado"))
  } finally { globalThis.fetch = previous }
})

test("grade diária inclui eventos noturnos e recorta a continuação após a meia-noite", () => {
  const day = new Date(2026, 10, 6)
  const start = new Date(2026, 10, 5, 23)
  const end = new Date(2026, 10, 6, 7)
  const event = { id: "night", title: "Noturno", type: "reuniao", start: start.toISOString(), end: end.toISOString(), ownerId: "user" }
  assert.equal(eventsOnDay([event], day).length, 1)
  const layout = layoutDay([event], day)[0]
  assert.equal(layout.top, 0)
  assert.ok(layout.height > 0 && layout.height < 24 * 52)
})
