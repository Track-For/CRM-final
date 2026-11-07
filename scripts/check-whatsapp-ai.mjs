import { config } from 'dotenv'
import postgres from 'postgres'
import { build } from 'esbuild'
import { mkdir } from 'node:fs/promises'
import { randomBytes } from 'node:crypto'
import assert from 'node:assert/strict'
import { pathToFileURL } from 'node:url'
import path from 'node:path'
config({path:'.env.local',quiet:true})
const original=process.env.DATABASE_URL
assert.ok(original && ['localhost','127.0.0.1'].includes(new URL(original).hostname),'Teste restrito ao banco local')
const schema=`wai_test_${randomBytes(6).toString('hex')}`
const base=postgres(original,{max:1,onnotice:()=>{}})
const url=new URL(original);url.searchParams.set('search_path',schema)
const sql=postgres(url.toString(),{max:1})
process.env.APP_ENCRYPTION_KEY ||= randomBytes(32).toString('base64')
let api,requests=0
const fetchOriginal=globalThis.fetch
const result={summary:'Cliente deseja um site e aguarda retorno.',qualification:{status:'qualificado',temperature:'quente',projectType:'site',reason:'Pedido explícito de site',evidence:['m1']},tasks:[{title:'Retornar sobre o site',description:'Conversar sobre os próximos passos',dueDate:null,evidence:['m1']}],stage:{key:'contato_feito',reason:'Primeiro contato realizado',evidence:['m1']}}
try {
 await base.unsafe(`create schema "${schema}"`)
 for(const table of ['users','crm_records','whatsapp_messages']) await base.unsafe(`create table "${schema}"."${table}" (like public."${table}" including all)`)
 await sql`insert into users(id,name,email,password_hash,role) values('actor','Teste','ai@example.invalid','disabled','admin')`
 const lead={id:'lead',name:'Contato sintético',whatsapp:'5511987654321',status:'novo',temperature:'frio',projectType:'outros'}
 const deal={id:'deal',title:'Site sintético',leadId:'lead',pipelineId:'pip_sites',stage:'novo_lead',history:[]}
 for(const [resource,data] of [['leads',lead],['deals',deal]]) await sql`insert into crm_records(resource,id,data) values(${resource},${data.id},${sql.json(data)})`
 await sql`insert into whatsapp_messages(id,instance,provider_id,remote_jid,phone,direction,text,sent_at) values('m1',${process.env.EVOLUTION_INSTANCE||'crm-principal'},'m1','5511987654321@s.whatsapp.net','5511987654321','in','Quero um site, vamos conversar?',now())`
 await sql`insert into whatsapp_messages(id,instance,provider_id,remote_jid,phone,direction,text,sent_at) values('other','crm-principal','other','5511888888888@s.whatsapp.net','5511888888888','in','SEGREDO_OUTRO_CONTATO',now())`
 const dir=path.resolve('.next/whatsapp-ai-check');await mkdir(dir,{recursive:true})
 const outfile=path.join(dir,'actions.mjs')
 await build({stdin:{contents:'export * from "./lib/ai/whatsapp-actions"; export * from "./lib/ai/settings-actions"; export * from "./lib/ai/whatsapp-schema"; import {db} from "./lib/db"; export async function closeDatabase(){await db.$client.end()}',resolveDir:process.cwd(),sourcefile:'ai-check.ts'},outfile,bundle:true,platform:'node',format:'esm',packages:'external',logLevel:'silent',plugins:[{name:'auth-fixture',setup(p){p.onResolve({filter:/^@\/lib\/auth\/session$/},()=>({path:'auth',namespace:'fixture'}));p.onResolve({filter:/^@\/lib\/integrations\/webhooks$/},()=>({path:'webhook',namespace:'fixture'}));p.onLoad({filter:/.*/,namespace:'fixture'},a=>({contents:a.path==='auth'?'export async function requireUser(){return {id:process.env.AI_USER||"actor",role:process.env.AI_ROLE||"admin"}}':'export async function dispatchCrmEvent(){}',loader:'js'}))}}]})
 process.env.DATABASE_URL=url.toString()
 api=await import(pathToFileURL(outfile).href)
 delete process.env.OPENAI_API_KEY;delete process.env.OPENAI_MODEL
 assert.equal((await api.getWhatsappAiAvailability()).configured,false)
 await assert.rejects(api.analyzeWhatsappConversation(lead.whatsapp),/IA pendente/)
 process.env.AI_ROLE='operacao';await assert.rejects(api.getWhatsappAiAvailability(),/Sem permissão/);delete process.env.AI_ROLE
 process.env.OPENAI_API_KEY='synthetic-not-real';process.env.OPENAI_MODEL='synthetic-model'
 globalThis.fetch=async(endpoint,options)=>{requests++;assert.equal(endpoint,'https://api.openai.com/v1/responses');const body=JSON.parse(options.body);assert.equal(body.store,false);assert.equal(body.text.format.strict,true);assert.ok(!options.body.includes('SEGREDO_OUTRO_CONTATO'));assert.ok(!options.body.includes('synthetic-not-real'));return Response.json({status:'completed',output:[{content:[{type:'output_text',text:JSON.stringify(result)}]}]})}
 // Somente admin grava credenciais; respostas públicas não contêm o segredo.
 process.env.AI_ROLE='comercial';await assert.rejects(api.getAiSettingsAction(),/administradores/);await assert.rejects(api.saveAiSettingsAction({model:'synthetic-model',apiKey:'',enabled:true}),/administradores/);await assert.rejects(api.disconnectAiAction(),/administradores/);delete process.env.AI_ROLE
 const secret='sk-synthetic-test-key-1234567890'
 const configured=await api.saveAiSettingsAction({model:'synthetic-model',apiKey:secret,enabled:true})
 assert.equal(configured.keySource,'crm');assert.ok(!JSON.stringify(configured).includes(secret))
 const stored=(await sql`select data from crm_records where resource='aiProviderSettings'`)[0].data
 assert.ok(stored.apiKeyEncrypted.startsWith('v1:'));assert.ok(!JSON.stringify(stored).includes(secret))
 const preserved=await api.saveAiSettingsAction({model:'synthetic-model',apiKey:'',enabled:true});assert.equal(preserved.hasKey,true)
 await api.disconnectAiAction();assert.equal((await api.getWhatsappAiAvailability()).configured,false)
 assert.ok(!(await sql`select data from crm_records where resource='aiProviderSettings'`)[0].data.apiKeyEncrypted)
 await api.saveAiSettingsAction({model:'synthetic-model',apiKey:secret,enabled:true})
 const testFetch=globalThis.fetch
 globalThis.fetch=async(endpoint,options)=>{assert.equal(endpoint,'https://api.openai.com/v1/responses');assert.equal(options.headers.Authorization,`Bearer ${secret}`);const input=JSON.parse(JSON.parse(options.body).input[0].content);assert.equal(input.test,true);assert.equal(input.messages[0].id,'test-message');return Response.json({status:'completed',output:[{content:[{type:'output_text',text:JSON.stringify({...result,qualification:{...result.qualification,evidence:['test-message']},tasks:[],stage:{key:null,reason:'',evidence:[]}})}]}]})}
 assert.equal((await api.testAiSettingsAction()).ok,true)
 await assert.rejects(api.testAiSettingsAction(),/Aguarde/)
 globalThis.fetch=testFetch
 const draft=await api.analyzeWhatsappConversation(lead.whatsapp)
 assert.equal(draft.messages.length,1);assert.equal(requests,1)
 await assert.rejects(api.analyzeWhatsappConversation(lead.whatsapp),/Aguarde/)
 await assert.rejects(api.analyzeWhatsappConversation('123@lid'),/Identifique/)
 assert.throws(()=>api.validateEvidence({...result,tasks:[{...result.tasks[0],evidence:['other']}]},draft.messages,['contato_feito']),/referência válida/)
 assert.throws(()=>api.validateEvidence({...result,stage:{...result.stage,key:'ganho'}},draft.messages,['contato_feito']))
 process.env.AI_USER='other';await assert.rejects(api.applyWhatsappSuggestion(draft.id,'summary'),/não encontrada/);delete process.env.AI_USER
 await api.applyWhatsappSuggestion(draft.id,'summary')
 await api.applyWhatsappSuggestion(draft.id,'summary')
 assert.equal((await sql`select id from crm_records where resource='activities'`).length,1)
 await api.applyWhatsappSuggestion(draft.id,'qualification')
 assert.equal((await sql`select data from crm_records where resource='leads' and id='lead'`)[0].data.status,'qualificado')
 await api.applyWhatsappSuggestion(draft.id,'stage')
 assert.equal((await sql`select data from crm_records where resource='deals' and id='deal'`)[0].data.stage,'contato_feito')
 await Promise.allSettled([api.applyWhatsappSuggestion(draft.id,'task:0'),api.applyWhatsappSuggestion(draft.id,'task:0')])
 const tasks=await sql`select data from crm_records where resource='tasks'`
 assert.equal(tasks.length,1);assert.equal(tasks[0].data.dueDate,'');assert.equal(tasks[0].data.assigneeId,'actor')
 assert.equal(tasks[0].data.leadId,'lead')
 // Mudanças posteriores de qualificação e contatos removidos nunca são sobrescritos.
 const stale={...draft,id:crypto.randomUUID(),applied:[]}
 await sql`insert into crm_records(resource,id,data) values('whatsappAiAnalyses',${stale.id},${sql.json(stale)})`
 await assert.rejects(api.applyWhatsappSuggestion(stale.id,'qualification'),/qualificação mudou/)
 await sql`update crm_records set deleted=true where resource='leads' and id='lead'`
 await assert.rejects(api.applyWhatsappSuggestion(stale.id,'summary'),/Cadastre/)
 console.log('WhatsApp IA: configuração criptografada, teste fictício, permissões, evidências, isolamento, limite, resumo, qualificação, Kanban, tarefa, concorrência e dados obsoletos validados. Nenhuma chamada externa realizada.')
} finally {
 globalThis.fetch=fetchOriginal
 await api?.closeDatabase()
 await sql.end()
 await base.unsafe(`drop schema if exists "${schema}" cascade`)
 await base.end()
 process.env.DATABASE_URL=original
}
