"use client"
import { useActionState } from "react"
import { registerWorkspace, type RegistrationState } from "@/lib/saas/registration-actions"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
export function RegistrationForm() {
  const [state, action, pending] = useActionState(registerWorkspace, {} as RegistrationState)
  if (state.loginUrl) return <div className="space-y-4"><h1 className="text-xl font-semibold">Sua empresa foi criada</h1><p className="text-sm text-muted-foreground">Entre com o e-mail e a senha cadastrados para configurar sua marca e seus serviços.</p><Button asChild><a href={state.loginUrl}>Entrar no meu CRM</a></Button></div>
  return <form action={action} className="space-y-4"><h1 className="text-xl font-semibold">Crie o CRM da sua empresa</h1><p className="text-sm text-muted-foreground">Um espaço próprio para sua equipe, clientes e serviços.</p>{state.error && <p role="alert" className="text-sm text-destructive">{state.error}</p>}
    {([['company','Empresa','text'],['slug','Endereço da empresa','text'],['name','Seu nome','text'],['email','Seu e-mail','email'],['password','Senha','password']] as const).map(([name,label,type])=><label key={name} className="block space-y-2 text-sm">{label}<Input name={name} type={type} required disabled={pending} minLength={name==='password'?10:name==='slug'?3:2} maxLength={name==='password'?200:name==='slug'?48:120} pattern={name==='slug'?'[a-z0-9][a-z0-9-]{1,46}[a-z0-9]':undefined} autoComplete={name==='password'?'new-password':name==='email'?'email':undefined}/>{name==='slug'&&<span className="text-xs text-muted-foreground">Ex.: minha-empresa. Use letras minúsculas, números e hífens.</span>}</label>)}
    <Button type="submit" className="w-full" disabled={pending}>{pending?'Criando empresa…':'Criar minha empresa'}</Button><p className="text-xs text-muted-foreground">Esta etapa cria seu espaço. Nenhuma cobrança é realizada aqui.</p>
  </form>
}
