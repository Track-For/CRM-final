import { API_SCOPES } from "@/lib/integrations/api-contract"
import { API_PERMISSIONS } from "@/lib/integrations/api-permissions"

export function ApiPermissionsIntro() {
  return <div className="space-y-2 text-sm leading-relaxed text-muted-foreground">
    <p><strong className="text-foreground">Consultar (read)</strong> permite ler dados. <strong className="text-foreground">Criar/editar (write)</strong> permite as alterações descritas em cada opção.</p>
    <p>As permissões são independentes: para consultar e criar leads, por exemplo, selecione <code>leads:read</code> e <code>leads:write</code>.</p>
    <p>Selecione apenas o que a integração precisa. Nenhuma dessas permissões permite excluir registros ou movimentar dinheiro. A API funciona sem instalar o n8n.</p>
  </div>
}

export function ApiPermissionsGuide() {
  return <div className="space-y-5">
    <ApiPermissionsIntro />
    <div className="grid gap-3 lg:grid-cols-2">{API_SCOPES.map(scope => <div key={scope} className="min-w-0 space-y-1.5 rounded-lg border p-4">
      <h3 className="text-sm font-medium">{API_PERMISSIONS[scope].label}</h3>
      <code className="block text-xs text-primary">{scope}</code>
      <p className="text-sm leading-relaxed text-muted-foreground">{API_PERMISSIONS[scope].description}</p>
    </div>)}</div>
    <div className="space-y-2 rounded-lg bg-muted p-4 text-sm">
      <h3 className="font-medium">Exemplos de escolha</h3>
      <p>Formulário que envia contatos: <code>leads:write</code>.</p>
      <p>Sistema que consulta leads e cria tarefas: <code>leads:read</code> + <code>tasks:write</code>.</p>
      <p>Painel financeiro: <code>charges:read</code> + <code>subscriptions:read</code>.</p>
      <p>Painel de previsão de vendas: <code>reports:read</code>.</p>
    </div>
  </div>
}
