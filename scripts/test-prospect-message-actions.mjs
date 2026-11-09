import test from 'node:test'
import assert from 'node:assert/strict'
import { build } from 'esbuild'
import { mkdir } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'
import path from 'node:path'
const dir = path.resolve('node_modules/.cache/prospect-message-tests')
await mkdir(dir, { recursive: true })
const outfile = path.join(dir, 'actions.mjs')
const mocks = {
  "./sent-copy": "export async function saveSentEmail(mail){globalThis.__pmsg.copies=(globalThis.__pmsg.copies||[]).concat(mail);return globalThis.__pmsg.copyFail?\"E-mail aceito, mas a cópia não foi salva em Enviados. Não reenvie.\":\"\"}",
  '@/lib/auth/session': 'export async function requireUser(){return globalThis.__pmsg.user}',
  '@/lib/prospecting/actions': `export async function getProspectDetail(){globalThis.__pmsg.reads++;if(globalThis.__pmsg.missing)throw Error('Empresa não encontrada');return {prospect:globalThis.__pmsg.prospect}};export async function recordProspectContact(id,channel,text){if(globalThis.__pmsg.historyFail)throw Error('Sem conexão');globalThis.__pmsg.history.push({id,channel,text});return {...globalThis.__pmsg.prospect,status:'contatado'}}`,
  '@/lib/prospecting/contact-sales': `export async function registerProspectContactInSales(prospect,actor,message){globalThis.__pmsg.salesCalls++;globalThis.__pmsg.salesMessages.push(message.text);if(globalThis.__pmsg.salesFail)throw Error('Falha sintética no banco');return {lead:{id:'maps_fixture-1'},deal:{id:'deal-fixture',stage:'contato_feito'},activity:{id:'activity-fixture'}}}`,
  '@/lib/whatsapp/actions': `export async function sendWhatsappText(phone,text){if(globalThis.__pmsg.sendFail||globalThis.__pmsg.failAt===globalThis.__pmsg.sent.length+1)throw Error('Envio não confirmado');globalThis.__pmsg.sent.push({phone,text})}`,
  nodemailer: `export default {createTransport:()=>({sendMail:async value=>{if(globalThis.__pmsg.sendFail)throw Error('SMTP indisponível');globalThis.__pmsg.sent.push(value);return {accepted:[value.to]}},close:()=>{}})}`,
}
await build({ stdin: { contents: 'export {sendProspectMessage} from "./lib/messages/prospect-actions"; export {prospectMessageValues,renderMessage,unresolvedVariables} from "./lib/messages/templates"', resolveDir: process.cwd() }, outfile, bundle: true, platform: 'node', format: 'esm', packages: 'external', logLevel: 'silent', plugins: [{ name: 'fixtures', setup(p) {
  p.onResolve({ filter: /.*/ }, args => args.path in mocks ? { path: args.path, namespace: 'fixture' } : undefined)
  p.onLoad({ filter: /.*/, namespace: 'fixture' }, args => ({ contents: mocks[args.path], loader: 'js' }))
} }] })
const api = await import(pathToFileURL(outfile).href)
const input = { prospectId: 'fixture-1', channel: 'whatsapp', expectedRecipient: '(11) 99999-9999', subject: '', text: 'Olá, Empresa Exemplo!' }
function setup() {
  globalThis.__pmsg = { user: { id: 'actor', role: 'comercial' }, prospect: { id: 'fixture-1', nome: 'Empresa Exemplo', telefone: '(11) 99999-9999', whatsapp: '', email: 'contato@example.invalid', cidade: 'São Paulo', uf: 'SP', categoria: 'Fisioterapia', site: '' }, sent: [], history: [], reads: 0, salesCalls: 0, salesMessages: [] }
  return globalThis.__pmsg
}

test('empresas usam os mesmos modelos sem inventar tipo de projeto', () => {
  const state = setup()
  const values = api.prospectMessageValues(state.prospect)
  assert.equal(api.renderMessage('Olá {nome}, da {empresa} em {cidade}.', values), 'Olá Empresa Exemplo, da Empresa Exemplo em São Paulo.')
  assert.deepEqual(api.unresolvedVariables(api.renderMessage('Quero conversar sobre {projeto}.', values)), ['{projeto}'])
})
test('bloqueia permissão, destinatário alterado, variáveis pendentes e não contatar', async () => {
  for (const role of ['financeiro', 'operacao']) {
    const s = setup(); s.user.role = role
    await assert.rejects(api.sendProspectMessage(input), /Sem permissão/)
    assert.equal(s.reads, 0); assert.equal(s.sent.length, 0)
  }
  let s = setup()
  await assert.rejects(api.sendProspectMessage({ ...input, text: 'Olá {nome}' }), /variáveis/)
  assert.equal(s.reads, 0)
  s = setup(); s.prospect.nao_contatar = true
  await assert.rejects(api.sendProspectMessage(input), /não receber contato/)
  assert.equal(s.sent.length, 0)
  s = setup(); s.prospect.telefone = '11988888888'
  await assert.rejects(api.sendProspectMessage(input), /contato da empresa mudou/)
  assert.equal(s.sent.length, 0); assert.equal(s.history.length, 0)
  s = setup(); s.missing = true
  await assert.rejects(api.sendProspectMessage(input), /não encontrada/)
  assert.equal(s.sent.length, 0)
})
test('envia ao contato salvo e cadastra em Vendas somente após confirmação', async () => {
  let s = setup()
  const result = await api.sendProspectMessage({ ...input, to: 'intruso@example.invalid' })
  assert.equal(s.sent[0].phone, s.prospect.telefone)
  assert.equal(s.history[0].id, 'fixture-1')
  assert.equal(s.history[0].channel, 'whatsapp')
  assert.equal(result.prospect.status, 'contatado')
  assert.equal(result.sales.deal.stage, 'contato_feito')
  assert.equal(s.salesCalls, 1)
  s = setup(); s.sendFail = true
  await assert.rejects(api.sendProspectMessage(input), /não confirmado/)
  assert.equal(s.history.length, 0); assert.equal(s.salesCalls, 0)
  s = setup(); s.historyFail = true
  const warning = await api.sendProspectMessage(input)
  assert.equal(s.sent.length, 1)
  assert.equal(warning.prospect, null)
  assert.match(warning.warning, /Não reenvie/)
  assert.equal(warning.sales.deal.stage, 'contato_feito')
  s = setup(); s.salesFail = true
  const registrationFailure = await api.sendProspectMessage(input)
  assert.equal(s.sent.length, 1)
  assert.equal(registrationFailure.sales, null)
  assert.match(registrationFailure.warning, /não foi possível registrar.*Vendas/)
  assert.match(registrationFailure.warning, /Não reenvie/)
})
test('e-mail usa endereço salvo e exige assunto e configuração de SMTP', async () => {
  const host = process.env.SMTP_HOST, from = process.env.EMAIL_FROM
  const email = { ...input, channel: 'email', subject: 'Contato', expectedRecipient: 'contato@example.invalid' }
  try {
    process.env.SMTP_HOST = 'smtp.example.invalid'; process.env.EMAIL_FROM = 'crm@example.invalid'
    let s = setup()
    await api.sendProspectMessage(email)
    assert.equal(s.sent[0].to, s.prospect.email)
    assert.equal(s.history[0].channel, 'email')
    s = setup()
    await assert.rejects(api.sendProspectMessage({ ...email, expectedRecipient: 'outro@example.invalid' }), /contato da empresa mudou/)
    await assert.rejects(api.sendProspectMessage({ ...email, subject: '' }), /assunto/)
    delete process.env.SMTP_HOST
    await assert.rejects(api.sendProspectMessage(email), /não foi configurado/)
    assert.equal(s.sent.length, 0)
  } finally {
    if (host === undefined) delete process.env.SMTP_HOST; else process.env.SMTP_HOST = host
    if (from === undefined) delete process.env.EMAIL_FROM; else process.env.EMAIL_FROM = from
  }
})


test('separa o exemplo em seis envios sequenciais para o mesmo destinatário', async () => {
  const state = setup()
  const paragraphs = ['Olá, Clínica Alpha! Tudo bem?', 'Sou o Luiz, da Track For.', 'Conheci a Clínica Alpha e dei uma olhada no site de vocês.', 'Trabalho com tecnologia e otimização de sites para melhorar a experiência dos visitantes e facilitar a geração de oportunidades comerciais.', 'Queria entender se vocês já acompanham os resultados que o site está trazendo para o negócio.', 'Posso te fazer uma pergunta rápida?']
  const result = await api.sendProspectMessage({ ...input, text: paragraphs.join('\n\n'), separateParagraphs: true })
  assert.deepEqual(state.sent.map(item => item.text), paragraphs)
  assert.ok(state.sent.every(item => item.phone === state.prospect.telefone))
  assert.equal(result.sentCount, 6)
  assert.equal(result.remainingText, '')
  assert.equal(state.salesCalls, 1)
  assert.equal(result.sales.deal.stage, 'contato_feito')
})
test('falha parcial não repete mensagens e registra somente a parte confirmada', async () => {
  let state = setup(); state.failAt = 3
  const result = await api.sendProspectMessage({ ...input, text: 'P1\n\nP2\n\nP3\n\nP4', separateParagraphs: true })
  assert.equal(result.sentCount, 2)
  assert.deepEqual(state.sent.map(item => item.text), ['P1', 'P2'])
  assert.equal(result.remainingText, 'P3\n\nP4')
  assert.equal(state.salesMessages[0], 'P1\n\nP2')
  assert.ok(!state.history[0].text.includes('P3'))
  assert.match(result.warning, /2 de 4 mensagens confirmadas/)
  assert.equal(result.sales.deal.stage, 'contato_feito')
  state = setup(); state.failAt = 1
  await assert.rejects(api.sendProspectMessage({ ...input, text: 'P1\n\nP2', separateParagraphs: true }))
  assert.equal(state.salesCalls, 0)
  assert.equal(state.history.length, 0)
  state = setup()
  await assert.rejects(api.sendProspectMessage({ ...input, text: Array(21).fill('Oi').join('\n\n'), separateParagraphs: true }), /no máximo 20/)
  assert.equal(state.sent.length, 0)
})
