# SaaS por empresa

Cada empresa recebe um subdomínio e um schema PostgreSQL próprio (`tenant_<id>`), com usuários, sessões, catálogo, registros financeiros, tokens e configurações independentes. A resolução usa o Host validado contra SAAS_BASE_DOMAIN e o registro do plano de controle (`saas_workspaces`). Não aceita um tenant enviado por campo de formulário ou cabeçalho customizado do navegador. Schemas de clientes não incluem `public` no search_path. O endereço principal preserva a operação atual.

## Preparar

1. Faça um backup e execute `npm run db:migrate` na conexão direta.
2. Configure `APP_ENCRYPTION_KEY`, SMTP transacional da plataforma e o domínio em `SAAS_BASE_DOMAIN` (sem protocolo/porta).
3. O proxy deve substituir (não apenas repassar) os cabeçalhos X-Forwarded-For/X-Real-IP: o cadastro público limita a cinco tentativas por hora e IP. Aponte o domínio e `*.dominio` para o mesmo servidor, com HTTPS wildcard. O proxy deve preservar Host e o Next deve receber apenas hosts do domínio autorizado.
4. Configure `SAAS_REGISTRATION_ENABLED=true` para abrir `/criar-conta` no endereço principal. Em desenvolvimento, use `SAAS_BASE_DOMAIN=localhost`: os clientes acessam `empresa.localhost:3000`.
5. O administrador cria a empresa, entra pelo endereço recebido e conclui `/configuracao-inicial` com marca, segmento e serviços. Novos clientes não herdam serviços, integrações, credenciais nem dados da operação original.
6. Cada empresa configura SMTP/IMAP e Evolution em Configurações → Empresa. As credenciais são criptografadas e as senhas não são retornadas ao navegador. As conexões de Asaas, Google, fiscal e IA continuam nas telas de integração existentes, armazenadas no espaço da empresa. Webhooks e callbacks devem usar o subdomínio do cliente.

## Operação

- As migrações 0000–0010 são aplicadas durante a criação de um espaço. 0011 e 0012 criam somente o plano de controle e o limite de cadastro. Uma criação interrompida reverte registro, schema e usuário juntos. Migrações futuras precisam ser aplicadas também aos schemas existentes antes de liberar novos campos na aplicação; o comando padrão do Drizzle atualiza o plano principal.
- As filas de webhooks, automações, fiscal e triagem percorrem as empresas ativas que concluíram o cadastro, cada execução no respectivo contexto. Falhas de uma empresa preservam sua fila e não usam dados de outra.
- A prospecção usa processos e pastas SQLite separados, sob `dados/workspaces/<id>`. O serviço mantém até PROSPECTING_MAX_WORKSPACES processos ativos (8 por padrão); dimensione o serviço antes de aumentar esse número. Reinícios retomam o estado persistido. A base da Receita precisa ser disponibilizada em cada espaço; contatos privados nunca são compartilhados.
- Para suspender acesso, o operador altera `saas_workspaces.status` para `suspended` pelo plano de controle. Isso bloqueia resolução e retira a empresa das filas futuras.
- Clientes não podem usar a pausa de login do desenvolvimento. Sessões são host-only e login/2FA são por empresa.
- Scripts administrativos fora de requisições precisam de um contexto explícito. `SAAS_WORKSPACE=legacy` autoriza somente a operação original em scripts; não altera o tenant de requisições HTTP. Os workers de npm start recebem essa configuração e percorrem os demais espaços explicitamente.

## Validação

`node scripts/check-saas-isolation.mjs` cria duas empresas sintéticas em schemas temporários, exercita usuários com e-mails iguais, IDs iguais, SQL, transações, savepoints, concorrência e catálogos, e remove tudo ao finalizar. Os testes Python verificam extrações e contatos separados por empresa, sem pesquisas reais.

## Limite comercial desta entrega

O cadastro cria um espaço ativo e não realiza cobrança. Planos, checkout da assinatura da plataforma, limites por plano, expiração de testes e suspensão automática por inadimplência ainda precisam ser implementados antes de abrir venda automática. O Asaas já existente continua representando as cobranças que cada cliente faz aos próprios clientes; não representa a assinatura do SaaS.
