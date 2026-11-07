# Preparação local para hospedagem

## Preparado nesta cópia

- Banco local e criptografia configurados; chave de criptografia existente preservada.
- Formulário comercial ativo em `/f/contato`, com nome, WhatsApp, e-mail opcional e mensagem. Edite em `/formularios`. O script `npm run forms:prepare` não altera formulários existentes.
- Prospecção local iniciada: motor Docker na porta 8082 e serviço Python na 8091. Reinicie com `npm run prospecting:engine` e `npm run prospecting:start` quando necessário. O iniciador Python agora recebe as variáveis de `.env.local`, inclusive o token de acesso.
- Asaas tem chave e token de webhook cadastrados; WhatsApp respondeu conectado. Isso não comprova entrega de webhooks no domínio futuro.
- Cadastro da empresa e configuração da IA presentes no banco. Revise os dados da empresa; saldo da IA não foi consultado.
- `npm run readiness:check` verifica também cadastro da empresa, configuração da IA, porta SMTP e endereço do webhook WhatsApp, sem imprimir credenciais ou consumir créditos.

## Backup e recuperação

Execute `npm run db:backup -- --docker-local` para copiar o Postgres local. O arquivo fica em `backups/`, fora do Git, com permissão de leitura e escrita somente para o proprietário. O comando valida seu catálogo. Para testar a restauração, execute `npm run db:backup-check`: ele cria um banco temporário no Docker, restaura o último arquivo, consulta as tabelas e remove somente esse banco temporário.

Em servidor com ferramentas PostgreSQL compatíveis instaladas, `npm run db:backup` usa `DATABASE_URL_UNPOOLED`, ou `DATABASE_URL` como alternativa. Agende esse comando no seu provedor e copie os arquivos para armazenamento externo privado. Backup local isolado não é uma rotina de backup externo.

O dump não contém `.env.local`, arquivos ou volumes do WhatsApp/prospecção. Guarde `APP_ENCRYPTION_KEY` em cofre separado: sem a mesma chave, os tokens criptografados do banco não podem ser recuperados. Preserve também volumes do Evolution/Redis e dados SQLite/volumes Docker da prospecção, conforme `docs/implantacao.md`.

Para restaurar em outro Postgres, crie um banco vazio e use `pg_restore --no-owner --no-acl --exit-on-error -d NOME_DO_BANCO ARQUIVO.dump`, com as credenciais em variáveis `PG*`. Não restaure por cima do banco em uso. O dump de formato customizado exige `pg_restore`, não `psql`.

## Você precisa concluir

| Item | Onde configurar | Dependência |
| --- | --- | --- |
| Administrador definitivo | `/primeiro-acesso` | Seu nome, e-mail e senha, informados diretamente na tela |
| Equipe e permissões | Configurações → Usuários e permissões | Pessoas e perfis escolhidos por você |
| E-mail | Variáveis privadas `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `EMAIL_FROM` | Conta de e-mail/provedor; teste de entrega real |
| Domínio | `CRM_PUBLIC_URL` e `NEXT_PUBLIC_APP_URL` | Mesmo endereço público HTTPS, sem caminho de página |
| Asaas | Painel Asaas | Webhook `https://SEU-DOMINIO/api/webhooks/asaas` e token da integração; homologar recebimento de evento |
| WhatsApp | Variáveis Evolution e painel da instância | `EVOLUTION_WEBHOOK_URL=https://SEU-DOMINIO/api/webhooks/evolution`, token correspondente; testar entrada e saída |
| Google Agenda | Configurações → Google Agenda e conta de cada usuário | Callback HTTPS `/api/google-calendar/callback` e autorização individual |
| Instagram, se usar | Configurações → Conexão do Instagram | Aplicativo e autorização da Meta; callback `/api/instagram/callback` |
| IA, se usar | Integrações → Evolution API | Créditos na conta da API e teste pela tela |
| Notas fiscais, se usar | Integrações → Brasil NFe | Token, cadastro fiscal e certificado no provedor; teste em homologação |
| Automações, se usar | Integrações → n8n | URL real do fluxo, eventos e teste de recebimento |

Nenhuma senha de administrador, conta da equipe ou credencial externa foi inventada. Nenhuma cobrança, nota ou mensagem foi emitida durante a preparação.

## Login e usuários

O login local está reativado (`LOCAL_LOGIN_PAUSED=false`). Abra `/primeiro-acesso` para criar seu administrador; nenhum acesso definitivo foi criado automaticamente. Depois use `/login` com e-mail, senha e segundo fator. O envio de códigos por e-mail exige SMTP também no ambiente local; sem configuração, o login informa a indisponibilidade e não simula um envio bem-sucedido. Para testes locais, use o Mailpit do Docker (`SMTP_HOST=127.0.0.1`, `SMTP_PORT=1025`, sem usuário/senha e com `EMAIL_FROM` preenchido). O `npm run dev` inicia a caixa automaticamente nessa configuração; as mensagens ficam em http://localhost:8025 e não são encaminhadas para e-mails reais. Valide cadastro e login com entrega SMTP usando `AUTH_CHECK_SMTP=true npm run auth:check`. Ative o autenticador em `/minha-conta` após seu primeiro login.

Todos os perfis podem abrir Minha conta para alterar a própria senha e configurar o autenticador. As configurações administrativas continuam restritas a administradores, inclusive no servidor. Convites pendentes aparecem identificados e podem ser renovados em Configurações → Usuários e permissões; o novo link vale 48 horas e invalida os anteriores. Copie e compartilhe o link com a pessoa; não há envio automático do convite por e-mail.

O primeiro cadastro é serializado no banco para evitar dois administradores criados por solicitações simultâneas. A aplicação recarrega os dados na entrada da sessão e não reutiliza o papel salvo no navegador como identidade do usuário.

## Ao publicar

1. Escolha hospedagem Node e Postgres. Evolution e prospecção precisam de serviço persistente; não cabem nas funções da Vercel.
2. Copie as variáveis privadas para a hospedagem. Preserve `APP_ENCRYPTION_KEY`; troque endereços locais por endereços acessíveis ao servidor. Não envie `.env.local` ao Git.
3. Faça backup, aplique `npm run db:migrate`, gere `npm run build` e inicie com `npm start` (Node 24 conforme CI).
4. Configure SMTP, crie seu administrador e adicione usuários com os perfis adequados.
5. Ajuste callbacks e webhooks para o domínio definitivo. Autorize a Agenda em cada conta.
6. Rode `npm run readiness:check` no servidor. Ele continuará sinalizando integrações opcionais ausentes; escolha quais serão usadas. Não realiza emissão ou testes pagos.
7. Confira o formulário em navegador anônimo, faça uma submissão de teste identificada e valide a entrada em Leads. Confira envio/recebimento de WhatsApp, e-mail e webhook de pagamento com registros de teste autorizados.
8. Agende backup externo, teste restauração e configure monitoramento HTTP de `/login` no seu provedor.

O navegador automatizado não estava disponível nesta sessão. A rota `/f/contato` respondeu HTTP 200, mas a inspeção visual e a submissão real pela página ficam para a homologação. Os testes de formulário e do ciclo de vendas usam registros temporários isolados.

## Verificações executadas

- Lint, TypeScript e build de produção passaram.
- 76 testes gerais e 21 testes de prospecção passaram.
- `crm:check`, `sales:check`, `auth:check` e `asaas:check-webhook` passaram em schemas temporários; transportes externos simulados.
- Criação do formulário repetida sem duplicação ou alteração de registros existentes.
- Backup final criado após o cadastro do formulário e restaurado com sucesso em banco temporário, removido ao terminar.
- Prospecção reiniciada com o novo iniciador; checagem confirmou o motor funcionando e WhatsApp conectado.
- Prontidão ainda retorna pendências esperadas: SMTP, domínio HTTPS, administrador definitivo, webhook público WhatsApp, Brasil NFe e Instagram. A publicação e a homologação externa ficam para a hospedagem.
