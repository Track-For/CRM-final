import { test } from "node:test"
import assert from "node:assert/strict"
import { currentStories, mediaKind, mergeMedia, normalizeMedia, normalizeProfile, safeInstagramUrl, validateRedirectUri } from "../lib/instagram/normalize.ts"
import { graphRequest, InstagramApiError } from "../lib/instagram/client.ts"
const media = (id, timestamp, extra = {}) => ({ id, timestamp, media_type: "IMAGE", ...extra })

test("distingue publicações, Reels e stories pelo tipo informado pela Meta", () => {
  const item = media("1", "2026-11-05T10:00:00Z")
  assert.equal(mediaKind(item), "post")
  assert.equal(mediaKind({ ...item, media_type: "VIDEO", media_product_type: "REELS" }), "reel")
  assert.equal(mediaKind({ ...item, media_product_type: "STORY" }), "story")
})
test("remove stories expirados, futuros e com horário inválido", () => {
  const now = Date.parse("2026-11-05T12:00:00Z")
  const items = [media("1", "2026-11-05T11:00:00Z"), media("2", "2026-11-04T12:00:00Z"), media("3", "2026-11-05T13:00:00Z"), media("4", "inválido")]
  assert.deepEqual(currentStories(items, now).map(i => i.id), ["1"])
})
test("mescla páginas sem duplicar mídias e preserva ordenação por data", () => {
  const first = media("1", "2026-11-05T10:00:00Z", { caption: "Antes" })
  const second = media("2", "2026-11-04T10:00:00Z")
  const result = mergeMedia([first], [second, { ...first, caption: "Atualizada" }])
  assert.deepEqual(result.map(i => i.id), ["1", "2"]); assert.equal(result[0].caption, "Atualizada")
})
test("normalização de perfil remove tokens e não inventa métricas", () => {
  const result = normalizeProfile({ id: "123", username: "perfil_teste", access_token: "não-retornar", followers_count: 42 })
  assert.deepEqual(result, { id: "123", username: "perfil_teste", followers_count: 42 })
  assert.equal(result.media_count, undefined)
  assert.throws(() => normalizeProfile({ id: "não-numérico", username: "teste" }))
})
test("normalização de mídias remove itens inválidos e campos privados", () => {
  const result = normalizeMedia([media("1", "2026-11-05T10:00:00Z", { access_token: "privado", like_count: 0 }), media("2", "inválido"), { id: "3" }])
  assert.equal(result.length, 1); assert.equal(result[0].like_count, 0); assert.equal(result[0].access_token, undefined)
})
test("URLs de exibição bloqueiam scripts e URLs de callback exigem HTTPS fora do localhost", () => {
  assert.equal(safeInstagramUrl("javascript:alert(1)"), undefined)
  assert.equal(safeInstagramUrl("https://www.instagram.com/p/exemplo/"), "https://www.instagram.com/p/exemplo/")
  assert.equal(validateRedirectUri("http://localhost:3000/api/instagram/callback"), "http://localhost:3000/api/instagram/callback")
  assert.throws(() => validateRedirectUri("http://example.com/api/instagram/callback"))
  assert.throws(() => validateRedirectUri("https://example.com/api/instagram/callback?next=bad"))
  assert.throws(() => validateRedirectUri("https://example.com/rota-errada"))
})
test("cliente Graph envia token no header, adiciona appsecret_proof e não segue paginação arbitrária", async () => {
  const previous = globalThis.fetch
  try {
    globalThis.fetch = async (url, options) => {
      const parsed = new URL(url)
      assert.equal(parsed.hostname, "graph.facebook.com")
      assert.equal(parsed.searchParams.has("access_token"), false)
      assert.equal(parsed.searchParams.has("app_secret"), false)
      assert.match(parsed.searchParams.get("appsecret_proof"), /^[a-f0-9]{64}$/)
      assert.equal(options.headers.Authorization, "Bearer token-de-teste")
      return Response.json({ data: [] })
    }
    assert.deepEqual(await graphRequest("123/media", { token: "token-de-teste", appSecret: "segredo-de-teste", version: "v25.0", params: { fields: "id" } }), { data: [] })
    await assert.rejects(graphRequest("https://outro-host.example", { version: "v25.0" }))
  } finally { globalThis.fetch = previous }
})
test("erros da Meta são traduzidos sem vazar o conteúdo da resposta", async () => {
  const previous = globalThis.fetch
  try {
    globalThis.fetch = async () => Response.json({ error: { code: 190, message: "token-privado-que-nao-pode-vazar" } }, { status: 400 })
    await assert.rejects(graphRequest("123", { version: "v25.0", token: "token" }), error => error instanceof InstagramApiError && error.message.includes("expirou") && !error.message.includes("token-privado"))
  } finally { globalThis.fetch = previous }
})
