import { config } from "dotenv"
import postgres from "postgres"
import { build } from "esbuild"
import { mkdir } from "node:fs/promises"
import { randomBytes } from "node:crypto"
import assert from "node:assert/strict"
import { pathToFileURL } from "node:url"
import path from "node:path"

config({ path: ".env.local", quiet: true })
const originals = Object.fromEntries(["DATABASE_URL", "NODE_ENV", "LOCAL_LOGIN_PAUSED", "SMTP_HOST"].map(key => [key, process.env[key]]))
assert.ok(originals.DATABASE_URL && ["localhost", "127.0.0.1"].includes(new URL(originals.DATABASE_URL).hostname), "Teste restrito ao banco local")
const base = postgres(originals.DATABASE_URL, { max: 1, onnotice: () => {} })
const schema = `auth_test_${randomBytes(6).toString("hex")}`
const url = new URL(originals.DATABASE_URL); url.searchParams.set("search_path", schema)
const sql = postgres(url.toString(), { max: 1, onnotice: () => {} })
const jar = new Map()
const options = new Map()
globalThis.__authCheck = {
  cookies: { get: key => jar.has(key) ? { value: jar.get(key) } : undefined, set: (key, value, opts) => { jar.set(key, value); options.set(key, opts) }, delete: key => jar.delete(key) },
  email: null,
}
const form = values => { const result = new FormData(); for (const [key, value] of Object.entries(values)) result.set(key, value); return result }
const redirectTo = async (job, target) => assert.rejects(job, error => error.message === `REDIRECT:${target}`)
let api
try {
  await base.unsafe(`create schema "${schema}"`)
  for (const table of ["users", "sessions", "auth_challenges", "crm_records"]) await base.unsafe(`create table "${schema}"."${table}" (like public."${table}" including all)`)
  const dir = path.resolve(".next/local-auth-check"); await mkdir(dir, { recursive: true })
  const outfile = path.join(dir, "actions.mjs")
  const fixtures = {
    "next/headers": 'export async function cookies(){return globalThis.__authCheck.cookies};export async function headers(){return new Headers({"user-agent":"auth-local-test","x-forwarded-for":"203.0.113.30"})}',
    "next/navigation": 'export function redirect(path){throw Error(`REDIRECT:${path}`)}',
    "@/lib/auth/email": 'export async function sendLoginCodeEmail(to,code){globalThis.__authCheck.email={to,code};return {ok:true}}',
  }
  await build({ stdin: { contents: 'export * from "./lib/auth/actions"; export * from "./lib/auth/session"; export {hashPassword} from "./lib/auth/password"; export {generateTotpSecret,generateTotp} from "./lib/auth/totp"; export {sendLoginCodeEmail as realLoginEmail} from "./lib/auth/email"; import {db} from "./lib/db"; export async function closeDatabase(){await db.$client.end()}', resolveDir: process.cwd(), sourcefile: "auth-check.ts" }, outfile, bundle: true, platform: "node", format: "esm", packages: "external", logLevel: "silent", plugins: [{ name: "request-context", setup(builder) {
    builder.onResolve({ filter: /.*/ }, args => args.path in fixtures ? { path: args.path, namespace: "fixture" } : undefined)
    builder.onLoad({ filter: /.*/, namespace: "fixture" }, args => ({ contents: fixtures[args.path], loader: "js" }))
  } }] })
  process.env.DATABASE_URL = url.toString()
  process.env.NODE_ENV = "production"
  process.env.LOCAL_LOGIN_PAUSED = "true"
  delete process.env.SMTP_HOST
  api = await import(pathToFileURL(outfile).href + `?run=${Date.now()}`)
  assert.equal(await api.getCurrentUser(), null, "Pausa local não pode funcionar em produção")
  assert.equal((await api.realLoginEmail("test@example.invalid", "123456")).ok, false, "Sem SMTP produção deve bloquear envio")
  const password = "Senha-sintetica-12345"
  const first = { name: "Admin Teste", email: "admin@example.invalid", password, confirmPassword: password }
  await redirectTo(api.createFirstUserAction({}, form(first)), "/login?conta=criada")
  assert.match((await api.createFirstUserAction({}, form(first))).error, /já foi configurado/)
  for (let attempt = 0; attempt < 5; attempt++) {
    const result = await api.loginAction({}, form({ email: first.email, password: "errada" }))
    assert.match(result.error, attempt === 4 ? /bloqueado por 15 minutos/ : /inválidos/)
  }
  assert.match((await api.loginAction({}, form({ email: first.email, password }))).error, /Muitas tentativas/)
  await sql`update users set locked_until=null, failed_login_count=0 where email=${first.email}`
  await redirectTo(api.loginAction({}, form({ email: first.email, password })), "/login/verificar")
  assert.equal(jar.has("crm_session"), false)
  assert.equal(jar.has("crm_2fa"), true)
  assert.equal((await api.getPendingChallenge()).emailSent, true)
  assert.equal(options.get("crm_2fa").httpOnly, true)
  assert.equal(options.get("crm_2fa").secure, true)
  assert.match((await api.sendEmailCodeAction({}, new FormData())).error, /Aguarde/)
  const code = globalThis.__authCheck.email.code
  const wrong = code === "000000" ? "111111" : "000000"
  assert.match((await api.verifyTwoFactorAction({}, form({ method: "email", code: wrong }))).error, /Código inválido/)
  await redirectTo(api.verifyTwoFactorAction({}, form({ method: "email", code })), "/dashboard")
  assert.equal(jar.has("crm_2fa"), false)
  assert.equal(options.get("crm_session").secure, true)
  const sessionCookie = jar.get("crm_session")
  const [session] = await sql`select * from sessions`
  assert.equal(session.id, api.sha256Hex(sessionCookie))
  assert.notEqual(session.id, sessionCookie)
  assert.equal((await api.getCurrentUser()).role, "admin")
  assert.match((await api.verifyTwoFactorAction({}, form({ method: "email", code }))).error, /expirou/)
  await redirectTo(api.logoutAction(), "/login")
  assert.equal(await api.getCurrentUser(), null)
  assert.equal((await sql`select * from sessions`).length, 0)
  console.log("OK: primeiro acesso único, senha incorreta/bloqueio, desafio 2FA, limite de reenvio, cookie seguro, hash da sessão, logout e bloqueio de reuso.")

  const secret = api.generateTotpSecret()
  await sql`update users set totp_secret=${secret},totp_enabled=true where email=${first.email}`
  await redirectTo(api.loginAction({}, form({ email: first.email, password })), "/login/verificar")
  await redirectTo(api.verifyTwoFactorAction({}, form({ method: "totp", code: api.generateTotp(secret) })), "/dashboard")
  const current = await api.getCurrentUser()
  await sql`update users set active=false where id=${current.id}`
  assert.equal(await api.getCurrentUser(), null)
  await sql`update users set active=true where id=${current.id}`
  await sql`update sessions set expires_at=now()-interval '1 minute'`
  assert.equal(await api.getCurrentUser(), null)
  assert.equal((await sql`select * from sessions`).length, 0)
  jar.clear()
  for (const role of ["admin", "comercial", "operacao", "financeiro"]) {
    const id = `role-${role}`
    await sql`insert into users(id,name,email,password_hash,role) values(${id},${role},${`role-${role}@example.invalid`},'disabled',${role})`
    await api.createSession(id)
    assert.equal((await api.requireUser()).role, role)
    await api.destroySession()
  }
  await redirectTo(api.requireUser(), "/login")
  await redirectTo(api.loginAction({}, form({ email: first.email, password })), "/login/verificar")
  await sql`update auth_challenges set expires_at=now()-interval '1 minute'`
  assert.equal(await api.getPendingChallenge(), null)
  await redirectTo(api.loginAction({}, form({ email: first.email, password })), "/login/verificar")
  const validTotp = api.generateTotp(secret)
  const invalidTotp = validTotp === "000000" ? "111111" : "000000"
  for (let attempt = 0; attempt < 5; attempt++) {
    const result = await api.verifyTwoFactorAction({}, form({ method: "totp", code: invalidTotp }))
    assert.match(result.error, attempt === 4 ? /Muitas tentativas/ : /Código inválido/)
  }
  assert.equal(await api.getPendingChallenge(), null)
  console.log("OK: TOTP, usuário desativado, sessão expirada, identidade dos quatro perfis, desafio expirado e limite de tentativas 2FA.")
  console.log("Banco temporário; e-mail de login simulado; nenhuma conta ou senha real foi alterada.")
} finally {
  if (api) await api.closeDatabase()
  await sql.end()
  await base.unsafe(`drop schema if exists "${schema}" cascade`)
  await base.end()
  for (const [key, value] of Object.entries(originals)) { if (value === undefined) delete process.env[key]; else process.env[key] = value }
  delete globalThis.__authCheck
}
