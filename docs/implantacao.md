# Implantação e verificação

Veja também `docs/preparacao-hospedagem.md` para o estado da preparação local, comandos de backup e pendências que dependem das contas do proprietário.

O CRM Next.js pode rodar na Vercel ou em servidor Node. Postgres é obrigatório. Evolution, Redis e motor Python/Google Maps precisam de servidor persistente; não rodam nas funções da Vercel.

1. Configure `DATABASE_URL`, `DATABASE_URL_UNPOOLED`, `APP_ENCRYPTION_KEY` (32 bytes em base64), `CRM_PUBLIC_URL` (HTTPS) e SMTP conforme `.env.example`. Preserve a chave de criptografia entre implantações para manter acesso aos tokens existentes.
2. Faça backup do Postgres e aplique `npm run db:migrate` antes de publicar esta versão. A migração 0008 acrescenta `active` e `whatsapp` a usuários existentes, preservando o acesso.
3. Execute `npm ci`, `npm run lint`, `npm run typecheck`, `npm test`, `npm run prospecting:test`, `npm run crm:check` (somente banco local) e `npm run build`. O GitHub Actions executa esses passos com Postgres temporário e sem credenciais reais.
4. Publique e configure Asaas e Brasil NFe pelas telas de integrações. Confirme ambiente e certificado fiscal na plataforma correspondente. A checagem automática não emite cobranças nem notas.
5. No Asaas, cadastre `https://SEU-DOMINIO/api/webhooks/asaas` e o token exibido na integração. No Evolution, configure `EVOLUTION_WEBHOOK_URL=https://SEU-DOMINIO/api/webhooks/evolution` e `EVOLUTION_WEBHOOK_TOKEN` igual ao enviado em `x-webhook-token`. Conecte pelo QR Code.
6. Hospede a prospecção em rede privada. Defina `PROSPECTING_URL` no CRM e o mesmo `PROSPECTING_TOKEN` no CRM e serviço Python. Preserve os volumes SQLite, Postgres e Redis; não exponha a porta do scraper.
7. Cadastre os aplicativos Google Agenda e Instagram nas configurações administrativas, incluindo callbacks HTTPS exatos `/api/google-calendar/callback` e `/api/instagram/callback`. Cada usuário conecta a agenda pela própria conta.
8. Execute `npm run readiness:check` no ambiente alvo. O comando consulta estado e configuração sem exibir segredos. Presença de token não confirma cadastro de webhook, entrega de e-mail ou autorização OAuth: confira esses pontos nos respectivos painéis.
9. Em navegador anônimo, valide `/login` e um formulário ativo `/f/slug`. Envie um lead de teste identificado, confira a entrada no CRM e remova-o depois. Valide os acessos com usuários dos quatro papéis. Convites expiram em 48 horas e são usados uma única vez.

## n8n e API

Webhooks de saída usam HTTPS público na porta 443. O servidor bloqueia redes privadas, metadados e redirecionamentos, resolve DNS e fixa o endereço na conexão. Cada POST envia `X-Solid-Event`, `X-Solid-Delivery` e `X-Solid-Signature` (HMAC SHA-256 do corpo). O teste envia um payload com `test: true`; confira o fluxo de destino antes de executá-lo. Entregas malsucedidas ficam em Logs e podem ser reenviadas manualmente. O receptor deve deduplicar pelo ID de entrega. Não há fila automática de novas tentativas.

As chaves são geradas no servidor e mostradas uma única vez; o banco guarda somente SHA-256. Use `Authorization: Bearer TOKEN` em `/api/v1/leads`, `/api/v1/deals`, `/api/v1/tasks` ou `/api/v1/charges`, conforme o escopo da chave. Revogar bloqueia o uso imediatamente.

- `GET /api/v1/leads`, `/deals`, `/charges`: `limit` (até 100) e `offset`.
- `POST /api/v1/leads`: `name`, `email`, `whatsapp`, `company`.
- `POST /api/v1/tasks`: `title`, `description`, `dueDate` (ISO), `clientId`.
- `POST /api/v1/deals`: `id` existente e os campos `title`, `nextAction`, `nextActionDate`. Mudanças de etapa e financeiro continuam pelo CRM para preservar suas regras.

## Operação contínua

Mantenha backups automáticos e teste a restauração em banco separado. Configure monitoramento HTTP do login e alertas nos logs do provedor de hospedagem. Essa configuração depende de acesso às contas de produção e não é criada pelos scripts locais. A leitura de status não substitui o teste completo de uma integração autorizada com um contato/registro de teste.

## Verificação desta cópia local (06/11/2026)

Banco/migração, chave de criptografia, Asaas/token de webhook, aplicativo Google Agenda, WhatsApp conectado e motor de prospecção responderam à checagem. Faltam SMTP, URL pública, configuração do Brasil NFe e aplicativo Instagram neste ambiente. Não há projeto Vercel vinculado nesta cópia. O build Webpack passou; o Turbopack foi impedido pelo ambiente de abrir uma porta local, inclusive na tentativa com execução ampliada. Esses resultados não confirmam o estado de outra instalação de produção.
