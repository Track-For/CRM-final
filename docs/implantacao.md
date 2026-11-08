# Implantação e verificação

Veja também `docs/preparacao-hospedagem.md` para o estado da preparação local, comandos de backup e pendências que dependem das contas do proprietário.

O CRM Next.js pode rodar na Vercel ou em servidor Node. Postgres é obrigatório. Evolution, Redis e motor Python/Google Maps precisam de servidor persistente; não rodam nas funções da Vercel.

1. Configure `DATABASE_URL`, `DATABASE_URL_UNPOOLED`, `APP_ENCRYPTION_KEY` (32 bytes em base64), `CRM_PUBLIC_URL` (HTTPS) e SMTP conforme `.env.example`. Preserve a chave de criptografia entre implantações para manter acesso aos tokens existentes.
2. Faça backup do Postgres e aplique `npm run db:migrate` antes de publicar esta versão. A migração 0008 acrescenta `active` e `whatsapp` a usuários existentes, preservando o acesso.
3. Execute `npm ci`, `npm run lint`, `npm run typecheck`, `npm test`, `npm run prospecting:test`, `npm run crm:check` (somente banco local) e `npm run build`. O GitHub Actions executa esses passos com Postgres temporário e sem credenciais reais.
4. Publique e configure Asaas e Brasil NFe pelas telas de integrações. Confirme ambiente e certificado fiscal na plataforma correspondente. A checagem automática não emite cobranças nem notas.
5. No Asaas, cadastre `https://SEU-DOMINIO/api/webhooks/asaas` e o token exibido na integração. No Evolution, configure `EVOLUTION_WEBHOOK_URL=https://SEU-DOMINIO/api/webhooks/evolution` e `EVOLUTION_WEBHOOK_TOKEN` igual ao enviado em `x-webhook-token`. Conecte pelo QR Code.
6. Hospede a prospecção em rede privada. Defina `PROSPECTING_URL` no CRM e o mesmo `PROSPECTING_TOKEN` no CRM e serviço Python. Preserve os volumes SQLite, Postgres e Redis; não exponha a porta do scraper.
7. Cadastre o aplicativo Google Agenda nas configurações administrativas, incluindo o callback HTTPS exato `/api/google-calendar/callback`. Cada usuário conecta a agenda pela própria conta.
8. Execute `npm run readiness:check` no ambiente alvo. O comando consulta estado e configuração sem exibir segredos. Presença de token não confirma cadastro de webhook, entrega de e-mail ou autorização OAuth: confira esses pontos nos respectivos painéis.
9. Em navegador anônimo, valide `/login` e um formulário ativo `/f/slug`. Envie um lead de teste identificado, confira a entrada no CRM e remova-o depois. Valide os acessos com usuários dos quatro papéis. Convites expiram em 48 horas e são usados uma única vez.

## n8n e API

Webhooks de saída usam HTTPS público na porta 443. O servidor bloqueia redes privadas, metadados e redirecionamentos, resolve DNS e fixa o endereço na conexão. Cada POST envia `X-Solid-Event`, `X-Solid-Delivery` e `X-Solid-Signature` (HMAC SHA-256 do corpo). O teste envia um payload com `test: true`; confira o fluxo de destino antes de executá-lo. Entregas são persistidas antes da primeira chamada HTTP. Falhas de conexão, HTTP 408/425/429 e 5xx são repetidas automaticamente: até seis tentativas por ciclo, com espera de 30 s, 1 min, 2 min, 4 min e 8 min. Outros HTTP não 2xx exigem revisão. O ID e o payload permanecem iguais; o receptor deve deduplicar por `X-Solid-Delivery`, pois uma interrupção após o destino receber o evento pode causar reentrega. Webhooks pausados/removidos não são enviados. O reenvio manual inicia outro ciclo e também aceita logs antigos de erro.

`npm start` e `npm run dev` executam Next.js e a fila juntos, encerrando ambos se um processo falhar para permitir reinicialização pelo supervisor da hospedagem. Se o provedor separar processos, mantenha `npm run webhooks:worker` ativo ou agende `npm run webhooks:process` a cada minuto. Reservas de dois minutos evitam envio simultâneo por workers e retomam trabalhos interrompidos. Em **Integrações → Logs**, confira tentativas e próxima execução; `readiness:check` verifica atividade recente do worker. Hospedagens que executam apenas `next start` precisam iniciar o worker separadamente.

As chaves são geradas no servidor e mostradas uma única vez; o banco guarda somente SHA-256. Use `Authorization: Bearer TOKEN` em `/api/v1/leads`, `/api/v1/deals`, `/api/v1/tasks` ou `/api/v1/charges`, conforme o escopo da chave. Revogar bloqueia o uso imediatamente.

- `GET /api/v1/leads`, `/deals`, `/charges`: `limit` (até 100) e `offset`.
- `POST /api/v1/leads`: `name`, `email`, `whatsapp`, `company`.
- `POST /api/v1/tasks`: `title`, `description`, `dueDate` (ISO), `clientId`.
- `POST /api/v1/deals`: `id` existente e os campos `title`, `nextAction`, `nextActionDate`. Mudanças de etapa e financeiro continuam pelo CRM para preservar suas regras.

## Operação contínua

Mantenha backups automáticos e teste a restauração em banco separado. Configure monitoramento HTTP do login e alertas nos logs do provedor de hospedagem. Essa configuração depende de acesso às contas de produção e não é criada pelos scripts locais. A leitura de status não substitui o teste completo de uma integração autorizada com um contato/registro de teste.

## Verificação desta cópia local (06/11/2026)

Banco/migração, chave de criptografia, Asaas/token de webhook, aplicativo Google Agenda, WhatsApp conectado e motor de prospecção responderam à checagem. Faltam SMTP, URL pública, configuração do Brasil NFe neste ambiente. Não há projeto Vercel vinculado nesta cópia. O build Webpack passou; o Turbopack foi impedido pelo ambiente de abrir uma porta local, inclusive na tentativa com execução ampliada. Esses resultados não confirmam o estado de outra instalação de produção.
