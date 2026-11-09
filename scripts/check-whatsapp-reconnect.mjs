// Postgres isolado; Evolution simulada. Nenhuma mensagem real e enviada.
import {config} from 'dotenv'
import postgres from 'postgres'
import {build} from 'esbuild'
import {mkdir} from 'node:fs/promises'
import {randomBytes} from 'node:crypto'
import {pathToFileURL} from 'node:url'
import path from 'node:path'
import assert from 'node:assert/strict'
config({path:'.env.local',quiet:true})
const database=process.env.DATABASE_URL
assert.ok(database&&['127.0.0.1','localhost'].includes(new URL(database).hostname),'Somente banco local')
const base=postgres(database,{max:1,onnotice:()=>{}})
const schema='whatsapp_reconnect_'+randomBytes(6).toString('hex')
const url=new URL(database);url.searchParams.set('search_path',schema)
const sql=postgres(url.toString(),{max:1,onnotice:()=>{}})
let api
try{
 await base.unsafe(`create schema "${schema}"`)
 for(const table of ['whatsapp_messages','whatsapp_contacts','crm_records'])await base.unsafe(`create table "${schema}"."${table}" (like public."${table}" including all)`)
 process.env.DATABASE_URL=url.toString()
 process.env.EVOLUTION_INSTANCE='reconnect-fixture'
 process.env.EVOLUTION_URL='http://fixture.invalid'
 process.env.EVOLUTION_API_KEY='fixture-only'
 process.env.EVOLUTION_WEBHOOK_URL='https://fixture.invalid/webhook'
 process.env.EVOLUTION_WEBHOOK_TOKEN='fixture-only'
 globalThis.__reconnect={state:'close',historyCalls:0}
 const raw={key:{id:'old-fixture',remoteJid:'5511999999999@s.whatsapp.net',fromMe:false},message:{conversation:'Mensagem ficticia antiga'},messageTimestamp:1800000000}
 globalThis.__reconnect.raw=raw
 const dir=path.resolve('node_modules/.cache/whatsapp-reconnect');await mkdir(dir,{recursive:true});const outfile=path.join(dir,'check.mjs')
 await build({stdin:{contents:'export {getWhatsappInbox,connectWhatsapp,disconnectWhatsapp} from "./lib/whatsapp/actions"; export {reconcileWhatsappHistory} from "./lib/whatsapp/sync"; export {storeMessages} from "./lib/whatsapp/storage";import {db} from "./lib/db";export async function close(){await db.$client.end()}',resolveDir:process.cwd()},outfile,bundle:true,platform:'node',format:'esm',packages:'external',logLevel:'silent',plugins:[{name:'transports',setup(p){
  p.onResolve({filter:/^@\/lib\/auth\/session$/},()=>({path:'auth',namespace:'fixture'}))
  p.onResolve({filter:/^\.\/client$/},()=>({path:'client',namespace:'fixture'}))
  p.onLoad({filter:/.*/,namespace:'fixture'},args=>({loader:'js',contents:args.path==='auth'?'export async function requireUser(){return {role:"admin",id:"fixture"}}':`export class EvolutionError extends Error{};export function evolutionConfig(){return {instance:"reconnect-fixture"}};export async function evolutionRequest(path,method){const s=globalThis.__reconnect;if(path.startsWith('/instance/connectionState/'))return {instance:{state:s.state}};if(path.startsWith('/chat/findMessages/')){s.historyCalls++;return {messages:{records:[s.raw],pages:1}}}if(path.startsWith('/instance/logout/')){s.state='close';return {}}if(path.startsWith('/instance/connect/')){s.state='connecting';return {base64:'data:image/png;base64,fixture'}}if(path.startsWith('/webhook/set/'))return {};throw Error('Requisicao inesperada: '+path)}` }))
 }}]})
 api=await import(pathToFileURL(outfile).href)
 await api.storeMessages('reconnect-fixture',[raw])
 assert.equal((await sql`select * from whatsapp_messages`).length,1)
 assert.deepEqual(await api.getWhatsappInbox(),[],'Desconectado nao exibe historico antigo')
 await assert.rejects(api.reconcileWhatsappHistory(),/QR Code/)
 assert.equal(globalThis.__reconnect.historyCalls,0,'Desconectado nao consulta nem reimporta historico')
 const qr=await api.connectWhatsapp();assert.ok(qr.image.startsWith('data:image/png;base64,'));assert.equal(qr.connection.state,'connecting')
 assert.deepEqual(await api.getWhatsappInbox(),[],'Aguardando QR continua sem conversas')
 globalThis.__reconnect.state='open'
 assert.equal((await api.getWhatsappInbox()).length,1)
 const calls=globalThis.__reconnect.historyCalls;assert.ok(calls>0)
 await api.disconnectWhatsapp()
 assert.deepEqual(await api.getWhatsappInbox(),[])
 await assert.rejects(api.reconcileWhatsappHistory(),/QR Code/)
 assert.equal(globalThis.__reconnect.historyCalls,calls)
 console.log('OK | WhatsApp: desconectado nao importa historico, gera QR Code, sincroniza apos conectar e limpa a exibicao ao desconectar')
}finally{await api?.close();await sql.end();await base.unsafe(`drop schema if exists "${schema}" cascade`);await base.end()}
