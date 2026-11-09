// Duas empresas sintéticas em schemas temporários. Nenhum dado real é modificado.
import {config} from 'dotenv'
import postgres from 'postgres'
import {build} from 'esbuild'
import {randomBytes} from 'node:crypto'
import {mkdir} from 'node:fs/promises'
import {pathToFileURL} from 'node:url'
import path from 'node:path'
import assert from 'node:assert/strict'
config({path:'.env.local',quiet:true})
const original=process.env.DATABASE_URL
assert.ok(original&&['localhost','127.0.0.1'].includes(new URL(original).hostname),'Somente banco local')
const root=postgres(original,{max:1,onnotice:()=>{}})
const schema=`saas_test_${randomBytes(6).toString('hex')}`
const url=new URL(original);url.searchParams.set('search_path',schema)
let api,authApi,alpha,beta
try {
 await root.unsafe(`create schema "${schema}"`)
 await root.unsafe(`create table "${schema}".saas_workspaces(id text primary key,slug text unique,schema_name text unique,name text,status text default 'active',onboarded_at timestamptz)`)
 process.env.DATABASE_URL=url.toString();delete process.env.SAAS_BASE_DOMAIN
 const dir=path.resolve('node_modules/.cache/saas-check');await mkdir(dir,{recursive:true});const outfile=path.join(dir,'check.mjs')
 await build({stdin:{contents:`export {provisionWorkspace} from './lib/saas/provision';export {withWorkspace} from './lib/saas/context';export {db,crmRecords,users,sessions} from './lib/db';export {saveRecord,loadRecordOverlay} from './lib/data/records-actions';export {saveWorkspaceSetup} from './lib/saas/setup-actions';export {connectionEnv} from './lib/saas/connections';export {eq,sql} from 'drizzle-orm';import {db} from './lib/db';export async function close(){await db.$client.end()}`,resolveDir:process.cwd()},outfile,bundle:true,platform:'node',format:'esm',packages:'external',logLevel:'silent',plugins:[{name:'fixtures',setup(p){
 const fixtures={'@/lib/auth/session':`export async function requireUser(){return {id:globalThis.__saasUser,role:globalThis.__saasRole||'admin'}};export const getCurrentUser=requireUser`, '@/lib/boleto/import':'export async function syncAsaasReceivables(){}','@/lib/fiscal/automatic-schedule':'export async function schedulePaidChargeInvoice(){}','@/lib/integrations/webhooks':'export async function dispatchCrmEvent(){}'}
 p.onResolve({filter:/.*/},a=>a.path in fixtures?{path:a.path,namespace:'fixture'}:undefined);p.onLoad({filter:/.*/,namespace:'fixture'},a=>({contents:fixtures[a.path],loader:'js'}))
 }}]})
 api=await import(pathToFileURL(outfile).href)
 const suffix=randomBytes(4).toString('hex')
 alpha=await api.provisionWorkspace({company:'Clínica A',slug:'alpha-'+suffix,name:'Ana',email:'owner@example.invalid',password:'synthetic-password-A'})
 beta=await api.provisionWorkspace({company:'Consultoria B',slug:'beta-'+suffix,name:'Bruno',email:'owner@example.invalid',password:'synthetic-password-B'})
 assert.notEqual(alpha.schemaName,beta.schemaName)
 await assert.rejects(api.provisionWorkspace({company:'Outra',slug:alpha.slug,name:'Ana',email:'other@example.invalid',password:'synthetic-password'}),/já está em uso/)
 const inCompany=(workspace,job)=>api.withWorkspace(workspace,job)
 const alphaUsers=await inCompany(alpha,()=>api.db.select().from(api.users))
 const betaUsers=await inCompany(beta,()=>api.db.select().from(api.users))
 assert.equal(alphaUsers.length,1);assert.equal(betaUsers.length,1)
 assert.notEqual(alphaUsers[0].id,betaUsers[0].id)
 // IDs iguais são permitidos sem colisão entre empresas; SQL sem filtros também fica isolado.
 for(const [workspace,name] of [[alpha,'Registro A'],[beta,'Registro B']]) await inCompany(workspace,()=>api.db.insert(api.crmRecords).values({resource:'leads',id:'same-id',data:{name},created:true}))
 const read=workspace=>inCompany(workspace,()=>api.db.execute(api.sql`select data->>'name' as name from crm_records where resource='leads'`))
 assert.equal((await read(alpha))[0].name,'Registro A');assert.equal((await read(beta))[0].name,'Registro B')
 await Promise.all(Array.from({length:12},(_,i)=>read(i%2?alpha:beta).then(rows=>assert.equal(rows[0].name,i%2?'Registro A':'Registro B'))))
 await inCompany(alpha,()=>api.db.transaction(async tx=>{await tx.update(api.crmRecords).set({data:{name:'Atualizado A'}}).where(api.eq(api.crmRecords.resource,'leads'));await tx.transaction(async nested=>nested.execute(api.sql`select 1`))}))
 assert.equal((await read(beta))[0].name,'Registro B')
 globalThis.__saasUser=alphaUsers[0].id
 const setup={name:'Clínica A',segment:'Fisioterapia',description:'Atendimento clínico',brandName:'Marca A',brandColor:'#224466',logo:'',services:[{id:'service-test',name:'Consulta',description:'Avaliação',basePrice:250,monthlyFee:0}]}
 await inCompany(alpha,()=>api.saveWorkspaceSetup(setup))
 assert.equal((await inCompany(alpha,()=>api.loadRecordOverlay())).find(r=>r.resource==='catalog').data.name,'Consulta')
 assert.equal((await inCompany(beta,()=>api.db.select().from(api.crmRecords).where(api.eq(api.crmRecords.resource,'catalog')))).length,0)
 assert.deepEqual(await inCompany(beta,()=>api.connectionEnv()),{})
 // Exclusão de A não remove o mesmo identificador em B.
 await inCompany(alpha,()=>api.db.delete(api.crmRecords).where(api.eq(api.crmRecords.id,'same-id')))
 assert.equal((await read(alpha)).length,0);assert.equal((await read(beta)).length,1)
 globalThis.__saasRole='comercial';await assert.rejects(inCompany(beta,()=>api.saveWorkspaceSetup(setup)),/administrador/)
 const authfile=path.join(dir,'sessions.mjs')
 await build({stdin:{contents:`export {getCurrentUser,sha256Hex} from './lib/auth/session';import {db} from './lib/db';export async function close(){await db.$client.end()}`,resolveDir:process.cwd()},outfile:authfile,bundle:true,platform:'node',format:'esm',packages:'external',logLevel:'silent',plugins:[{name:'request-headers',setup(p){
 p.onResolve({filter:/^next\/navigation$/},()=>({path:'navigation',namespace:'navigation-fixture'}));p.onLoad({filter:/.*/,namespace:'navigation-fixture'},()=>({contents:'export function redirect(){throw Error("redirect")}',loader:'js'}));p.onResolve({filter:/^next\/headers$/},()=>({path:'headers',namespace:'fixture'}));p.onLoad({filter:/.*/,namespace:'fixture'},()=>({contents:`export async function headers(){return new Headers({host:globalThis.__saasHost})};export async function cookies(){return {get:()=>globalThis.__saasToken?{value:globalThis.__saasToken}:undefined}}`,loader:'js'}))
 }}]})
 authApi=await import(pathToFileURL(authfile).href)
 process.env.SAAS_BASE_DOMAIN='localhost';process.env.NODE_ENV='development';process.env.LOCAL_LOGIN_PAUSED='true'
 const token='synthetic-session-alpha'
 await inCompany(alpha,()=>api.db.insert(api.sessions).values({id:authApi.sha256Hex(token),userId:alphaUsers[0].id,expiresAt:new Date(Date.now()+60000)}))
 globalThis.__saasHost=alpha.slug+'.localhost:3000'
 assert.equal(await authApi.getCurrentUser(),null) // A pausa de login não vale para assinantes.
 globalThis.__saasToken=token
 assert.equal((await authApi.getCurrentUser()).id,alphaUsers[0].id)
 globalThis.__saasHost=beta.slug+'.localhost:3000'
 assert.equal(await authApi.getCurrentUser(),null) // Cookie de A não autentica em B.
 globalThis.__saasHost='missing-company.localhost:3000'
 await assert.rejects(authApi.getCurrentUser(),/não encontrada/)
 globalThis.__saasHost=alpha.slug+'.localhost:3000'
 await root.unsafe(`update "${schema}".saas_workspaces set status='suspended' where id=$1`,[alpha.id])
 await assert.rejects(authApi.getCurrentUser(),/suspenso/)
 console.log('OK: isolamento de schemas, SQL, transações, catálogos, credenciais, concorrência, sessões por host e bloqueio de empresa suspensa. Pausa de login não autentica assinantes.')
}finally{
 if(authApi)await authApi.close()
 if(api)await api.close()
 for(const workspace of [alpha,beta])if(workspace)await root.unsafe(`drop schema "${workspace.schemaName}" cascade`)
 await root.unsafe(`drop schema "${schema}" cascade`);await root.end()
}
