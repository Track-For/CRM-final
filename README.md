# Track For CRM

CRM com Next.js 16, React 19, TypeScript, Postgres/Drizzle, Zustand e Tailwind 4. Leads, negócios, clientes, orçamentos, tarefas, formulários, financeiro e configurações são persistidos. O projeto usa integrações reais para Asaas, Brasil NFe, Evolution/WhatsApp, Instagram e Google Agenda, mediante configuração dos provedores.

## Desenvolvimento

```bash
npm ci
npm run db:local
npm run dev
```

O projeto utiliza `legacy-peer-deps` em `.npmrc`. Com Postgres local configurado, `predev` inicia o Docker Desktop no macOS quando necessário, aguarda o banco e aplica migrações. Conexões remotas não são alteradas. Num banco novo, `/primeiro-acesso` cria o administrador. A sessão dura 24 horas e o login exige senha mais código por e-mail ou autenticador.

`LOCAL_LOGIN_PAUSED=true` permite desenvolvimento local sem login e só funciona em `NODE_ENV=development`. Produção continua autenticada. SMTP é obrigatório para códigos por e-mail em produção; em desenvolvimento sem SMTP o código é impresso no terminal.

## Funcionalidades e dados

- O estado inicial não contém leads, cobranças ou mensagens de demonstração. Funis e categorias iniciais servem como configuração padrão. Usuários são carregados da tabela real de autenticação.
- Coleções do CRM usam `crm_records`; fiscal, autenticação e integrações específicas têm tabelas próprias. O servidor aplica permissões por recurso. Alterar o estado do navegador não concede acesso no servidor.
- Alterações mostram estado de gravação. Falhas bloqueiam a continuação até recarregar os registros confirmados. Gravações no mesmo registro são ordenadas.
- Configurações de catálogo, adicionais, planos, funis, motivos de perda, mensagens rápidas e categorias são persistidas. Usuários administradores criam convites de uso único, válidos por 48 horas, e copiam o link para compartilhar. Alterar papel ou desativar revoga sessões existentes. O sistema não informa envio automático de um convite que não enviou.
- Formulários `/f/slug` funcionam sem login e gravam o lead no servidor. Campos são validados, envios repetidos usam idempotência e o limite é de 10 requisições por IP a cada 10 minutos. O retorno de sucesso só aparece após confirmação do banco.
- Orçamentos geram PDF com dados da proposta atual, escopo, pagamento e valores. As fichas de cliente e cobrança usam a mesma emissão, consulta, cancelamento e arquivos fiscais reais da tela de Notas fiscais.
- Webhooks n8n têm teste HTTP real, assinatura HMAC, registro de entregas e reenvio manual. Chaves de API têm escopos, revogação e armazenamento somente do hash. Veja os endpoints em [Implantação](docs/implantacao.md).

## Etapas dos projetos

Acesse **Clientes → abrir cliente → Projetos → Acompanhar projeto**. O painel permite adicionar e ordenar etapas, definir responsáveis, datas, descrições e status, criar ou vincular tarefas e acompanhar o progresso. Admin, Comercial e Operação editam o planejamento; Financeiro consulta.

Projetos de vendas ganhas são persistidos automaticamente, inclusive para o acesso da Operação. Quando há orçamento vinculado, o projeto começa com o cronograma previsto (priorizando o orçamento aceito); sem orçamento, as datas de entrega ficam a definir. Planos já existentes são preservados. Projetos antigos recebem etapas ao abrir o acompanhamento.

O progresso conta as etapas concluídas. Uma etapa com tarefas abertas precisa ter suas tarefas concluídas antes de ser finalizada. Etapas com tarefas devem ser desvinculadas antes da remoção. O salvamento detecta edições simultâneas para evitar sobrescrever o planejamento de outra pessoa.

Etapas de execução podem ser vinculadas a etapas de pagamento por Admin ou Comercial. As cobranças seguem em **Cobranças**, com atalho disponível aos perfis financeiros. Concluir uma etapa de execução não emite cobrança automaticamente.

## Integrações

**Asaas:** configure chave e ambiente em `/integracoes/asaas`. Vincule clientes e emita cobranças pelo CRM. Configure o webhook do provedor para conciliação automática. Pix/cartão manuais continuam como registro local. Cobranças de projetos e mensalidades também são derivadas das regras de negócio no servidor.

**Brasil NFe:** configure token, ambiente, município e padrões de serviço em `/integracoes/brasil_nfe`; cadastre certificado e empresa no provedor. Notas em processamento são consultadas a cada 10 segundos na listagem. PDF/XML são servidos pela rota autenticada `/api/notas-fiscais/[id]/arquivo`.

**WhatsApp:** execute `npm run whatsapp:local` e conecte em `/whatsapp` pelo QR Code. Configure as variáveis `EVOLUTION_*` do exemplo. O envio pelo CRM é de texto; anexos recebidos são indicados pelo tipo, sem reprodução/download. A sincronização consulta até 500 mensagens disponíveis no provedor, com até 200 por contato e 2.000 na caixa de entrada. Histórico anterior depende do WhatsApp.

**Instagram e Google Agenda:** cadastre os aplicativos nas configurações administrativas e faça a autorização nas telas correspondentes. O Instagram exibe perfil próprio profissional e mídias; não inclui mensagens diretas, publicação de conteúdo ou captura de leads por anúncios. A agenda usa tokens e eventos isolados por usuário.

**Buscar clientes:** execute `npm run prospecting:engine` e `npm run prospecting:start`. O CRM usa serviço Python/SQLite em `127.0.0.1:8091` e scraper em `127.0.0.1:8082`. As buscas usam Google Maps sem chave, podem demorar e dependem da disponibilidade externa. Preserve `services/prospecting/painel/dados/`. Em produção, esses serviços precisam de máquina persistente e rede privada.

Os cartões genéricos de WhatsApp Cloud/Meta Lead Ads ainda não implementam esses provedores. Salvar dados de configuração não ativa a integração e não há teste simulado de conexão.

## IA do WhatsApp com Hermes

Em **WhatsApp → Hermes e dados do CRM**, o administrador pode criar um acesso de consulta para o Hermes da Hostinger. Projetos, propostas e financeiro têm permissões separadas. A ferramenta identifica o contato pela conversa individual e devolve somente os campos de atendimento desse cadastro, com encaminhamento para a equipe em caso de cadastro desconhecido ou ambíguo.

O plugin e o endpoint estão no repositório; a instalação no Hermes, a URL HTTPS e a validação do agente remoto precisam ser concluídas no ambiente de hospedagem. Instruções: [docs/hermes-whatsapp.md](docs/hermes-whatsapp.md).

## Validação

```bash
npm run lint
npm run typecheck
npm test
npm run prospecting:test
npm run crm:check
npm run build
# Se o ambiente impedir o Turbopack de abrir uma porta local:
npm run build -- --webpack
npm run readiness:check
```

`crm:check` exige Postgres local, usa schema temporário e remove os dados sintéticos ao terminar. Cobre permissões, persistência, criptografia, convites, revogação de sessões, formulários públicos, idempotência, limites e API. Os testes não enviam mensagens, não emitem notas e não criam cobranças reais. `readiness:check` apenas consulta configuração e disponibilidade; pode apontar pendências esperadas no desenvolvimento local. O GitHub Actions valida código, testes, migração e build.

Instruções de implantação, variáveis, webhooks e verificações externas: [docs/implantacao.md](docs/implantacao.md). Nenhum comando de desenvolvimento publica automaticamente em produção.
