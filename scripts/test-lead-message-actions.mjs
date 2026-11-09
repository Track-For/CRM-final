import { test } from "node:test"
import assert from "node:assert/strict"
import { build } from "esbuild"
import { mkdir } from "node:fs/promises"
import { pathToFileURL } from "node:url"
import path from "node:path"
const dir = path.resolve(".next/message-unit"); await mkdir(dir, { recursive: true })
const outfile = path.join(dir, "actions.mjs")
const mocks = {
  "./sent-copy": "export async function saveSentEmail(mail){globalThis.__msg.copies=(globalThis.__msg.copies||[]).concat(mail);return globalThis.__msg.copyFail?\"E-mail aceito, mas a cópia não foi salva em Enviados. Não reenvie.\":\"\"}",
  "@/lib/auth/session": "export const requireUser = async () => globalThis.__msg.user",
  "@/lib/db": `export const crmRecords = {resource:'resource',id:'id',deleted:'deleted'}; export const db = {select:()=>({from:()=>({where:()=>({limit:async()=>globalThis.__msg.records})})}),insert:()=>({values:async value=>{if(globalThis.__msg.historyFail)throw Error("Banco indisponível");globalThis.__msg.activities.push(value)}})}`,
  "@/lib/whatsapp/actions": "export const sendWhatsappText = async (phone,text) => {if(globalThis.__msg.fail)throw Error('WhatsApp indisponível'); globalThis.__msg.sent.push({phone,text})}",
  nodemailer: "export default {createTransport:()=>({sendMail:async value=>{if(globalThis.__msg.smtpFail)throw Error('SMTP indisponível');globalThis.__msg.sent.push(value);return {accepted:globalThis.__msg.smtpRejected?[]:[value.to]}},close:()=>{}})}",
}
await build({ entryPoints: ["lib/messages/actions.ts"], outfile, bundle: true, platform: "node", format: "esm", packages: "external", logLevel: "silent", plugins: [{name:"mock-transport",setup(builder){builder.onResolve({filter:/.*/}, args => args.path in mocks ? {path:args.path,namespace:"mock"}:undefined);builder.onLoad({filter:/.*/,namespace:"mock"},args=>({contents:mocks[args.path],loader:"js"}))}}] })
const {sendLeadMessage} = await import(pathToFileURL(outfile).href)
function setup() {globalThis.__msg={user:{id:'admin',role:'admin'},records:[{data:{email:'lead@example.com',whatsapp:'5511999999999'}}],sent:[],activities:[]}}
const input={leadId:'lead',channel:'whatsapp',expectedRecipient:'5511999999999',text:'Olá Ana!',subject:'Contato'}
test('bloqueia papéis sem permissão e variáveis pendentes antes do envio',async()=>{
 setup();globalThis.__msg.user.role='financeiro';await assert.rejects(sendLeadMessage(input),/Sem permissão/)
 setup();await assert.rejects(sendLeadMessage({...input,text:'Olá {nome}'}),/variáveis/);assert.equal(globalThis.__msg.sent.length,0)
})
test('usa destinatário salvo e só registra histórico depois do envio confirmado',async()=>{
 setup();const result=await sendLeadMessage({...input,to:'intruso@example.com'});assert.equal(globalThis.__msg.sent[0].phone,'5511999999999');assert.equal(result.activity.leadId,'lead');assert.equal(globalThis.__msg.activities.length,1)
 setup();globalThis.__msg.fail=true;await assert.rejects(sendLeadMessage(input));assert.equal(globalThis.__msg.activities.length,0)
})
test('SMTP ausente bloqueia envio; lead removido também é bloqueado',async()=>{
 setup();const host=process.env.SMTP_HOST;delete process.env.SMTP_HOST
 try {await assert.rejects(sendLeadMessage({...input,channel:'email',expectedRecipient:'lead@example.com'}),/não foi configurado/);assert.equal(globalThis.__msg.sent.length,0)} finally {if(host!==undefined)process.env.SMTP_HOST=host}
 setup();globalThis.__msg.records=[];await assert.rejects(sendLeadMessage(input),/Lead não encontrado/)
})

test('bloqueia troca do destinatário após a revisão, inclusive e-mail',async()=>{
 setup();globalThis.__msg.records[0].data.whatsapp='5511888888888'
 await assert.rejects(sendLeadMessage(input),/contato do lead mudou/)
 assert.equal(globalThis.__msg.sent.length,0);assert.equal(globalThis.__msg.activities.length,0)
 setup();await assert.rejects(sendLeadMessage({...input,channel:'email',expectedRecipient:'outro@example.com'}),/contato do lead mudou/)
 assert.equal(globalThis.__msg.sent.length,0)
 setup();await sendLeadMessage({...input,expectedRecipient:'(11) 99999-9999'})
 assert.equal(globalThis.__msg.sent.length,1)
})

test('SMTP confirma aceitação e falha no histórico não orienta reenvio',async()=>{
 const host=process.env.SMTP_HOST,from=process.env.EMAIL_FROM
 process.env.SMTP_HOST='smtp.example.invalid';process.env.EMAIL_FROM='crm@example.invalid'
 const email={...input,channel:'email',expectedRecipient:'lead@example.com'}
 try {
  setup();const result=await sendLeadMessage(email)
  assert.equal(globalThis.__msg.sent[0].to,'lead@example.com')
  assert.equal(result.activity.type,'email');assert.equal(result.warning,'')
  assert.equal(globalThis.__msg.copies.length,1)
  setup();globalThis.__msg.copyFail=true
  const copyWarning=await sendLeadMessage(email)
  assert.match(copyWarning.warning,/Não reenvie/)
  assert.ok(copyWarning.activity)
  assert.equal(globalThis.__msg.sent.length,1)
  setup();globalThis.__msg.historyFail=true
  const warning=await sendLeadMessage(email)
  assert.equal(warning.activity,null);assert.match(warning.warning,/Não reenvie/)
  assert.equal(globalThis.__msg.sent.length,1)
  for(const flag of ['smtpFail','smtpRejected']) {
   setup();globalThis.__msg[flag]=true
   await assert.rejects(sendLeadMessage(email),/não confirmou/)
   assert.equal(globalThis.__msg.activities.length,0)
   assert.equal(globalThis.__msg.copies,undefined)
  }
 } finally {
  if(host===undefined)delete process.env.SMTP_HOST;else process.env.SMTP_HOST=host
  if(from===undefined)delete process.env.EMAIL_FROM;else process.env.EMAIL_FROM=from
 }
})


test('lead envia parágrafos como mensagens distintas e registra uma atividade',async()=>{
 setup()
 const result=await sendLeadMessage({...input,text:'Um\n\nDois\n\nTrês',separateParagraphs:true})
 assert.deepEqual(globalThis.__msg.sent.map(message=>message.text),['Um','Dois','Três'])
 assert.equal(result.sentCount,3)
 assert.equal(globalThis.__msg.activities.length,1)
 assert.equal(result.activity.description,'Um\n\nDois\n\nTrês')
})
