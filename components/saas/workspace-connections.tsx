"use client"
import {useEffect,useState} from 'react'
import {loadWorkspaceConnections,saveWorkspaceConnections} from '@/lib/saas/connection-actions'
import {Panel} from '@/components/shared/panel'
import {Input} from '@/components/ui/input'
import {Button} from '@/components/ui/button'
const labels:Record<string,string>={SMTP_HOST:'Servidor SMTP',SMTP_PORT:'Porta SMTP',SMTP_USER:'Usuário SMTP',SMTP_PASS:'Senha SMTP',EMAIL_FROM:'E-mail remetente',IMAP_HOST:'Servidor IMAP (cópia em Enviados)',IMAP_PORT:'Porta IMAP',IMAP_USER:'Usuário IMAP (opcional)',IMAP_PASS:'Senha IMAP (opcional)',EVOLUTION_URL:'Endereço do serviço Evolution',EVOLUTION_API_KEY:'Chave do serviço Evolution'}
export function WorkspaceConnections(){
 const [fields,setFields]=useState<Record<string,string>>({}),[error,setError]=useState(''),[busy,setBusy]=useState(false),[saved,setSaved]=useState(false)
 useEffect(()=>{let active=true;void loadWorkspaceConnections().then(value=>{if(active)setFields(value)}).catch(e=>{if(active)setError(e.message)});return()=>{active=false}},[])
 async function save(event:React.FormEvent){event.preventDefault();setBusy(true);setError('');setSaved(false);try{setFields(await saveWorkspaceConnections(fields));setSaved(true)}catch(e){setError(e instanceof Error?e.message:'Não foi possível salvar.')}finally{setBusy(false)}}
 return <Panel title="Conexões da sua empresa" description="Suas credenciais são salvas de forma criptografada. Senhas em branco mantêm a configuração anterior."><form onSubmit={save} className="space-y-4">{error&&<p role="alert" className="text-sm text-destructive">{error}</p>}{saved&&<p role="status" className="text-sm text-success">Configuração salva. A conexão é verificada ao utilizar o serviço.</p>}<div className="grid gap-4 sm:grid-cols-2">{Object.entries(labels).map(([key,label])=><label key={key} className="block space-y-2 text-sm">{label}<Input disabled={busy} type={key.includes('PASS')||key.includes('API_KEY')?'password':'text'} autoComplete="off" value={fields[key]||''} onChange={e=>setFields({...fields,[key]:e.target.value})}/></label>)}</div><p className="text-xs text-muted-foreground">Na Hostinger, o IMAP é detectado automaticamente. Depois de salvar o WhatsApp, conecte o número da empresa em Integrações.</p><Button type="submit" disabled={busy||!Object.keys(fields).length}>{busy?'Salvando…':'Salvar conexões'}</Button></form></Panel>
}
