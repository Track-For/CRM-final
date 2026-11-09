import test from 'node:test'
import assert from 'node:assert/strict'
import { build } from 'esbuild'
import { mkdir } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'
import path from 'node:path'
const dir = path.resolve('node_modules/.cache/message-paragraph-tests')
await mkdir(dir, { recursive: true })
const outfile = path.join(dir, 'paragraphs.mjs')
await build({ entryPoints: ['lib/messages/paragraphs.ts'], outfile, bundle: true, platform: 'node', format: 'esm', logLevel: 'silent' })
const { whatsappMessageParts } = await import(pathToFileURL(outfile).href)
test('linhas em branco delimitam caixas; quebras simples e conteúdo são preservados', () => {
  assert.deepEqual(whatsappMessageParts('  Oi\nClínica Alpha\r\n\t\r\nSou Luiz.\r\n\r\n\r\nPosso perguntar?  ', true), ['Oi\nClínica Alpha', 'Sou Luiz.', 'Posso perguntar?'])
  assert.deepEqual(whatsappMessageParts('Primeiro\n\nSegundo', false), ['Primeiro\n\nSegundo'])
  assert.deepEqual(whatsappMessageParts(' \n\n ', true), [])
})
