// Consulta a base local sem criar leads nem consultar serviços comerciais.
import assert from 'node:assert/strict'
import { config } from 'dotenv'
config({ path: '.env.local', quiet: true })
const base = (process.env.PROSPECTING_URL || 'http://127.0.0.1:8091').replace(/\/$/, '')
async function request(path, data) {
  const response = await fetch(base + path, {
    method: data ? 'POST' : 'GET',
    headers: { 'Content-Type': 'application/json', ...(process.env.PROSPECTING_TOKEN ? { Authorization: `Bearer ${process.env.PROSPECTING_TOKEN}` } : {}) },
    body: data ? JSON.stringify(data) : undefined,
    signal: AbortSignal.timeout(15000),
  })
  assert.ok(response.ok, `${path}: HTTP ${response.status}`)
  return response.json()
}
const status = await request('/api/receita/status')
assert.equal(status.loaded, true, 'Base da Receita ainda não carregada')
const before = await request('/api/leads')
const options = await request('/api/receita/cnaes?q=odontologica')
assert.ok(options.some(option => option.codigo === '8630504'))
const result = await request('/api/receita/buscar', { uf: status.uf === 'BR' ? 'BA' : status.uf, cidade: status.city || '', cnae: '8630504', secundarios: true, page: 1 })
assert.ok(result.items.length <= 50)
assert.ok(result.items.every(p => p.origem === 'receita_federal' && p.whatsapp === '' && p.competencia === status.month && p.uf === (status.uf === 'BR' ? 'BA' : status.uf)))
if (result.items.length) {
  const selected = await request('/api/receita/selecionar', { ids: [result.items[0].cnpj] })
  assert.equal(selected[0].cnpj, result.items[0].cnpj)
}
const after = await request('/api/leads')
assert.equal(after.length, before.length, 'Consulta não pode criar leads')
const probes = []
if (status.uf === 'BR') {
  for (const [uf, cidade] of [['BA', 'Salvador'], ['SP', 'São Paulo'], ['GO', 'Goiânia']]) {
    const response = await request('/api/receita/buscar', { uf, cidade, cnae: '8630504', secundarios: true, page: 1 })
    assert.ok(response.total > 0, `${cidade}/${uf}: esperados estabelecimentos na amostra real`)
    assert.ok(response.items.every(p => p.uf === uf))
    probes.push({ uf, cidade, total: response.total })
  }
}
const { regions, ...metadata } = status
console.log(JSON.stringify({ status: metadata, ufsDisponiveis: Object.keys(regions || {}), cnae: '8630504', totalNoCnae: result.total, pagina: result.items.length, cidadesVerificadas: probes, leadsCriados: after.length - before.length }, null, 2))
