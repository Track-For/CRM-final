# Revisão local — 06/11/2026

Revisão das alterações pendentes de interface, navegação, ações diárias, contexto do WhatsApp, acompanhamento de projetos, modelos de mensagens e envio para leads.

## Correções realizadas

- O envio compara o destinatário revisado com o contato atual do lead no servidor. Se outro usuário alterar o contato durante a revisão, o envio é bloqueado para nova conferência. O navegador não escolhe o destinatário efetivo.
- O painel do WhatsApp não escolhe arbitrariamente um lead ou cliente quando há cadastros duplicados para o telefone. Exibe um aviso e omite o contexto associado; LID sem telefone continua sem associação.
- Links com `?tarefa=` e `?cobranca=` abrem o registro correspondente também quando a navegação altera somente os parâmetros da página atual.
- A categoria dos modelos fica desabilitada durante a gravação, recebe um rótulo acessível e há proteção contra acionamentos simultâneos de salvar/excluir.
- O QR Pix ilustrativo foi substituído pela codificação real do texto da cobrança com a biblioteca `qrcode` já instalada. Há margem branca para leitura e indicação de uso do copia e cola caso a geração falhe. O componente de barras ilustrativas sem uso foi removido.
- O teste de persistência dos modelos foi atualizado para os campos atuais. Foram acrescentados testes de destinatário alterado, SMTP aceito/rejeitado, falha de gravação do histórico após envio e associação ambígua de contatos.

## Verificação

- `npm run lint`, `npm run typecheck` e `npm run build`: passaram.
- `npm test`: 71 testes passaram, com transportes externos simulados.
- `npm run crm:check`: passou em schema temporário do Postgres local.
- `npm run sales:check`: passou no ciclo formulário → lead → etapas → proposta → venda ganha → cliente/projeto → parcelas → baixa local → mensalidade → entrega, incluindo reconversão sem duplicação.
- `npm run hermes:test`: 6 testes passaram.
- `npm run prospecting:test`: 21 testes passaram, incluindo falhas simuladas de armazenamento.
- Inspeção no navegador desktop: início, lista de modelos, preenchimento de variáveis na ficha de lead, revisão antes do envio, bloqueio do e-mail sem configuração, navegação Vendas/Kanban e abertura/edição do acompanhamento de projeto sem gravar alterações.
- QR Pix: o componente real foi renderizado em PNG de 140 × 140 pixels com conteúdo sintético de 226 caracteres. O leitor independente Apple Vision decodificou exatamente o conteúdo original. Isso verifica a codificação e a leitura do QR, sem validar ou realizar um pagamento.

## Limites desta revisão

Não foram enviados e-mails ou mensagens, emitidas notas ou cobranças, nem efetuados pagamentos reais. Os testes com banco usam schemas temporários removidos ao terminar. A inspeção no navegador não inclui uma homologação móvel completa ou a operação com todos os perfis de produção.

Antes da entrega comercial, permanecem a publicação, SMTP e as conexões e homologações externas descritas em `implantacao.md`, incluindo confirmação de pagamento pelo webhook do Asaas. O ciclo de baixa manual local não comprova essa confirmação externa. Nenhuma publicação ou commit foi realizado nesta revisão.

## Validação complementar

- Autenticação real com contexto de cookies simulado e Postgres temporário: primeiro administrador, impedimento de repetir primeiro acesso, senha incorreta, bloqueio após cinco tentativas, desafio por e-mail, limite de reenvio, verificação de código, TOTP, logout, sessão expirada, usuário desativado e identidade dos quatro perfis passaram. Os cookies de produção são seguros e HTTP-only; o banco armazena o hash do token de sessão. A pausa de desenvolvimento é ignorada em produção. Com SMTP ausente, o envio de código em produção é bloqueado. Comando: `npm run auth:check`.
- Instância local do build em modo produção, porta 3001: páginas privadas redirecionam anônimos e cookies inválidos para login; API sem chave retorna 403; webhooks Asaas/Evolution e contexto Hermes sem credenciais retornam 401. Nenhum dado foi enviado a provedores.
- Google Agenda: o teste encontrou renovação duplicada de token em chamadas simultâneas. A reserva da promessa foi movida para antes das leituras assíncronas. Após a correção, passaram concorrência, criptografia, paginação, cache preservado em falha, criação idempotente, edição por ETag, exclusão, agenda somente leitura, isolamento entre usuários e revogação. Google simulado; comando `npm run google-calendar:check-actions`.
- Asaas: emissão e exclusão passaram nos simuladores existentes. O novo `npm run asaas:check-webhook` passou com eventos sintéticos no handler real: autenticação, baixa da cobrança e lançamento, data recebida do evento, deduplicação, evento atrasado, estorno, restauração e preservação de exclusão local. Isso não confirma que o painel Asaas esteja entregando eventos ao domínio público.
- Inspeção a 390 × 844 pixels no Chrome: início, menu móvel, orçamentos, modelos, Kanban com gesto lateral em área vazia, lista e abertura de conversa do WhatsApp e primeiro acesso. Sem alteração de cartões, envios ou criação de contas. Não é teste em aparelho físico nem homologação de todos os fluxos móveis.
- Formulários: as regras de validação, persistência, idempotência e limite de envios passaram nos testes isolados do CRM e do ciclo de vendas. Não existe formulário ativo nesta base para homologar uma página pública configurada.

### Pendências confirmadas nesta base

Não há usuários definitivos nem administrador definitivo; há somente a identidade de desenvolvimento. O modo produção encaminha para `/primeiro-acesso`. O proprietário precisa definir suas credenciais, e o SMTP precisa ser preparado para o primeiro login sem autenticador. A checagem de prontidão agora distingue o administrador definitivo da identidade local.

Também faltam URL pública HTTPS, formulário ativo, SMTP, configuração Brasil NFe e aplicativo Instagram. WhatsApp respondeu conectado, Asaas tem chave e token de webhook cadastrados e o aplicativo Google Agenda está cadastrado; esses estados não comprovam envio externo, OAuth concluído por usuário ou entrega de webhooks. O serviço de prospecção não respondeu nesta checagem. Publicação, backups externos, monitoramento e recuperação continuam dependentes do ambiente de hospedagem.
