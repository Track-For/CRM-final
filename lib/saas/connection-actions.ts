"use server"
import { z } from "zod"
import { db, crmRecords } from "@/lib/db"
import { requireUser } from "@/lib/auth/session"
import { encryptSecret } from "@/lib/fiscal/crypto"
import { currentWorkspace } from "./context"
import { connectionEnv } from "./connections"
const fields=['SMTP_HOST','SMTP_PORT','SMTP_USER','SMTP_PASS','EMAIL_FROM','IMAP_HOST','IMAP_PORT','IMAP_USER','IMAP_PASS','EVOLUTION_URL','EVOLUTION_API_KEY'] as const
const secrets=new Set(['SMTP_PASS','IMAP_PASS','EVOLUTION_API_KEY'])
async function admin() {const user=await requireUser();if(user.role!=='admin'||!await currentWorkspace())throw Error('Somente o administrador desta empresa pode configurar as conexões.');return user}
export async function loadWorkspaceConnections() {
  await admin();const env=await connectionEnv()
  return Object.fromEntries(fields.map(key=>[key,secrets.has(key)?'':env[key]||''])) as Record<typeof fields[number],string>
}
export async function saveWorkspaceConnections(input: unknown) {
  const user=await admin(), workspace=(await currentWorkspace())!
  const value=z.record(z.string(),z.string().trim().max(2000)).parse(input)
  if(Object.keys(value).some(key=>!fields.includes(key as typeof fields[number])))throw Error('Campo de conexão inválido.')
  const env=await connectionEnv()
  for(const key of fields)if(!secrets.has(key)||value[key])env[key]=value[key]||''
  for(const key of ['SMTP_HOST','IMAP_HOST'])if(env[key]&&!/^[a-zA-Z0-9.-]{1,253}$/.test(env[key]!))throw Error('Informe um hostname de e-mail válido.')
  for(const key of ['SMTP_PORT','IMAP_PORT'])if(env[key])z.coerce.number().int().min(1).max(65535).parse(env[key])
  if(env.EMAIL_FROM)z.email().parse(env.EMAIL_FROM)
  if(env.EVOLUTION_URL){const url=new URL(env.EVOLUTION_URL);if(!['https:','http:'].includes(url.protocol)||url.username||url.password)throw Error('Endereço do WhatsApp inválido.');if(process.env.NODE_ENV==='production'&&url.protocol!=='https:')throw Error('Use HTTPS no serviço do WhatsApp.');env.EVOLUTION_URL=env.EVOLUTION_URL.replace(/\/$/,'')}
  // Instância e webhook pertencem à empresa e não podem ser escolhidos para outra conta.
  env.EVOLUTION_INSTANCE=`tenant_${workspace.id}`
  env.EVOLUTION_WEBHOOK_TOKEN ||= crypto.randomUUID()+crypto.randomUUID()
  const domain=process.env.SAAS_BASE_DOMAIN
  const {headers}=await import('next/headers');const host=(await headers()).get('host')||''
  env.EVOLUTION_WEBHOOK_URL=`${domain==='localhost'?'http':'https'}://${host}/api/webhooks/evolution`
  const encrypted=encryptSecret(JSON.stringify(env))
  await db.insert(crmRecords).values({resource:'workspaceConnections',id:'default',data:{encrypted},created:true,updatedBy:user.id}).onConflictDoUpdate({target:[crmRecords.resource,crmRecords.id],set:{data:{encrypted},deleted:false,updatedAt:new Date(),updatedBy:user.id}})
  return loadWorkspaceConnections()
}
