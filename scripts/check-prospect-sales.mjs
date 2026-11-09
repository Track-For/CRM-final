// Banco isolado e transporte simulado: não envia mensagens nem cria vendas reais.
import { config } from 'dotenv'
import postgres from 'postgres'
import { build } from 'esbuild'
import { mkdir } from 'node:fs/promises'
import { randomBytes } from 'node:crypto'
import { pathToFileURL } from 'node:url'
import path from 'node:path'
import assert from 'node:assert/strict'
config({ path: '.env.local', quiet: true })
const database = process.env.DATABASE_URL
assert.ok(database && ['localhost', '127.0.0.1'].includes(new URL(database).hostname), 'Somente banco local')
const base = postgres(database, { max: 1, onnotice: () => {} })
const schema = 'prospect_sales_test_' + randomBytes(6).toString('hex')
const url = new URL(database); url.searchParams.set('search_path', schema)
const sql = postgres(url.toString(), { max: 1, onnotice: () => {} })
let api
try {
  await base.unsafe(`create schema "${schema}"`)
  for (const table of ['users', 'crm_records']) await base.unsafe(`create table "${schema}"."${table}" (like public."${table}" including all)`)
  await sql`insert into users(id,name,email,password_hash,role) values('actor','Equipe','actor@example.invalid','disabled','admin')`
  process.env.DATABASE_URL = url.toString()
  const dir = path.resolve('node_modules/.cache/prospect-sales-check'); await mkdir(dir, { recursive: true })
  const outfile = path.join(dir, 'actions.mjs')
  const fixtures = {
    '@/lib/auth/session': 'export async function requireUser(){return {id:"actor",role:"comercial"}}',
    '@/lib/prospecting/actions': `export async function getProspectDetail(){return {prospect:globalThis.__salesProspect}};export async function recordProspectContact(){if(globalThis.__salesHistoryFail)throw Error('Histórico indisponível');return {...globalThis.__salesProspect,status:'contatado'}}`,
    '@/lib/integrations/webhooks': 'export async function dispatchCrmEvent(event,payload){globalThis.__salesEvents.push({event,id:payload.id})}',
    '@/lib/whatsapp/actions': `export async function sendWhatsappText(){if(globalThis.__salesSendFail)throw Error('Falha sintética de envio');globalThis.__salesSends++}`,
  }
  await build({ stdin: { contents: 'export {sendProspectMessage} from "./lib/messages/prospect-actions";export {registerProspectContactInSales} from "./lib/prospecting/contact-sales";import {db} from "./lib/db";export async function close(){await db.$client.end()}', resolveDir: process.cwd() }, outfile, bundle: true, platform: 'node', format: 'esm', packages: 'external', logLevel: 'silent', plugins: [{ name: 'fixtures', setup(p) {
    p.onResolve({ filter: /.*/ }, args => args.path in fixtures ? { path: args.path, namespace: 'fixture' } : undefined)
    p.onLoad({ filter: /.*/, namespace: 'fixture' }, args => ({ contents: fixtures[args.path], loader: 'js' }))
  } }] })
  api = await import(pathToFileURL(outfile).href)
  globalThis.__salesProspect = { id: 'sales-fixture', nome: 'Empresa fictícia', telefone: '11999999999', whatsapp: '', email: 'empresa@example.invalid', categoria: 'Clínica', cidade: 'São Paulo', uf: 'SP', site: '', maps: '', nota: '', avaliacoes: 0, buscas: [] }
  globalThis.__salesEvents = []; globalThis.__salesSends = 0
  const input = { prospectId: 'sales-fixture', channel: 'whatsapp', expectedRecipient: '11999999999', subject: '', text: 'Contato sintético' }
  globalThis.__salesSendFail = true
  await assert.rejects(api.sendProspectMessage(input), /Falha sintética/)
  assert.equal((await sql`select * from crm_records`).length, 0)
  globalThis.__salesSendFail = false
  const first = await api.sendProspectMessage(input)
  assert.equal(first.warning, '')
  assert.equal(first.sales.lead.status, 'em_contato')
  assert.equal(first.sales.deal.stage, 'contato_feito')
  assert.equal(first.sales.deal.probability, 20)
  assert.equal(first.sales.deal.value, 0)
  assert.equal(first.sales.deal.expectedCloseDate, '')
  assert.equal(first.sales.activity.dealId, first.sales.deal.id)
  const repeated = await Promise.all([api.sendProspectMessage(input), api.sendProspectMessage(input)])
  assert.ok(repeated.every(r => r.sales.deal.id === first.sales.deal.id))
  assert.equal((await sql`select * from crm_records where resource='leads'`).length, 1)
  assert.equal((await sql`select * from crm_records where resource='deals'`).length, 1)
  assert.equal((await sql`select * from crm_records where resource='activities'`).length, 3)
  assert.equal(globalThis.__salesEvents.filter(e => e.event === 'deal.created').length, 1)
  // Outro resultado do Maps com o mesmo contato não cria outra venda.
  globalThis.__salesProspect = { ...globalThis.__salesProspect, id: 'same-phone-other-result' }
  const matched = await api.sendProspectMessage({ ...input, prospectId: globalThis.__salesProspect.id })
  assert.equal(matched.sales.lead.id, first.sales.lead.id)
  assert.equal(matched.sales.deal.id, first.sales.deal.id)
  // Novo lead importado anteriormente avança; etapas avançadas e encerradas permanecem.
  await sql`update crm_records set data=data || '{"stage":"novo_lead","value":8500}'::jsonb where resource='deals'`
  const moved = await api.sendProspectMessage({ ...input, prospectId: globalThis.__salesProspect.id })
  assert.equal(moved.sales.deal.stage, 'contato_feito')
  assert.equal(moved.sales.deal.value, 8500)
  for (const stage of ['negociacao', 'ganho', 'perdido']) {
    await sql`update crm_records set data=data || ${sql.json({ stage })}::jsonb where resource='deals'`
    const result = await api.sendProspectMessage({ ...input, prospectId: globalThis.__salesProspect.id })
    assert.equal(result.sales.deal.stage, stage)
  }
  globalThis.__salesHistoryFail = true
  const historyFailed = await api.sendProspectMessage({ ...input, prospectId: globalThis.__salesProspect.id })
  assert.ok(historyFailed.sales)
  assert.match(historyFailed.warning, /Não reenvie/)
  // Falha na criação do negócio reverte também a criação do lead.
  await sql`delete from crm_records`
  await sql.unsafe(`alter table crm_records add constraint reject_test_deals check (resource <> 'deals')`)
  const failed = await api.sendProspectMessage({ ...input, prospectId: globalThis.__salesProspect.id })
  assert.equal(failed.sales, null)
  assert.match(failed.warning, /Não reenvie/)
  assert.equal((await sql`select * from crm_records`).length, 0)
  console.log('Envio confirmado → lead e venda em Contato feito: transação, concorrência, deduplicação, etapas existentes, atividade e falhas validadas. Nenhuma mensagem real enviada.')
} finally {
  if (api) await api.close()
  await sql.end()
  await base.unsafe(`drop schema if exists "${schema}" cascade`)
  await base.end()
}
