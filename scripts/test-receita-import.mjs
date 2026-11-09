import test from 'node:test'
import assert from 'node:assert/strict'
import { build } from 'esbuild'
import { mkdir } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'
import path from 'node:path'
const dir = path.resolve('node_modules/.cache/receita-import-tests')
await mkdir(dir, { recursive: true })
const outfile = path.join(dir, 'actions.mjs')
const fixtures = {
  '@/lib/auth/session': 'export async function requireUser(){return {id:"actor",role:globalThis.__receitaRole}}',
  '@/lib/db': `export const crmRecords={resource:'resource',deleted:'deleted'};export const db={select(){return {from(){return {where:async()=>globalThis.__receitaExisting}}}},insert(){let value;return {values(v){value=v;return this},onConflictDoNothing(){return this},async returning(){globalThis.__receitaWrites.push(value);return [{id:value.id}]}}}}`,
  '@/lib/integrations/webhooks': 'export async function dispatchCrmEvent(event,lead){globalThis.__receitaEvents.push({event,id:lead.id})}',
}
await build({ entryPoints: ['lib/prospecting/actions.ts'], outfile, bundle: true, platform: 'node', format: 'esm', packages: 'external', logLevel: 'silent', plugins: [{ name: 'fixtures', setup(p) {
  p.onResolve({ filter: /^@\/lib\/(auth\/session|db|integrations\/webhooks)$/ }, args => ({ path: args.path, namespace: 'fixture' }))
  p.onLoad({ filter: /.*/, namespace: 'fixture' }, args => ({ loader: 'js', contents: fixtures[args.path] }))
} }] })
const actions = await import(pathToFileURL(outfile).href)
test('importação da Receita valida acesso, preserva origem e deduplica com leads do Maps', async () => {
  const original = globalThis.fetch
  globalThis.__receitaRole = 'admin'; globalThis.__receitaExisting = []; globalThis.__receitaWrites = []; globalThis.__receitaEvents = []
  const company = { id: 'cnpj_00000001000100', cnpj: '00000001000100', nome: 'Empresa fictícia', origem: 'receita_federal', competencia: '2026-10', telefone: '71999990000', whatsapp: '', email: 'empresa@example.invalid', categoria: 'Odontologia', cidade: 'Salvador', uf: 'BA' }
  let requests = 0
  try {
    globalThis.fetch = async (url, options) => {
      requests++
      assert.ok(url.endsWith('/api/receita/selecionar'))
      assert.deepEqual(JSON.parse(options.body), { ids: [company.cnpj] })
      return Response.json([company])
    }
    const result = await actions.importReceitaProspects([company.cnpj, company.cnpj])
    assert.equal(result.imported.length, 1)
    assert.equal(result.skipped, 0)
    assert.equal(result.imported[0].id, 'cnpj_' + company.cnpj)
    assert.equal(result.imported[0].utm.source, 'receita_federal')
    assert.equal(globalThis.__receitaWrites[0].data.prospecting.cnae, company.cnae)
    assert.equal(globalThis.__receitaWrites[0].data.prospecting.competencia, '2026-10')
    assert.equal(globalThis.__receitaEvents.length, 1)
    globalThis.__receitaExisting = [{ id: 'maps_existing', data: { whatsapp: '+55 (71) 99999-0000' } }]
    const duplicate = await actions.importReceitaProspects([company.cnpj])
    assert.equal(duplicate.imported.length, 0)
    assert.equal(duplicate.skipped, 1)
    assert.equal(globalThis.__receitaWrites.length, 1)
    const before = requests
    await assert.rejects(actions.importReceitaProspects(['invalid']))
    globalThis.__receitaRole = 'operacao'
    await assert.rejects(actions.importReceitaProspects([company.cnpj]), /Sem permissão/)
    await assert.rejects(actions.getReceitaStatus(), /Sem permissão/)
    await assert.rejects(actions.searchReceita({ uf: 'BA', cidade: '', cnae: '', secundarios: false, page: 1 }), /Sem permissão/)
    assert.equal(requests, before)
  } finally { globalThis.fetch = original }
})
