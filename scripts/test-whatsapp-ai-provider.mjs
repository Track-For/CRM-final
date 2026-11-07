import { test } from 'node:test'
import assert from 'node:assert/strict'
import { build } from 'esbuild'
import { mkdir } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'
import path from 'node:path'
const dir=path.resolve('.next/whatsapp-ai-unit');await mkdir(dir,{recursive:true})
const outfile=path.join(dir,'provider.mjs')
await build({entryPoints:['lib/ai/provider.ts'],outfile,bundle:true,platform:'node',format:'esm',packages:'external',logLevel:'silent',plugins:[{name:'credentials',setup(p){p.onResolve({filter:/^\.\/settings$/},()=>({path:'settings',namespace:'fixture'}));p.onLoad({filter:/.*/,namespace:'fixture'},()=>({contents:'export async function aiCredentials(){return process.env.OPENAI_API_KEY && process.env.OPENAI_MODEL ? {key:process.env.OPENAI_API_KEY,model:process.env.OPENAI_MODEL}:null}',loader:'js'}))}}]})
const {requestConversationAnalysis}=await import(pathToFileURL(outfile).href)
test('provedor de IA trata falhas, limites, recusas e saída incompleta sem expor credenciais',async()=>{
 const original=globalThis.fetch,key=process.env.OPENAI_API_KEY,model=process.env.OPENAI_MODEL
 process.env.OPENAI_API_KEY='synthetic-secret';process.env.OPENAI_MODEL='synthetic-model'
 try {
  globalThis.fetch=async()=>{throw Error('synthetic-secret')}
  await assert.rejects(requestConversationAnalysis({}),e=>!e.message.includes('synthetic-secret')&&/consultar/.test(e.message))
  globalThis.fetch=async()=>new Response('synthetic-secret',{status:429})
  await assert.rejects(requestConversationAnalysis({}),/limite/)
  globalThis.fetch=async()=>new Response('synthetic-secret',{status:401})
  await assert.rejects(requestConversationAnalysis({}),/recusou/)
  globalThis.fetch=async()=>Response.json({status:'incomplete',output:[]})
  await assert.rejects(requestConversationAnalysis({}),/não concluiu/)
  globalThis.fetch=async()=>Response.json({status:'completed',output:[{content:[{type:'refusal',refusal:'Não'}]}]})
  await assert.rejects(requestConversationAnalysis({}),/não retornou/)
  globalThis.fetch=async()=>Response.json({status:'completed',output:[{content:[{type:'output_text',text:'{'}]}]})
  await assert.rejects(requestConversationAnalysis({}),/inválida/)
 } finally {
  globalThis.fetch=original
  if(key===undefined)delete process.env.OPENAI_API_KEY;else process.env.OPENAI_API_KEY=key
  if(model===undefined)delete process.env.OPENAI_MODEL;else process.env.OPENAI_MODEL=model
 }
})
