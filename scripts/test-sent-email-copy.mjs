import test from 'node:test'
import assert from 'node:assert/strict'
import { build } from 'esbuild'
import { mkdir } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'
import path from 'node:path'

const dir = path.resolve('node_modules/.cache/sent-email-tests')
await mkdir(dir, { recursive: true })
const outfile = path.join(dir, 'copy.mjs')
await build({ entryPoints: ['lib/messages/sent-copy.ts'], outfile, bundle: true, platform: 'node', format: 'esm', packages: 'external', logLevel: 'silent', plugins: [{ name: 'imap-fixture', setup(p) {
  p.onResolve({ filter: /^imapflow$/ }, () => ({ path: 'imap', namespace: 'fixture' }))
  p.onLoad({ filter: /.*/, namespace: 'fixture' }, () => ({ contents: `export class ImapFlow {
    constructor(options){globalThis.__imap.options=options} on(){}
    async connect(){if(globalThis.__imap.fail==='connect')throw Error('falha')}
    async list(){return globalThis.__imap.folders}
    async mailboxOpen(path,options){globalThis.__imap.opened={path,options}}
    async search(){return globalThis.__imap.existing||[]}
    async append(path,raw,flags,date){if(globalThis.__imap.fail==='append')throw Error('falha');globalThis.__imap.copies.push({path,raw,flags,date});return globalThis.__imap.rejected?false:{uid:123}}
    async logout(){globalThis.__imap.closed=true} close(){globalThis.__imap.closed=true}
  }`, loader: 'js' }))
} }] })
const { saveSentEmail } = await import(pathToFileURL(outfile).href)
const mail = { from: 'CRM <crm@example.invalid>', to: 'contact@example.invalid', subject: 'Contato', text: 'Primeiro paragrafo\n\nSegundo paragrafo', messageId: '<fixture@example.invalid>', date: new Date('2026-11-09T18:09:50Z') }
function setup() {
  for (const key of ['IMAP_HOST','IMAP_USER','IMAP_PASS','IMAP_SENT_FOLDER','EMAIL_SAVE_SENT']) delete process.env[key]
  Object.assign(process.env, { SMTP_HOST: 'smtp.hostinger.com', SMTP_USER: 'fixture', SMTP_PASS: 'synthetic' })
  globalThis.__imap = { folders: [{ path: 'INBOX.Sent', specialUse: '\\Sent' }], copies: [] }
  return globalThis.__imap
}
test('detecta Enviados e guarda MIME com destinatário, conteúdo, ID e data do envio', async () => {
  const state = setup()
  assert.equal(await saveSentEmail(mail), '')
  assert.equal(state.options.host, 'imap.hostinger.com')
  assert.equal(state.options.secure, true)
  assert.equal(state.options.logger, false)
  assert.equal(state.copies.length, 1)
  const copy = state.copies[0]
  assert.equal(copy.path, 'INBOX.Sent')
  assert.deepEqual(copy.flags, ['\\Seen'])
  assert.equal(copy.date, mail.date)
  const raw = copy.raw.toString()
  for (const field of ['To: contact@example.invalid', 'Message-ID: <fixture@example.invalid>', 'Primeiro paragrafo', 'Segundo paragrafo']) assert.ok(raw.includes(field), field)
  assert.equal(state.closed, true)
})
test('não duplica um Message-ID que já existe em Enviados', async () => {
  const state = setup(); state.existing = [42]
  assert.equal(await saveSentEmail(mail), '')
  assert.equal(state.copies.length, 0)
})
test('pasta explícita e provedores com salvamento automático são respeitados', async () => {
  const state = setup(); process.env.IMAP_SENT_FOLDER = 'Personal/Sent'
  assert.equal(await saveSentEmail(mail), '')
  assert.equal(state.copies[0].path, 'Personal/Sent')
  setup(); process.env.EMAIL_SAVE_SENT = 'false'
  assert.equal(await saveSentEmail(mail), '')
  assert.equal(globalThis.__imap.options, undefined)
})
test('falha na cópia retorna aviso sem orientar reenvio nem lançar erro de envio', async () => {
  for (const failure of ['connect', 'append', 'missing-folder', 'rejected']) {
    const state = setup(); state.fail = failure
    if (failure === 'missing-folder') state.folders = []
    if (failure === 'rejected') state.rejected = true
    assert.match(await saveSentEmail(mail), /Não reenvie/)
    assert.equal(state.closed, true)
  }
  setup(); delete process.env.SMTP_PASS
  assert.match(await saveSentEmail(mail), /configuração IMAP/)
})
