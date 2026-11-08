// Integração real com Postgres isolado; SMTP, Evolution e OpenAI são simulados.
import { config } from "dotenv"
import postgres from "postgres"
import { build } from "esbuild"
import { mkdir } from "node:fs/promises"
import { randomBytes, createHash } from "node:crypto"
import assert from "node:assert/strict"
import { pathToFileURL } from "node:url"
import path from "node:path"

config({ path: ".env.local", quiet: true })
const database = process.env.DATABASE_URL
assert.ok(database && ["127.0.0.1", "localhost"].includes(new URL(database).hostname), "Somente banco local")
const base = postgres(database, { max: 1, onnotice: () => {} })
const schema = `features_test_${randomBytes(6).toString("hex")}`
const url = new URL(database); url.searchParams.set("search_path", schema)
const sql = postgres(url.toString(), { max: 1, onnotice: () => {} })
const form = data => { const f = new FormData(); for (const [k, v] of Object.entries(data)) f.set(k, v); return f }
const hash = s => createHash("sha256").update(s).digest("hex")
globalThis.__features = { ip: "203.0.113.8", email: null, role: "admin", status: 503, sends: [], evolutionCalls: 0 }
const state = globalThis.__features
let api
const fetchOriginal = globalThis.fetch
try {
  await base.unsafe(`create schema "${schema}"`)
  for (const table of ["users", "sessions", "auth_challenges", "crm_records", "whatsapp_messages"]) await base.unsafe(`create table "${schema}"."${table}" (like public."${table}" including all)`)
  const dir = path.resolve(".next/access-media-webhooks-check"); await mkdir(dir, { recursive: true })
  const outfile = path.join(dir, "features.mjs")
  const fixtures = {
    "next/headers": 'export async function headers(){return new Headers({"x-forwarded-for":globalThis.__features.ip})}',
    "./email": 'export async function sendPasswordRecoveryEmail(to,link){globalThis.__features.email={to,link};return {ok:!globalThis.__features.smtpFailure}}',
    "@/lib/auth/session": 'export async function requireUser(){if(globalThis.__features.role==="anonymous")throw Error("Não autenticado");return {id:"actor",role:globalThis.__features.role}}',
    "./webhooks": 'export async function deliverWebhook(webhook,event,payload,id){const s=globalThis.__features;s.sends.push({event,payload,id});await new Promise(r=>setTimeout(r,10));return {status:s.status,ms:10}}',
    "./client": 'export async function evolutionRequest(){globalThis.__features.evolutionCalls++;return globalThis.__features.media}',
  }
  await build({ stdin: { contents: 'export * from "./lib/auth/recovery"; export * from "./lib/integrations/webhook-queue"; export * from "./lib/whatsapp/media"; export * from "./lib/whatsapp/media-actions"; export * from "./lib/ai/media-provider"; export {hashPassword,verifyPassword} from "./lib/auth/password"; import {db} from "./lib/db"; export async function close(){await db.$client.end()}', resolveDir: process.cwd() }, outfile, bundle: true, platform: "node", format: "esm", packages: "external", logLevel: "silent", plugins: [{ name: "external-transports", setup(p) {
    p.onResolve({ filter: /.*/ }, args => args.path in fixtures ? { path: args.path, namespace: "fixture" } : undefined)
    p.onLoad({ filter: /.*/, namespace: "fixture" }, args => ({ contents: fixtures[args.path], loader: "js" }))
  } }] })
  process.env.DATABASE_URL = url.toString()
  process.env.CRM_PUBLIC_URL = "https://crm.example.invalid"
  process.env.SMTP_HOST = "fixture"
  process.env.EMAIL_FROM = "test@example.invalid"
  process.env.OPENAI_API_KEY = "synthetic-secret"
  process.env.OPENAI_MODEL = "synthetic-model"
  process.env.LOCAL_LOGIN_PAUSED = "false"
  api = await import(pathToFileURL(outfile).href)
  const password = await api.hashPassword("Senha-antiga-123")
  await sql`insert into users(id,name,email,password_hash,active,totp_enabled,totp_secret) values('actor','Teste','active@example.invalid',${password},true,true,'totp-preservado')`
  await sql`insert into sessions(id,user_id,expires_at) values('old-session','actor',now()+interval '1 day')`
  await sql`insert into auth_challenges(id,user_id,expires_at) values('challenge','actor',now()+interval '10 minutes')`
  const known = await api.requestPasswordRecovery({}, form({ email: "active@example.invalid" }))
  const unknown = await api.requestPasswordRecovery({}, form({ email: "unknown@example.invalid" }))
  assert.deepEqual(known, unknown, "Não revelar a existência da conta")
  const token = new URL(state.email.link).searchParams.get("token")
  const [resetRow] = await sql`select data from crm_records where resource='passwordRecovery'`
  assert.equal(resetRow.data.tokenHash, hash(token)); assert.ok(!JSON.stringify(resetRow).includes(token))
  assert.match((await api.resetPassword({}, form({ token, password: "Senha-nova-456", confirmPassword: "outra" }))).error, /conferem/)
  const resets = await Promise.all([1, 2].map(() => api.resetPassword({}, form({ token, password: "Senha-nova-456", confirmPassword: "Senha-nova-456" }))))
  assert.equal(resets.filter(r => r.ok).length, 1, "Token consumido uma única vez sob concorrência")
  assert.equal((await sql`select * from sessions`).length, 0)
  assert.equal((await sql`select * from auth_challenges`).length, 0)
  const [user] = await sql`select * from users where id='actor'`
  assert.ok(await api.verifyPassword("Senha-nova-456", user.password_hash))
  assert.equal(user.totp_enabled, true); assert.equal(user.totp_secret, "totp-preservado")
  for (const [kind, patch] of [["expired", { expiresAt: "2000-01-01T00:00:00Z" }], ["changed", { passwordVersion: password }], ["inactive", {}]]) {
    const t = randomBytes(32).toString("base64url")
    await sql`insert into crm_records(resource,id,data,created) values('passwordRecovery','actor',${sql.json({ tokenHash: hash(t), userId: "actor", passwordVersion: user.password_hash, expiresAt: new Date(Date.now()+60000).toISOString(), ...patch })},true) on conflict(resource,id) do update set data=excluded.data`
    if (kind === "inactive") await sql`update users set active=false where id='actor'`
    assert.ok((await api.resetPassword({}, form({ token: t, password: "Outra-senha-789", confirmPassword: "Outra-senha-789" }))).error, kind)
    await sql`update users set active=true where id='actor'`
  }
  state.ip = "203.0.113.99"
  for (let i=0;i<7;i++) await api.requestPasswordRecovery({}, form({ email: `nonexistent${i}@example.invalid` }))
  assert.equal((await sql`select (data->>'count')::int as count from crm_records where resource='passwordRecoveryRate' and id=${hash(`ip:${state.ip}:${Math.floor(Date.now()/900000)}`)}`)[0].count, 5)
  console.log("OK | Recuperação: privacidade, hash, senha, expiração, concorrência, revogação, TOTP e limite persistido")

  const webhook = { id: "hook", url: "https://hooks.example.invalid", event: "lead.created", secret: "synthetic", active: true }
  await sql`insert into crm_records(resource,id,data,created) values('webhooks','hook',${sql.json(webhook)},true)`
  const first = await api.sendAndLog(webhook, webhook.event, { id: "lead" })
  assert.equal(first.queued, true)
  const id = state.sends[0].id
  const job = async () => (await sql`select data from crm_records where resource='webhookJobs' and id=${id}`)[0].data
  assert.equal((await job()).attempts, 1)
  await api.processPendingWebhooks(); assert.equal(state.sends.length, 1, "Não antecipar a próxima tentativa")
  await sql`update crm_records set data=jsonb_set(data,'{nextAttemptAt}',to_jsonb(now()-interval '1 second')) where resource='webhookJobs' and id=${id}`
  state.status = 204
  await Promise.all([api.processPendingWebhooks(), api.processPendingWebhooks()])
  assert.equal(state.sends.length, 2, "Workers concorrentes enviam uma única vez")
  assert.equal(state.sends[1].id, id, "ID preservado para deduplicação")
  assert.equal((await job()).state, "completed")
  assert.equal((await sql`select data->>'status' as status from crm_records where resource='integrationLogs' and id=${id}`)[0].status, "sucesso")
  await assert.rejects(api.retryQueuedWebhook(id), /concluída/)
  state.status = 400
  await api.sendAndLog(webhook, webhook.event, {})
  const badId = state.sends.at(-1).id
  assert.equal((await sql`select data from crm_records where resource='webhookJobs' and id=${badId}`)[0].data.state, "failed")
  state.status = 503
  await api.retryQueuedWebhook(badId)
  await sql`update crm_records set data=data || jsonb_build_object('cycleAttempts',5,'nextAttemptAt',now()-interval '1 second') where resource='webhookJobs' and id=${badId}`
  await api.processWebhookJob(badId)
  assert.equal((await sql`select data from crm_records where resource='webhookJobs' and id=${badId}`)[0].data.state, "failed", "Limite de tentativas")
  await sql`update crm_records set data=data || jsonb_build_object('state','processing','cycleAttempts',1,'leaseToken','interrupted','leaseUntil',now()-interval '1 second') where resource='webhookJobs' and id=${badId}`
  state.status = 204; await api.processPendingWebhooks()
  assert.equal((await sql`select data from crm_records where resource='webhookJobs' and id=${badId}`)[0].data.state, "completed", "Retoma reserva expirada")
  await sql`update crm_records set data=jsonb_set(data,'{active}','false') where resource='webhooks' and id='hook'`
  const beforePause = state.sends.length
  await api.sendAndLog(webhook, webhook.event, {})
  assert.equal(state.sends.length, beforePause, "Webhook pausado não envia")
  await sql`update crm_records set data=jsonb_set(data,'{active}','true') where resource='webhooks' and id='hook'`
  await sql`insert into crm_records(resource,id,data,created) values('integrationLogs','legacy',${sql.json({ id:"legacy",integration:"n8n",direction:"saida",status:"erro",event:webhook.event,webhookId:"hook",payload:'{"old":true}',attempts:2,createdAt:new Date().toISOString() })},true)`
  await api.retryQueuedWebhook("legacy")
  assert.equal(state.sends.at(-1).id, "legacy")
  console.log("OK | Webhooks: persistência, agendamento, concorrência, ID estável, limite, erros definitivos, pausa, retomada e legado")

  const mediaId = "a".repeat(64)
  await sql`insert into whatsapp_messages(id,instance,provider_id,remote_jid,phone,direction,text,message_type,sent_at) values(${mediaId},${process.env.EVOLUTION_INSTANCE || "crm-principal"},'provider','5511999999999@s.whatsapp.net','5511999999999','in','[Áudio]','audioMessage',now())`
  state.media = { mimetype: "audio/ogg; codecs=opus", base64: Buffer.from("OggSsynthetic-audio").toString("base64"), fileName: "voice.ogg" }
  let aiCalls = 0
  globalThis.fetch = async (url, options) => {
    aiCalls++; assert.equal(url, "https://api.openai.com/v1/audio/transcriptions")
    assert.equal(options.body.get("file").name, "voice.ogg")
    return Response.json({ text: "Gostaria da proposta até sexta-feira." })
  }
  const mediaReads = await Promise.allSettled([api.analyzeWhatsappMedia(mediaId), api.analyzeWhatsappMedia(mediaId)])
  assert.equal(mediaReads.filter(r => r.status === "fulfilled").length, 1)
  assert.equal(aiCalls, 1)
  assert.equal((await api.analyzeWhatsappMedia(mediaId)).text, "Gostaria da proposta até sexta-feira.")
  assert.equal(aiCalls, 1, "Leitura em cache não consome novamente")
  state.role = "financeiro"; await assert.rejects(api.analyzeWhatsappMedia(mediaId), /permissão/)
  state.role = "anonymous"; await assert.rejects(api.analyzeWhatsappMedia(mediaId), /autenticado/)
  state.role = "operacao"; assert.ok((await api.analyzeWhatsappMedia(mediaId)).text)
  await assert.rejects(api.analyzeWhatsappMedia("b".repeat(64)), /não encontrado/)
  const stickerId = "c".repeat(64)
  const stickerInstance = process.env.EVOLUTION_INSTANCE || "crm-principal"
  await sql`insert into whatsapp_messages(id,instance,provider_id,remote_jid,phone,direction,text,message_type,sent_at) values(${stickerId},${stickerInstance},'sticker-provider','5511999999999@s.whatsapp.net','5511999999999','in','[Figurinha]','stickerMessage',now())`
  const stickerBytes = Buffer.from("RIFFxxxxWEBPsynthetic-sticker")
  state.media = { mimetype: "image/webp", base64: stickerBytes.toString("base64"), fileName: "figurinha.webp" }
  const { message: sticker } = await api.authorizedMediaMessage(stickerId)
  const stickerMedia = await api.fetchMessageMedia(sticker)
  assert.equal(stickerMedia.mime, "image/webp")
  assert.deepEqual(stickerMedia.bytes, stickerBytes, "Preservar o arquivo original da figurinha")
  await assert.rejects(api.analyzeWhatsappMedia(stickerId), /indisponível para este tipo/)
  assert.throws(() => api.decodeMedia({ mimetype: "audio/ogg", base64: Buffer.from("OggSfixture").toString("base64") }, "stickerMessage"), /não corresponde/)
  assert.throws(() => api.decodeMedia({ mimetype: "image/webp", base64: Buffer.from("invalid webp").toString("base64") }, "stickerMessage"), /não corresponde/)
  state.role = "financeiro"; await assert.rejects(api.authorizedMediaMessage(stickerId), /permissão/)
  state.role = "operacao"
  await sql`update whatsapp_messages set instance='other-instance' where id=${stickerId}`
  await assert.rejects(api.authorizedMediaMessage(stickerId), /não encontrado/)
  assert.throws(() => api.decodeMedia({ mimetype:"image/png",base64:Buffer.from("not a png").toString("base64") },"imageMessage"), /não corresponde/)
  assert.throws(() => api.decodeMedia({ mimetype:"text/html",base64:"YWJj" },"documentMessage"), /não suportado/)
  assert.throws(() => api.decodeMedia({ mimetype:"audio/ogg",base64:"!" },"audioMessage"), /inválido/)
  assert.throws(() => api.decodeMedia({ mimetype:"audio/ogg",base64:"A".repeat(17*1024*1024) },"audioMessage"), /12 MB/)
  for (const mime of ["image/png", "application/pdf", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"]) {
    globalThis.fetch = async (_url, opts) => { const body=JSON.parse(opts.body); assert.equal(body.store,false); assert.ok(body.input[0].content[1][mime.startsWith("image/") ? "image_url" : "file_data"].startsWith(`data:${mime};base64,`)); return Response.json({status:"completed",output:[{content:[{type:"output_text",text:"Conteúdo extraído"}]}]}) }
    assert.equal((await api.readMedia({ bytes:Buffer.from("fixture"),mime,filename:"test.file" })).text,"Conteúdo extraído")
  }
  globalThis.fetch = async () => Response.json({status:"incomplete",output:[]})
  await assert.rejects(api.readMedia({ bytes:Buffer.from("fixture"),mime:"application/pdf",filename:"test.pdf" }), /não foi concluída/)
  console.log("OK | Mídias: autorização, isolamento, transcrição, leitura de documentos/imagens, cache, concorrência, formatos e falhas")
} finally {
  globalThis.fetch = fetchOriginal
  await api?.close()
  await sql.end()
  await base.unsafe(`drop schema if exists "${schema}" cascade`)
  await base.end()
}
