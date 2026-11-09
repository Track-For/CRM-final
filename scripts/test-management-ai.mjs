import { test } from 'node:test'
import assert from 'node:assert/strict'
import { build } from 'esbuild'
import { mkdir } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'
import path from 'node:path'

const dir = path.resolve('.next/management-ai-unit')
await mkdir(dir, { recursive: true })
const outfile = path.join(dir, 'model.mjs')
await build({ entryPoints: ['lib/ai/management-model.ts'], outfile, bundle: true, platform: 'node', format: 'esm', packages: 'external', logLevel: 'silent' })
const { buildManagementContext, validateManagementAnalysis, managementPromptSchema } = await import(pathToFileURL(outfile).href)
const now = new Date('2026-11-09T12:00:00Z')
const row = (resource, id, data, deleted = false) => ({ resource, id, data, deleted })
const rows = [
  row('leads', 'l1', { name: 'Clínica', status: 'novo', updatedAt: '2026-11-01', whatsapp: 'PRIVATE_PHONE', email: 'PRIVATE_EMAIL', apiKey: 'PRIVATE_SECRET' }),
  row('leads', 'converted', { status: 'convertido' }),
  row('deals', 'd1', { title: 'Site', stage: 'negociacao', value: 5000, stageChangedAt: '2026-10-01', paymentPlan: { pixKey: 'PRIVATE_PIX' } }),
  row('deals', 'won', { stage: 'ganho' }),
  row('quotes', 'q1', { number: 'ORC-1', status: 'enviado', total: 1200, notes: 'PRIVATE_NOTES' }),
  row('quotes', 'draft', { status: 'rascunho' }),
  row('charges', 'c1', { number: 'COB-1', status: 'pendente', amount: 123.45, dueDate: '2026-11-08', pixCode: 'PRIVATE_PIX' }),
  row('charges', 'paid', { status: 'pago' }),
  row('charges', 'reverted', { status: 'pendente', conversionReverted: true }),
  row('projects', 'p1', { name: 'Portal', status: 'em_andamento', stages: [{ status: 'bloqueada' }], deliveryDate: '2026-11-01' }),
  row('tasks', 't1', { title: 'Retomar proposta', status: 'todo', dueDate: '2026-11-08', comments: ['PRIVATE_NOTES'] }),
  row('tasks', 'done', { status: 'done' }),
  row('tasks', 'deleted', { status: 'todo' }, true),
  row('settings', 'credentials', { secret: 'PRIVATE_SECRET' }),
]

test('contexto de gestão respeita permissões e envia apenas projeções explícitas', () => {
  const admin = buildManagementContext(rows, 'admin', now)
  assert.equal(admin.records.length, 6)
  assert.ok(!JSON.stringify(admin).includes('PRIVATE_'))
  assert.equal(admin.records.find(r => r.id === 'c1').facts.status, 'vencido')
  assert.equal(admin.records.find(r => r.id === 'p1').facts.blockedStages, 1)
  const sales = buildManagementContext(rows, 'comercial', now)
  assert.ok(!sales.records.some(r => r.resource === 'charges'))
  assert.ok(!sales.coverage.some(r => r.resource === 'charges'))
  const operations = buildManagementContext(rows, 'operacao', now)
  assert.deepEqual(operations.coverage.map(r => r.resource), ['projects', 'tasks'])
  assert.ok(!JSON.stringify(operations).includes('5000'))
})

test('amostras são limitadas, determinísticas e informam o total real elegível', () => {
  const many = Array.from({ length: 30 }, (_, i) => row('leads', String(i), { name: 'Lead', status: 'novo', updatedAt: `2026-10-${String(i + 1).padStart(2, '0')}` }))
  const context = buildManagementContext(many.reverse(), 'admin', now)
  assert.equal(context.records.length, 20)
  assert.equal(context.records[0].id, '0')
  assert.deepEqual(context.coverage[0], { resource: 'leads', total: 30, included: 20 })
})

test('recomendações exigem referências reais e compatíveis com a área', () => {
  const context = buildManagementContext(rows, 'admin', now)
  const finding = { area: 'leads', priority: 'alta', title: 'Revisar lead', observation: 'Cadastro antigo', nextStep: 'Conferir histórico antes de retomar', evidence: ['leads:l1'] }
  assert.equal(validateManagementAnalysis({ summary: 'Revisão', findings: [finding] }, context).findings.length, 1)
  assert.throws(() => validateManagementAnalysis({ summary: 'Revisão', findings: [{ ...finding, evidence: ['leads:inventado'] }] }, context), /referência válida/)
  assert.throws(() => validateManagementAnalysis({ summary: 'Revisão', findings: [{ ...finding, area: 'charges' }] }, context), /referência válida/)
  assert.throws(() => validateManagementAnalysis({ summary: 'Revisão', findings: [{ ...finding, evidence: [] }] }, context))
  assert.throws(() => validateManagementAnalysis({ summary: 'Revisão', findings: [{ ...finding, execute: 'delete' }] }, context))
  const operations = buildManagementContext(rows, 'operacao', now)
  assert.throws(() => validateManagementAnalysis({ summary: 'Revisão', findings: [finding] }, operations), /referência válida/)
})

const providerFile = path.join(dir, 'provider.mjs')
await build({ entryPoints: ['lib/ai/provider.ts'], outfile: providerFile, bundle: true, platform: 'node', format: 'esm', packages: 'external', logLevel: 'silent', plugins: [{ name: 'credentials', setup(p) {
  p.onResolve({ filter: /^\.\/settings$/ }, () => ({ path: 'credentials', namespace: 'fixture' }))
  p.onLoad({ filter: /.*/, namespace: 'fixture' }, () => ({ contents: 'export async function aiCredentials(){return {key:"synthetic-secret",model:"synthetic-model"}}', loader: 'js' }))
} }] })
const { requestManagementAnalysis } = await import(pathToFileURL(providerFile).href)
test('análise usa provedor configurado, saída estruturada e não executa ações', async () => {
  const original = globalThis.fetch
  try {
    let calls = 0
    const context = buildManagementContext(rows, 'admin', now)
    globalThis.fetch = async (url, options) => {
      calls++
      assert.equal(url, 'https://api.openai.com/v1/responses')
      const body = JSON.parse(options.body)
      assert.equal(body.store, false)
      assert.equal(body.model, 'synthetic-model')
      assert.equal(body.text.format.name, 'nexo_management_analysis')
      assert.equal(body.text.format.strict, true)
      assert.equal(body.tools, undefined)
      assert.ok(!options.body.includes('PRIVATE_'))
      assert.deepEqual(JSON.parse(body.input[0].content), { context, userPrompt: "Priorize os projetos atrasados" })
      return Response.json({ status: 'completed', output: [{ content: [{ type: 'output_text', text: JSON.stringify({ summary: 'Sem novos alertas', findings: [] }) }] }] })
    }
    const result = await requestManagementAnalysis(context, "  Priorize os projetos atrasados  ")
    assert.deepEqual(validateManagementAnalysis(result, context).findings, [])
    assert.equal(calls, 1)
    globalThis.fetch = async () => new Response('', { status: 429 })
    await assert.rejects(requestManagementAnalysis(context), /limite de uso/)
  } finally { globalThis.fetch = original }
})


test('prompt aceita análise geral e valida tamanho e tipo antes da consulta', () => {
  assert.equal(managementPromptSchema.parse('   '), '')
  assert.equal(managementPromptSchema.parse('  Foque nas vendas  '), 'Foque nas vendas')
  assert.equal(managementPromptSchema.parse('x'.repeat(2000)).length, 2000)
  assert.throws(() => managementPromptSchema.parse('x'.repeat(2001)), /2.000 caracteres/)
  assert.throws(() => managementPromptSchema.parse({ instructions: 'teste' }))
})
