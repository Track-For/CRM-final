import test from 'node:test'
import assert from 'node:assert/strict'
import { prospectsForSearch } from '../lib/prospecting/search-results.ts'

const prospects = [
  { id: 'a', nome: 'Clínica A', categoria: 'Saúde', cidade: 'Salvador', buscas: ['first'] },
  { id: 'b', nome: 'Clínica B', categoria: 'Saúde', cidade: 'São Paulo', buscas: ['second'] },
  { id: 'shared', nome: 'Clínica C', categoria: 'Saúde', cidade: 'São Paulo', buscas: ['first', 'second'] },
]
test('mostra somente os contatos da extração selecionada, incluindo os compartilhados', () => {
  assert.deepEqual(prospectsForSearch(prospects, 'first').map(p => p.id), ['a', 'shared'])
  assert.deepEqual(prospectsForSearch(prospects, 'second').map(p => p.id), ['b', 'shared'])
  assert.deepEqual(prospectsForSearch(prospects, ''), [])
  assert.deepEqual(prospectsForSearch(prospects, 'deleted'), [])
})
test('filtrar por texto não traz contatos de outra extração', () => {
  assert.deepEqual(prospectsForSearch(prospects, 'first', ' Clínica B '), [])
  assert.deepEqual(prospectsForSearch(prospects, 'first', 'SÃO PAULO').map(p => p.id), ['shared'])
})
