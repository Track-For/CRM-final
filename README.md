# Solid Tech CRM — front-end

Layout navegável do CRM da Solid Tech com dados mockados. Não há backend, banco nem integrações reais: tudo roda em memória no navegador, mas a estrutura já está pronta para plugar a API.

## Como rodar

```bash
npm install        # o projeto usa legacy-peer-deps (.npmrc)
npm run dev        # http://localhost:3000
npm run lint
npx tsc --noEmit   # typecheck
npm run build
```

Stack: Next.js 16 (App Router) + TypeScript strict, Tailwind 4, shadcn/ui (Radix), lucide-react, @dnd-kit, Recharts, TanStack Table, React Hook Form + Zod, date-fns (pt-BR) e Zustand.

O papel do usuário (Admin, Comercial, Operação, Financeiro) é trocado no avatar, no canto superior direito. Financeiro e Notas fiscais aparecem só para Admin e Financeiro.

## Login e verificação em duas etapas

O acesso ao CRM exige e-mail e senha e, em seguida, um código de 6 dígitos: do Google Authenticator (ativado em Configurações > Segurança) ou enviado por e-mail. Usuários, sessões e códigos ficam no Postgres (Neon, conectado ao projeto na Vercel) via Drizzle.

- A sessão dura 24 horas a partir do login. Depois disso o CRM pede senha e o código de novo.
- No primeiro acesso, sem nenhum usuário no banco, `/login` leva a `/primeiro-acesso`, que cria o administrador.
- Variáveis: `DATABASE_URL` e `DATABASE_URL_UNPOOLED` (vêm da integração Neon) e, para o envio do código por e-mail, `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS` e `EMAIL_FROM`. Em `npm run dev` sem SMTP, o código aparece no terminal do servidor.
- Banco: `npm run db:generate` gera migrações a partir de `lib/db/schema.ts` e `npm run db:migrate` aplica.
- Arquivos: `lib/auth/*` (senha, TOTP, sessão, e-mail, server actions), `proxy.ts` (bloqueia rotas sem sessão), `app/(auth)/*` (telas), `components/auth/*`.

## Notas fiscais (NFS-e via Brasil NFe)

A tela Notas fiscais e Integrações > Brasil NFe são reais: as notas ficam na tabela `invoices` e a configuração em `fiscal_settings`. O token da empresa é salvo criptografado (AES-256-GCM, chave em `APP_ENCRYPTION_KEY`).

- Configure em `/integracoes/brasil_nfe`: token da empresa (painel api.brasilnfe.com.br, onde também se cadastram CNPJ, inscrição municipal e certificado A1), ambiente (homologação ou produção), município e padrões de serviço/ISS.
- Fluxo: emitir → `processando` (a tela consulta o lote a cada 10s) → `emitida` ou `rejeitada` (corrigir e reenviar com novo RPS); `emitida` → cancelar com motivo.
- Arquivos: `lib/fiscal/brasilnfe.ts` (cliente da API), `lib/fiscal/mapper.ts`, `lib/fiscal/actions.ts` (server actions, só admin e financeiro), `app/api/notas-fiscais/[id]/arquivo` (PDF/XML).
- Ainda usam notas mockadas: a ficha do cliente e o detalhe da cobrança no Financeiro (`components/invoices/legacy`).

## Financeiro e boleto (Asaas)

O Financeiro traz o dashboard, as entradas e saídas (`/financeiro/lancamentos`) e as cobranças. Valores em dinheiro aparecem sempre inteiros; só os rótulos de eixo dos gráficos abreviam.

- Configure em `/integracoes/asaas`: chave da API (salva criptografada), ambiente (sandbox ou produção), multa e juros. A chave de teste começa com `$aact_hmlg_` e a de produção com `$aact_prod_`.
- Clientes: marque "Cadastrar ou vincular este cliente também no Asaas" no formulário. O CRM reutiliza o cadastro por CPF/CNPJ e salva o ID remoto; `lib/boleto/customer-actions.ts` preserva o registro local se a API falhar.
- Cobranças: selecione "Asaas" em Nova cobrança para criar uma fatura (`billingType: UNDEFINED`); "Boleto" emite boleto registrado. `lib/boleto/actions.ts` grava os IDs de emissão e confere a referência externa antes de retomar uma tentativa, evitando duplicação. Etapas de projeto com forma Asaas/boleto e data definida também são emitidas ao confirmar Ganho.
- Envio: `lib/boleto/customer.ts` mantém notificações habilitadas e configura o aviso de criação por e-mail ou, sem e-mail, SMS. O Asaas executa o envio conforme suas configurações e tarifas; o WhatsApp manual continua disponível. Nenhum envio real é disparado pelos testes isolados.
- Baixa automática: `POST /api/webhooks/asaas`, validado pelo header `asaas-access-token`. Exige o CRM publicado e o webhook cadastrado no painel do Asaas com a URL e o token mostrados na tela. Sem isso, use "Atualizar status" na cobrança.
- Pix e cartão escolhidos diretamente no formulário permitem registro manual. Na fatura Asaas o cliente escolhe entre os meios habilitados na conta.
- Testes: `npm run asaas:test` valida a conciliação; `npm run asaas:check-outbound` testa cadastro, notificações, concorrência e respostas incertas com API simulada e schema temporário no Postgres local.

## Estrutura

```
app/
  (crm)/                 telas autenticadas (layout com sidebar + topbar)
    dashboard, leads, leads/[id], vendas, vendas/[id], kanban, funil,
    orcamentos, orcamentos/novo, orcamentos/[id], agenda, tarefas,
    clientes, clientes/[id], financeiro/{cobrancas,mensalidades,lancamentos},
    notas-fiscais, relatorios, formularios, formularios/[id],
    integracoes, integracoes/[key], integracoes/logs, configuracoes
  f/[slug]/              formulário público de captação (sem shell)
components/
  ui/                    shadcn/ui (tema escuro sólido)
  shared/                DataTable, KanbanBoard, StatCard, PageHeader, FilterBar,
                         EntityDrawer, StatusBadge, MoneyInput, EmptyState, Panel...
  forms/                 modais de criação rápida (lead, negócio, tarefa, evento, cobrança)
  layout/                shell: sidebar, topbar, busca global (Ctrl/Cmd+K), guarda de papel
  <feature>/             componentes de cada tela (leads, sales, quotes, finance...)
types/index.ts           entidades (espelham os futuros models Prisma)
lib/
  mock/                  gerador determinístico do mock (coerente entre telas)
  data/api.ts            ÚNICO ponto que fala com "o servidor" (hoje: mock)
  data/index.ts          hooks que as telas usam (useLeads, useDeal, useCrm...)
  data/selectors.ts      cálculos derivados (MRR, fluxo de caixa, negócios parados)
  store/crm-store.ts     Zustand: dados + mutações otimistas (add/update/remove/moveDeal...)
  store/ui-store.ts      papel, período global, sidebar, preferências (localStorage)
  pricing.ts             regra de precificação dos orçamentos
  format.ts, period.ts, permissions.ts, validation.ts, constants.ts
```

## Fluxo de dados e onde ligar a API

```
tela  ->  hooks de lib/data  ->  store (Zustand)  ->  lib/data/api.ts  ->  mock (hoje) | API (depois)
```

- **Leitura**: o shell chama `bootstrap()` do store, que usa `getDatabase()` em `lib/data/api.ts`. Para a API, troque o corpo das funções `get*` por `fetch` (ou passe a usar TanStack Query nos hooks de `lib/data/index.ts`) mantendo os tipos de `types/`.
- **Escrita**: toda mutação do store atualiza a tela na hora e chama `createResource`, `updateResource` ou `deleteResource` em `api.ts`. Hoje elas só respondem; depois viram `POST/PATCH/DELETE /api/:resource`.
- **Ações com integração** ficam em `api.actions` (`sendWhatsapp`, `createCharge`, `issueInvoice`, `testWebhook`, `submitPublicForm`).

| Tela | Dados (hooks) | Endpoints sugeridos |
| --- | --- | --- |
| Dashboard / Relatórios | leads, deals, entries, subscriptions, charges, adSpend | `GET /api/metrics/*` (agregados) ou as listas abaixo |
| Leads e ficha | leads, activities, notes, messages, quickMessages | `GET/POST/PATCH /api/leads`, `POST /api/leads/import`, `POST /api/whatsapp/send` (Evolution / Cloud API) |
| Vendas, Kanban, Funil | deals, pipelines, lostReasons | `GET/PATCH /api/deals`, `PATCH /api/deals/:id/stage`, `PUT /api/pipelines/:id` |
| Orçamentos | quotes, catalog, addons, hostingPlans, pricingRules | `GET/POST/PATCH /api/quotes`, `POST /api/quotes/:id/pdf` |
| Agenda | events | `GET/POST/PATCH/DELETE /api/events` (+ Google Calendar) |
| Tarefas | tasks | `GET/POST/PATCH /api/tasks`, `PATCH /api/tasks/:id/move` |
| Clientes | clients, projects, contracts, subscriptions, charges, invoices | `GET/POST/PATCH /api/clients` |
| Financeiro | charges, subscriptions, entries, financialCategories | `/api/charges` (Asaas), `/api/subscriptions`, `/api/financial-entries` |
| Notas fiscais | invoices | `POST /api/invoices` (Brasil NFe), `POST /api/invoices/:id/cancel` |
| Formulários e /f/[slug] | forms | `GET/PUT /api/forms`, `GET /api/public/forms/:slug`, `POST /api/public/forms/:slug` |
| Integrações | integrations, webhooks, apiKeys, whatsappInstances, integrationLogs | `/api/integrations/:key`, `/api/webhooks`, `/api/api-keys`, `/api/integrations/logs/:id/retry` |
| Configurações | company, users, pipelines, catalog, rules, quickMessages, lostReasons, financialCategories | `GET/PUT /api/settings/*` |

## Mock

`lib/mock/generate.ts` gera, a partir de uma semente fixa e da data de hoje, cerca de 40 leads, 25 negócios, 15 clientes, 30 cobranças, 20 tarefas e os eventos do mês atual. Os vínculos são coerentes: o mesmo lead aparece no kanban, na agenda, nos orçamentos e, quando ganho, vira cliente com cobranças e notas. Recarregar a página volta ao estado inicial.

## Buscar clientes (Google Maps)

A seção **Comercial → Buscar clientes** (`/buscas`) usa uma cópia independente do motor de prospecção de `software-motor-de-buscas`. Permite buscar até dez nichos por cidade/UF e bairro, escolher abrangência (incluindo grade de nove regiões), coletar contatos e redes sociais, filtrar empresas sem site e importar os resultados como leads. O histórico, a fila e os resultados ficam em SQLite no serviço; os leads importados ficam no Postgres do CRM. Reimportações preservam o lead existente; a importação também verifica telefone e e-mail entre leads persistidos.

Com Docker aberto, execute na raiz:

```bash
npm run prospecting:engine  # Google Maps scraper: 127.0.0.1:8082
npm run prospecting:start   # Serviço Python: 127.0.0.1:8091 (manter rodando)
npm run dev                # CRM: seção Buscar clientes
```

Não é necessária chave do Google Maps. O motor depende de acesso à internet e as buscas podem demorar vários minutos ou sofrer bloqueios do Google. A fila executa uma busca por vez, continua ao fechar a página e guarda dados em `services/prospecting/painel/dados/` (ignorado pelo Git). Não apague essa pasta para preservar o histórico. O container e os volumes são separados dos usados pelo projeto original.

Para hospedar o CRM, o Python e o motor precisam rodar em uma máquina persistente: não são executados pela Vercel. Configure `PROSPECTING_URL` no servidor do CRM para apontar ao serviço por rede privada/túnel. O serviço escuta somente no loopback. Para um proxy privado, configure o mesmo `PROSPECTING_TOKEN` no CRM e no serviço Python; ele exige esse token em todas as requisições quando definido. Nunca publique a porta do motor diretamente.

Código adaptado em `services/prospecting/`, preservando a licença MIT do original. O adaptador autenticado e a importação estão em `lib/prospecting/`. Apenas Admin e Comercial podem acessar as buscas e suas ações. Os dados adicionais da empresa (site, endereço, categoria, avaliações e link do Maps) também são preservados no registro importado.

## Banco para desenvolvimento local

Esta cópia pode ser usada sem credenciais da Vercel/Neon. Com Docker aberto, rode:

```bash
npm run db:local
npm run dev
```

O comando cria `.env.local` com credenciais locais aleatórias e a chave de criptografia, inicia PostgreSQL em `127.0.0.1:5433` e aplica as migrações. Ele preserva variáveis já definidas e interrompe a configuração se encontrar uma conexão diferente da configuração local esperada. Os dados persistem no volume Docker `crm-mentoria-local_crm_postgres`. Acesse `/login`: num banco novo, o CRM abre `/primeiro-acesso` para cadastrar o administrador. O banco local é independente dos dados de produção.

O acesso ao PostgreSQL local usa `postgres-js`; conexões remotas Neon continuam usando o driver HTTP existente. Para produção, configure `DATABASE_URL`, `DATABASE_URL_UNPOOLED` e `APP_ENCRYPTION_KEY` no ambiente de hospedagem. Se o servidor de desenvolvimento já estiver aberto, o Next.js recarrega `.env.local`; reinicie `npm run dev` caso as variáveis não sejam reconhecidas.

### Pausa temporária do login local

Com `LOCAL_LOGIN_PAUSED=true` em `.env.local`, `npm run dev` abre o CRM diretamente com a identidade Administrador local. Essa identidade é persistida para manter a autoria das alterações, não possui senha utilizável e não conta como administrador cadastrado no fluxo de primeiro acesso. A pausa só funciona em `NODE_ENV=development`. Para reativar o login, remova a variável ou defina `LOCAL_LOGIN_PAUSED=false`. Builds de produção continuam exigindo autenticação.

## WhatsApp real por QR Code (Evolution API)

A seção **WhatsApp** (`/whatsapp`) conecta um número existente usando a Evolution API v2.3.7. A tela antiga de Evolution e o chat da ficha do lead agora usam a integração real. Os dados demonstrativos de mensagens não são exibidos nesse chat e as confirmações de entrega/leitura dependem dos eventos recebidos do provedor.

```bash
npm run db:migrate       # tabela whatsapp_messages
npm run whatsapp:local   # Evolution + Postgres próprio + Redis
npm run dev
```

Abra `/whatsapp`, clique em **Gerar QR Code** e, no celular, entre em WhatsApp → Aparelhos conectados → Conectar aparelho. A conexão só termina após a leitura do código. Apenas administradores gerenciam o vínculo; Admin, Comercial e Operação acessam conversas. O número de referência opcional fica em `EVOLUTION_PHONE` no `.env.local`; o QR Code será vinculado à conta do aparelho que o ler.

As mensagens individuais são recebidas em `/api/webhooks/evolution`, autenticadas por `x-webhook-token`, deduplicadas pelo ID do provedor e gravadas no Postgres. A caixa de entrada agrupa conversas por telefone e abre a ficha do lead quando há correspondência (incluindo a variação brasileira do nono dígito). O chat também está disponível na ficha do lead. Grupos e status são ignorados. O envio pelo CRM é de texto; anexos recebidos aparecem como indicação de tipo, sem download ou reprodução. O botão **Sincronizar recentes** consulta até 500 mensagens recentes disponíveis no provedor; o chat exibe até 200 mensagens por contato e a caixa de entrada considera as 2.000 mensagens mais recentes. A disponibilidade de histórico anterior depende da sincronização liberada pelo WhatsApp.

Configuração de servidor (nunca usar prefixo `NEXT_PUBLIC_`): `EVOLUTION_URL`, `EVOLUTION_API_KEY`, `EVOLUTION_INSTANCE`, `EVOLUTION_WEBHOOK_URL`, `EVOLUTION_WEBHOOK_TOKEN` e, opcionalmente, `EVOLUTION_PHONE`. O comando local gera os segredos em `.env.local`, preservando os existentes. A porta local da Evolution é `127.0.0.1:8083`; o webhook do Docker aponta para `host.docker.internal:3000`. Ajuste `EVOLUTION_WEBHOOK_URL` se o CRM usar outra porta. Em produção, hospede a Evolution num servidor persistente, com HTTPS e uma URL de webhook acessível por ela. O PostgreSQL e o Redis da Evolution não expõem portas no host.

Validação: `npm run whatsapp:test` executa treze testes de normalização de eventos. `scripts/check-whatsapp-api.mjs` verifica a API e autenticação do webhook; `scripts/check-whatsapp-webhook.mjs` valida persistência, deduplicação e recibos no banco **local**, removendo os registros sintéticos ao terminar. `scripts/check-whatsapp-connection.mjs` testa a geração de QR Code pelas Server Actions do servidor de desenvolvimento, sem enviar mensagens (a pausa de login local precisa estar ativa para esse teste). Nenhum desses testes envia mensagens para contatos.

Referências do provedor: [configuração oficial](https://github.com/EvolutionAPI/evolution-api/blob/main/.env.example), [criação e opções da instância](https://github.com/EvolutionAPI/evolution-api/blob/main/src/api/dto/instance.dto.ts), [eventos de webhook](https://github.com/EvolutionAPI/evolution-api/blob/main/src/api/integrations/event/event.dto.ts).

## Instagram: perfil próprio e mídias

A seção **Instagram** (`/instagram`) usa **Instagram API com Facebook Login**, para ler o perfil profissional que o usuário autorizar. Exibe nome, bio, site, foto, seguidores, seguindo, quantidade de publicações, galeria de fotos/carrosséis, Reels e stories ativos disponíveis. Curtidas e comentários são exibidos quando retornados pela Meta; números indisponíveis aparecem como `—`. Não há dados demonstrativos nessa seção. Não há publicação automática nem solicitação de senha do Instagram.

Para conectar:

1. Use um Instagram profissional (comercial ou criador) vinculado a uma Página do Facebook que você administra.
2. Configure um aplicativo em [Meta for Developers](https://developers.facebook.com/apps/) para usar Instagram API com Facebook Login. Em desenvolvimento, a conta utilizada precisa ter acesso ao aplicativo e às Páginas autorizadas; a liberação para outras contas pode exigir revisão da Meta.
3. Rode `npm run db:migrate` para criar `instagram_settings`, `instagram_accounts` e `instagram_oauth_states`.
4. A equipe técnica abre `/configuracoes/instagram` como Admin e preenche App ID, App Secret e a URL de retorno. Essa configuração não aparece na tela de uso `/instagram`. Registre **a mesma URL** na configuração de OAuth do aplicativo Meta. Localmente a sugestão é `http://localhost:3000/api/instagram/callback`; em produção use o endereço HTTPS real do CRM, respeitando também os requisitos de domínio e redirecionamento da Meta. `INSTAGRAM_REDIRECT_URI` pode fornecer a sugestão inicial de URL, mas as credenciais são salvas pela tela.
5. Clique em **Conectar Instagram** e autorize sua conta na Meta. Se houver mais de um perfil autorizado, escolha o perfil desejado no CRM.
6. A primeira sincronização acontece ao conectar ou selecionar o perfil. O botão **Sincronizar** atualiza perfil, 25 mídias recentes e stories; **Carregar mais mídias** consulta as próximas páginas.

As permissões solicitadas são somente `pages_show_list`, `pages_read_engagement` e `instagram_basic`. Não são solicitadas permissões para publicar, gerenciar mensagens ou anúncios. O App Secret e os tokens das Páginas ficam criptografados com `APP_ENCRYPTION_KEY` no Postgres e não são retornados ao navegador. A versão padrão é `v25.0` e pode ser ajustada na tela. A autorização usa state aleatório com validade de dez minutos, hash no banco, cookie HTTP-only e validação de usuário/navegador; cada tentativa só pode ser consumida uma vez. Em produção, esse fluxo exige o login normal do CRM.

Admin configura, conecta, seleciona perfil, sincroniza e desconecta. Admin, Comercial e Operação podem consultar os dados sincronizados. Desconectar remove do CRM o token e a cópia local do perfil selecionado, sem excluir publicações do Instagram. Outros perfis previamente autorizados continuam disponíveis para seleção. A revogação de permissões do aplicativo junto à Meta é administrada na própria Meta.

**Limites:** a integração não lista destaques; a aba correspondente direciona ao perfil original. Stories exigem disponibilidade e permissão do provedor, são consultados separadamente, e mídias com mais de 24 horas deixam de aparecer como ativas. Se a consulta de stories ou publicações falhar, o CRM informa o problema e preserva a última cópia disponível. Links de mídia podem expirar: sincronize novamente para renová-los. Não são apresentados alcance, impressões ou outros insights avançados nesta implementação; os indicadores disponíveis são os dados básicos do perfil e os contadores das mídias.

**Verificação:** `npm run instagram:test` cobre normalização de perfil/mídias, expiração de stories, paginação sem duplicatas, URLs, envio de token por header, prova do segredo e erros sem vazamento. `npm run instagram:check` testa as rotas locais, criptografia, estado OAuth, vínculo ao navegador, cancelamento e bloqueio de reuso. Esse último exige o servidor `npm run dev`, banco local e `LOCAL_LOGIN_PAUSED=true`; só cria configuração temporária se nenhuma configuração real existir e a remove ao terminar. Não autoriza uma conta Meta nem chama APIs de contas reais.

Referências: [coleção oficial de APIs do Instagram da Meta](https://www.postman.com/meta/instagram/documentation/6yqw8pt/instagram-api), [perfil profissional](https://developers.facebook.com/docs/instagram-platform/instagram-graph-api/reference/ig-user/), [stories](https://developers.facebook.com/docs/instagram-platform/instagram-graph-api/reference/ig-user/stories/) e [fluxo OAuth do Facebook Login](https://developers.facebook.com/docs/facebook-login/guides/advanced/manual-flow/).

## Google Agenda: conexão por usuário e eventos reais

A **Agenda** (`/agenda`) agora oferece a integração oficial com Google Calendar. O usuário clica em **Conectar Google Agenda**, escolhe sua conta, autoriza e seleciona uma agenda. Não precisa encontrar credenciais. Cada autorização, token e cópia de eventos é isolada pelo usuário autenticado do CRM; desconectar uma conta não altera as conexões dos demais usuários.

### Configuração única da plataforma

A equipe técnica abre **Configurações → Google Agenda** (`/configuracoes/google-agenda`, somente Admin), habilita a Google Calendar API em seu projeto Google Cloud, configura a tela de consentimento e cadastra um cliente OAuth do tipo Aplicativo da Web. Preenche Client ID, Client Secret e a URL de retorno exata cadastrada no Google. Localmente a sugestão é `http://localhost:3000/api/google-calendar/callback`; em produção use o endereço HTTPS real. `GOOGLE_CALENDAR_REDIRECT_URI` pode fornecer a sugestão inicial. O formulário técnico fica separado da tela de uso, e os segredos são criptografados com `APP_ENCRYPTION_KEY`.

Antes de rodar, aplique `npm run db:migrate`. As tabelas são `google_calendar_settings`, `google_calendar_connections` e `google_calendar_oauth_states`. No modo de testes do aplicativo Google, inclua os usuários de teste na configuração da tela de consentimento; a abertura para outras contas pode depender da verificação e das políticas do Google/Workspace. Sem credenciais reais do aplicativo, a agenda informa que a conexão está em preparação, sem simular sucesso.

O OAuth solicita `openid`, `email`, `calendar.calendarlist.readonly` e `calendar.events`. Usa acesso offline para renovar a autorização, state aleatório com hash, validade de dez minutos, cookie HTTP-only e consumo único vinculado ao usuário e navegador. A identidade vem do endpoint oficial de userinfo, e os tokens são enviados por header Bearer. Nenhum token ou Client Secret aparece nas respostas de uso ou em mensagens de erro do provedor. A pausa de login permanece restrita ao ambiente de desenvolvimento; para autorizações pessoais de vários usuários, use o login real do CRM.

### Funcionamento

- Ao abrir a agenda ou mudar o período, o CRM consulta a agenda Google selecionada. Com a tela visível, atualiza a cada minuto; o botão **Sincronizar** faz a consulta imediatamente. Não há webhook nem sincronização em segundo plano com a tela fechada nesta versão.
- O período inclui as semanas que contêm o intervalo visível, com limite de 100 dias por consulta, paginação completa e até 12.500 recursos. Uma falha de consulta preserva a cópia anterior. Novos snapshots não sobrescrevem alterações locais concorrentes. Recursos cancelados deixam de aparecer após a próxima consulta completa do período.
- Recorrências são expandidas em ocorrências. A grade oferece as 24 horas do dia, inclusive continuações após a meia-noite. Eventos de dia inteiro aparecem em uma faixa própria e preservam a data sem conversão para UTC.
- A agenda usa exclusivamente eventos da conexão Google do usuário. Eventos demonstrativos e registros locais antigos não são carregados. Ao criar um evento, o formulário informa a agenda Google de destino e exige uma conexão com permissão de edição. Não há criação de eventos apenas locais. Os eventos Google em cache também são carregados no bootstrap para o dashboard e demais telas.
- A criação usa um ID determinístico por usuário e tentativa para evitar duplicatas ao repetir um envio cuja resposta se perdeu. A interface só confirma o salvamento após a resposta do Google e persistência local.
- Eventos Google comuns podem ser editados e excluídos no CRM quando a agenda permite. Atualizações e exclusões usam ETag/If-Match para não sobrescrever alterações feitas no Google. A edição de uma recorrência afeta somente a ocorrência escolhida. Ao editar, os lembretes, dados de conferência e metadados privados de outros aplicativos são preservados; o vínculo de reunião e os lembretes existentes são consultivos no formulário. Novos eventos podem incluir link e lembrete pop-up.
- Agendas de leitura, eventos especiais e eventos de dia inteiro são consultivos no CRM, com link para gerenciá-los no Google. A caixa de confirmação de exclusão identifica quando a alteração também será aplicada ao Google.
- A sincronização não cria convidados nem exporta listas de clientes. Não é criada uma videoconferência Meet automaticamente. O status de Google Agenda em **Integrações** agora usa a conexão real do usuário; a tela antiga de teste simulado foi substituída pelo mesmo fluxo de conexão.
- Desconectar remove do CRM os tokens e a cópia local da agenda desse usuário, sem excluir eventos do Google. A autorização do aplicativo na conta Google pode ser administrada nas configurações da própria conta.

### Verificação

`npm run google-calendar:test` executa nove testes de normalização, permissões, datas, IDs, payloads, ETag, erros e eventos noturnos. `npm run google-calendar:check` verifica as telas e o fluxo OAuth no servidor local, sem autorizar uma conta Google; exige `npm run dev`, banco local e `LOCAL_LOGIN_PAUSED=true`, preserva uma configuração real existente e remove qualquer configuração fictícia criada pelo teste. `npm run google-calendar:check-actions` testa as Server Actions com Postgres em schema temporário isolado e API Google simulada: renovação de token, paginação, falhas, permissões, isolamento, criação sem duplicação, edição, exclusão, revogação e desconexão. Não envia eventos a contas reais. Requer acesso ao banco local, e remove o schema ao terminar.

Referências: [OAuth oficial](https://developers.google.com/identity/protocols/oauth2/web-server), [permissões Calendar](https://developers.google.com/workspace/calendar/api/auth), [lista de agendas](https://developers.google.com/workspace/calendar/api/v3/reference/calendarList/list), [consulta de eventos](https://developers.google.com/workspace/calendar/api/v3/reference/events/list), [criação](https://developers.google.com/workspace/calendar/api/v3/reference/events/insert) e [edição](https://developers.google.com/workspace/calendar/api/v3/reference/events/patch).


### Respostas automáticas/IA e identificadores LID

O CRM trata mensagens de entrada e saída da mesma instância, incluindo respostas enviadas por automações externas. Quando o WhatsApp usa um LID sem telefone no registro de saída, a mensagem é preservada e o vínculo confirmado em outra mensagem ou evento de contato é salvo em `whatsapp_contacts`. A associação é isolada por instância e nunca é inferida pelos dígitos do LID, pelo nome do contato ou pelo número do próprio remetente. Mensagens sem vínculo conhecido aparecem em uma conversa identificada como aguardando telefone, com envio desabilitado até a identificação. Quando o vínculo chega depois da resposta, o telefone é recuperado automaticamente, inclusive para mensagens já armazenadas.

A leitura da caixa de entrada e das conversas reconcilia as 100 mensagens mais recentes do provedor com intervalo mínimo de 15 segundos por processo/instância. Assim, respostas perdidas pelo webhook também podem aparecer enquanto a tela estiver aberta. A sincronização manual consulta até cinco páginas globais e, nas conversas individuais, pesquisa as variantes confirmadas do telefone e os LIDs associados. Recibos de leitura são preservados ao importar mensagens repetidas, sem criar duplicatas nem regredir o status para enviada.

`scripts/repair-whatsapp-history.mjs` recupera o histórico recente e adiciona eventos de contatos somente quando o webhook ativo já aponta para a URL configurada do CRM, preservando endereço, headers e eventos existentes. `scripts/inspect-whatsapp-sync.mjs` exibe apenas estado, contagens e nomes de campos, sem conteúdo de conversas. `scripts/check-whatsapp-inbox.mjs` verifica mensagens de saída em conversas identificadas e pendentes pela API da tela. Nenhum desses scripts envia mensagens a contatos.


### Vendas sem dados demonstrativos

A carga do CRM e os getters de vendas usam apenas negócios criados no banco (`crm_records`, recurso `deals`, `created=true`, sem exclusão). Negócios demonstrativos e seus patches não são reaplicados. A limpeza de vendas fictícias preserva os registros cadastrados pelo usuário; Vendas, Kanban, Funil e indicadores derivados compartilham a mesma coleção real. O gerador de outras áreas não foi alterado, mantendo estáveis os IDs dos demais dados existentes.


### Leads sem dados demonstrativos

A lista de leads e seus getters usam exclusivamente registros criados no banco, sem gerar leads fictícios na carga. A limpeza inicial remove os registros locais existentes da lista ativa conforme solicitado pelo responsável. Novos leads cadastrados ou importados depois dessa limpeza continuam disponíveis normalmente. As mensagens reais do WhatsApp e os resultados de buscas não são excluídos por essa limpeza.
