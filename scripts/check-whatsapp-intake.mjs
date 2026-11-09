// Triagem em schema isolado; IA simulada. Não envia mensagens nem usa créditos reais.
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
assert.ok(['127.0.0.1','localhost'].includes(new URL(database).hostname),'Somente banco local')
const base=postgres(database,{max:1,onnotice:()=>{}})
const schema='intake_test_'+randomBytes(6).toString('hex')
const url=new URL(database);url.searchParams.set('search_path',schema)
const sql=postgres(url.toString(),{max:1,onnotice:()=>{}})
let api
try{
 await base.unsafe(`create schema "${schema}"`)
 for(const table of ['users','crm_records','whatsapp_messages','whatsapp_contacts'])await base.unsafe(`create table "${schema}"."${table}" (like public."${table}" including all)`)
 await sql`insert into users(id,name,email,password_hash,role) values('actor','Equipe','intake@example.invalid','disabled','admin')`
 process.env.DATABASE_URL=url.toString();process.env.EVOLUTION_INSTANCE='intake-fixture'
 globalThis.__intakeRole='admin';globalThis.__intakeConfigured=true;globalThis.__intakeCalls=0
 const dir=path.resolve('node_modules/.cache/intake-check');await mkdir(dir,{recursive:true});const outfile=path.join(dir,'check.mjs')
 await build({stdin:{contents:'export * from "./lib/whatsapp/intake"; export * from "./lib/whatsapp/intake-actions"; export * from "./lib/whatsapp/intake-model"; export {storeMessages,learnContactMappings} from "./lib/whatsapp/storage"; import {db} from "./lib/db";export async function close(){await db.$client.end()}',resolveDir:process.cwd()},outfile,bundle:true,platform:'node',format:'esm',packages:'external',logLevel:'silent',plugins:[{name:'fixtures',setup(p){
 p.onResolve({filter:/^@\/lib\/auth\/session$/},()=>({path:'auth',namespace:'fixture'}));p.onResolve({filter:/^@\/lib\/ai\/provider$/},()=>({path:'ai',namespace:'fixture'}));p.onLoad({filter:/.*/,namespace:'fixture'},args=>({loader:'js',contents:args.path==='auth'?'export async function requireUser(){return {id:"actor",role:globalThis.__intakeRole}}':'export async function aiConfigured(){return globalThis.__intakeConfigured};export async function requestIntakeClassification(context){globalThis.__intakeCalls++;if(globalThis.__intakeDelay)await globalThis.__intakeDelay();if(globalThis.__intakeError)throw Error("Falha sintética de IA");return {...globalThis.__intakeResult,evidence:globalThis.__badEvidence?["fake"]:context.messages.filter(m=>m.direction==="in").slice(-1).map(m=>m.id)}}'}))
 }}]})
 api=await import(pathToFileURL(outfile).href)
 const initial={category:'commercial',confidence:.98,buyerIntent:true,summary:'Quer orçamento de site',nextStep:'Perguntar escopo e prazo',evidence:[]}
 const raw=(id,phone,text,extra={})=>({key:{id,fromMe:false,remoteJid:`${phone}@s.whatsapp.net`},pushName:'Contato sintético',message:{conversation:text},messageTimestamp:Math.floor(Date.now()/1000),...extra})
 const read=async phone=>(await sql`select data from crm_records where resource='whatsappIntake' and id=${api.intakeId('intake-fixture',phone)}`)[0]?.data
 const mature=()=>sql`update crm_records set updated_at=now()-interval '11 seconds' where resource='whatsappIntake' and data->>'state'='pending'`
 const runIntake=async()=>{await mature();await api.processWhatsappIntake(20)}
 const leadCount=async()=>Number((await sql`select count(*) as n from crm_records where resource='leads' and deleted=false`)[0].n)
 globalThis.__intakeResult=initial
 await api.storeMessages('intake-fixture',[raw('buyer','5511991112222','Quero orçamento para um site')])
 await mature();await Promise.all([api.processWhatsappIntake(),api.processWhatsappIntake()])
 assert.equal(await leadCount(),1);assert.equal(globalThis.__intakeCalls,1)
 const buyer=await read('5511991112222');assert.equal(buyer.category,'commercial');assert.ok(buyer.leadId)
 const [lead]=await sql`select data from crm_records where resource='leads' and id=${buyer.leadId}`
 assert.equal(lead.data.source,'whatsapp');assert.equal(lead.data.status,'novo');assert.equal(lead.data.intakeSummary,initial.summary)
 assert.equal((await sql`select * from crm_records where resource='notes' and data->>'leadId'=${buyer.leadId}`)[0].data.text.includes(initial.summary),true)
 assert.equal((await sql`select * from crm_records where resource='deals'`).length,0)
 assert.equal((await sql`select * from crm_records where resource='automationEvents'`).length,1)
 await api.storeMessages('intake-fixture',[raw('buyer','5511991112222','Quero orçamento para um site')]);await runIntake();assert.equal(await leadCount(),1)
 for(const [category,phone,text]of [['supplier','5511991112223','Ofereço consultoria'],['support','5511991112224','Meu site parou'],['spam','5511991112225','Promoção'],['unclassified','5511991112226','Olá']]){
  globalThis.__intakeResult={...initial,category,buyerIntent:false};await api.storeMessages('intake-fixture',[raw(category,phone,text)]);await runIntake();assert.equal((await read(phone)).category,category)
 }
 assert.equal(await leadCount(),1)
 globalThis.__intakeResult={...initial,confidence:.6};await api.storeMessages('intake-fixture',[raw('uncertain','5511991112227','Vamos conversar')]);await runIntake();assert.equal((await read('5511991112227')).state,'review');assert.equal(await leadCount(),1)
 const client={id:'client',name:'Cliente existente',whatsapp:'5511991112228'}
 await sql`insert into crm_records(resource,id,data) values('clients','client',${sql.json(client)})`
 const calls=globalThis.__intakeCalls;await api.storeMessages('intake-fixture',[raw('client',client.whatsapp,'Preciso de atendimento')]);await runIntake();assert.equal((await read(client.whatsapp)).clientId,'client');assert.equal(globalThis.__intakeCalls,calls)
 await sql`insert into crm_records(resource,id,data) values('leads','duplicate-a',${sql.json({id:'duplicate-a',whatsapp:'5511991112229'})}),('leads','duplicate-b',${sql.json({id:'duplicate-b',whatsapp:'5511991112229'})})`
 await api.storeMessages('intake-fixture',[raw('ambiguous','5511991112229','Quero um site')]);await runIntake();assert.match((await read('5511991112229')).reason,/Mais de um cadastro/)
 await api.storeMessages('intake-fixture',[raw('out','5511991112230','Posso vender meu serviço?',{key:{id:'out',fromMe:true,remoteJid:'5511991112230@s.whatsapp.net'}}),raw('group','5511991112230','Quero site',{key:{id:'group',remoteJid:'1@g.us'}}),raw('lid','5511991112230','Quero site',{key:{id:'lid',remoteJid:'123@lid'}})])
 assert.equal(await read('5511991112230'),undefined)
 globalThis.__intakeConfigured=false;await api.storeMessages('intake-fixture',[raw('no-ai','5511991112231','Quero site')]);await runIntake();assert.match((await read('5511991112231')).reason,/não configurada/)
 globalThis.__intakeConfigured=true;globalThis.__badEvidence=true;await api.storeMessages('intake-fixture',[raw('evidence','5511991112232','Quero site')]);await runIntake();assert.equal((await read('5511991112232')).state,'review');delete globalThis.__badEvidence
 const countBefore=await leadCount()
 await Promise.all([api.classifyWhatsappContact('5511991112226','commercial'),api.classifyWhatsappContact('5511991112226','commercial')]);assert.equal(await leadCount(),countBefore+1)
 await api.classifyWhatsappContact('5511991112223','supplier');await api.storeMessages('intake-fixture',[raw('supplier-again','5511991112223','Obrigado',{messageTimestamp:Math.floor(Date.now()/1000)+60})]);assert.equal((await read('5511991112223')).source,'manual');assert.equal((await read('5511991112223')).state,'classified')
 globalThis.__intakeRole='operacao';await assert.rejects(api.classifyWhatsappContact('5511991112223','commercial'),/Sem permissão/);await assert.rejects(api.retryWhatsappIntake('5511991112223'),/Sem permissão/);globalThis.__intakeRole='admin'
 globalThis.__intakeResult=initial
 await api.storeMessages('intake-fixture',[raw('lease','5511991112233','Quero site')]);await mature()
 let release;globalThis.__intakeDelay=()=>new Promise(resolve=>{release=resolve})
 const inFlight=api.processWhatsappIntake();while(!release)await new Promise(resolve=>setTimeout(resolve,10))
 await api.classifyWhatsappContact('5511991112233','support');release();await inFlight;delete globalThis.__intakeDelay
 assert.equal((await read('5511991112233')).category,'support');assert.equal((await read('5511991112233')).source,'manual')
 await api.learnContactMappings('intake-fixture',[{id:'123@lid',phoneNumber:'5511991112234@s.whatsapp.net'}]);assert.ok(await read('5511991112234'))
 console.log('OK | Triagem: intenção comercial, resumo, origem, não duplicação concorrente, fornecedores/suporte/spam, incerteza, clientes, conflitos, reentrega, LID, permissões, revisão e prioridade humana. Nenhum negócio ou mensagem enviado.')
}finally{if(api)await api.close();await sql.end();await base.unsafe(`drop schema if exists "${schema}" cascade`);await base.end()}
