# Gestão comercial e API

Acesse **Gestão comercial** no menu. Os dados são persistidos no PostgreSQL, em recursos separados da tabela `crm_records`; não é necessária uma migração de estrutura.

## Metas

Admin e Comercial cadastram e editam metas mensais. O indicador padrão é **Receita recebida (projetos + mensalidades)**: soma pagamentos do mês pela data real de recebimento, sem contratos pendentes e sem usar a data de cadastro. Também existem indicadores explícitos de valor contratado, quantidade de contratos ganhos e novos leads. Financeiro pode acompanhar. Metas podem abranger toda a equipe ou um responsável; metas de vendas também podem selecionar um funil. O resultado considera a data real de ganho (`wonAt`) e a data de criação do lead. Metas de leads não usam filtro de funil. Vendas de projeto e mensalidades não são somadas.

## Previsão

O mês considera o fuso America/Sao_Paulo. A receita recebida usa a data de pagamento (`paidAt`) e inclui parcelas de projeto, mensalidades efetivamente pagas e receitas avulsas. Uma cobrança e seu lançamento financeiro espelho contam uma única vez. Registros pendentes, cancelados, arquivados ou sem data de pagamento válida não compõem o recebido; vencimento e data de ganho não substituem o pagamento. O painel destaca as mensalidades recebidas como parte do total, sem somá-las novamente. Valores de contrato continuam disponíveis como indicadores comerciais separados.

O cadastro de negócio pede a data de início (`startDate`), usada também ao criar o projeto. A confirmação de ganho permite escolher a data real do fechamento (`wonAt`), com hoje como padrão; o histórico mantém a data efetiva da alteração. A previsão de fechamento (`expectedCloseDate`) é opcional na edição e na API. Na previsão comercial, negócios abertos usam `expectedCloseDate`. Sem data válida, um negócio aberto é excluído da projeção e contabilizado no aviso da tela. O valor ponderado é o saldo do projeto ainda não recebido, descontadas as parcelas já pagas, multiplicado pela probabilidade configurada na etapa do funil; quando a etapa não existe na configuração, usa a probabilidade salva no negócio, limitada entre zero e 100. Contratos já ganhos entram separadamente em **Contratos fechados a receber**: parcelas de projeto pendentes ou vencidas com vencimento no mês selecionado, pelo valor integral, independentemente da data do ganho. Parcelas pagas, canceladas, arquivadas, mensalidades e conversões revertidas ficam fora desse saldo. Parcelas sem vencimento válido ficam fora da projeção e geram um aviso. Vencimentos em outros meses entram no respectivo mês. O total projetado soma a receita recebida no mês, os contratos fechados a receber no mês e a previsão ponderada dos negócios abertos. A parcela prevista é uma estimativa, não pagamento confirmado. A API de previsão usa a mesma regra: `closed` é receita recebida, `monthlyReceived` é a parcela de mensalidades e `contracted` informa separadamente o valor dos contratos ganhos; `contractedReceivable` informa as parcelas pendentes do mês, detalhadas em `receivables`.

Em Financeiro → Cobranças, a coluna **Pago em** mostra a data utilizada nos recebimentos. Ao marcar uma cobrança manual como paga, informe a data real. Para corrigir um registro pago, abra a cobrança e use **Corrigir data do pagamento**. Admin e Financeiro podem fazer a alteração; cobrança e lançamentos vinculados são atualizados na mesma transação e o histórico de correções é preservado. O vencimento não é alterado. Datas futuras são rejeitadas. Pagamentos gerenciados pelo Asaas devem ser corrigidos no provedor e sincronizados.

## Relatórios personalizados

Escolha negócios, leads ou tarefas; intervalo e campo de data; responsável; agrupamento por mês, responsável, origem, etapa ou status, conforme o recurso. Negócios também permitem funil, valor de projeto, valor ponderado ou mensalidade negociada. Relatórios podem ser salvos, reabertos, editados, excluídos e exportados em CSV. São compartilhados com os perfis comerciais autorizados. Recalcule a consulta após atualizar dados ou filtros. Não há editor de SQL nem acesso a credenciais.

## Automações

Apenas Admin configura regras. Eventos: `lead.created`, `deal.created`, `deal.stage_changed`, `deal.won`, `deal.lost`. Condições opcionais por origem; negócios também por etapa e valor mínimo. Ações: criar tarefa avulsa, com prazo e responsável opcionais, ou atribuir um responsável comercial ativo. O título pode usar `{nome}`.

Os eventos originados nas telas, API, formulários e importação de prospecção alimentam a fila. As ações ocorrem no worker iniciado com `npm start` ou `npm run dev`; em hospedagem com processos separados, mantenha `npm run webhooks:worker` ativo, ou agende `npm run webhooks:process`. As regras não enviam mensagens ou e-mails automaticamente.

Uma regra executa uma vez por evento, registro e etapa. Reentrada na mesma etapa e reentrega não criam uma segunda tarefa. Eventos já concluídos não são reaplicados ao editar/criar regras. Uma regra pausada não executa. A execução de todas as regras de um evento é transacional: falhas desfazem as ações daquele evento e a fila tenta novamente em ciclos de processamento, até cinco tentativas. O Admin pode reenviar falhas após corrigir a regra ou o responsável. Exclusões de origem são ignoradas; responsáveis inativos impedem a execução. Histórico de sucesso e eventos com falha aparecem na tela.

## API v1

Documentação acessível em **Integrações → API**, ou `/integracoes/api`. Especificação OpenAPI 3.1 em `/api/v1/openapi`, com os schemas de criação e edição. Ela pode ser importada em clientes HTTP compatíveis.

O Admin gera e revoga chaves em **Integrações → n8n → Chaves de API**. O segredo é exibido uma vez e armazenado como hash. Cada operação exige `Authorization: Bearer sk_live_...` e o escopo correspondente; chave antiga mantém suas permissões e pode ser substituída por uma nova com mais escopos.

| Recurso | GET lista e por ID | POST cria | PATCH por ID |
| --- | --- | --- | --- |
| leads | Sim | Sim | Sim, exceto leads convertidos |
| deals | Sim | Sim, em Novo lead | Campos comerciais; sem transições de etapa |
| tasks | Sim | Sim | Tarefas avulsas; sem vínculos com projetos |
| clients | Sim | Sim | Não |
| projects, quotes, charges, subscriptions, pipelines | Sim | Não | Não |

`GET /api/v1/forecast?month=2026-11&ownerId=...&pipelineId=...` consulta a previsão em BRL, com escopo `reports:read`. Não há operações de emissão, pagamento, baixa ou exclusão por esta API. O POST legado de edição de negócios com `id` continua disponível para compatibilidade.

Listas aceitam `limit` (1–100, padrão 50), `offset` (0–1.000.000), e filtros exatos nos campos aplicáveis: `ownerId`, `assigneeId`, `status`, `stage`, `pipelineId`, `source`, `clientId`, `leadId`, `dealId`. Funis aceitam apenas paginação. Retorno: `{data,total,limit,offset,hasMore}`. Detalhe: `{data}`. Os recursos retornam campos explícitos, sem tokens ou dados internos de integrações.

Criações aceitam `Idempotency-Key` de até 120 caracteres (`A–Z`, `a–z`, números, `_`, `.`, `:`, `-`). Reutilize a mesma chave e corpo em tentativas da mesma operação. A primeira resposta é 201; uma repetição retorna 200 e `replayed: true`. Chave reutilizada com corpo ou recurso diferente retorna 409. A proteção é persistida e transacional, inclusive para chamadas concorrentes; registros de idempotência são mantidos no banco. Sem esse cabeçalho, cada POST representa uma criação nova.

Limites: JSON de até 20 KB; 120 chamadas por minuto por chave. Paginação inválida e campos desconhecidos retornam 400; autenticação inválida 401; escopo insuficiente 403; registro ausente 404; conflito 409; corpo excessivo 413; limite de chamadas 429 (`Retry-After: 60`). Falhas internas retornam 500 sem detalhes de banco ou credenciais. Rotas retornam `Cache-Control: no-store`.

Exemplo (substitua domínio e segredo no ambiente da integração):

```sh
curl 'https://SEU-CRM/api/v1/leads' \
  -H 'Authorization: Bearer SUA_CHAVE' \
  -H 'Content-Type: application/json' \
  -H 'Idempotency-Key: formulario-123' \
  -d '{"name":"Contato de exemplo","email":"contato@example.com","source":"site"}'
```

Para acesso externo, hospede o CRM em HTTPS e configure o banco dessa instalação. O driver PostgreSQL é usado tanto localmente quanto em hospedagem para suportar transações interativas; o ambiente deve permitir conexões PostgreSQL TCP, e a URL deve incluir os parâmetros SSL exigidos pelo provedor.

## Validação

`npm test` inclui cálculos, filtros e validações de contrato. `npm run commercial:check` usa um schema temporário no PostgreSQL local e verifica persistência, papéis, API, idempotência concorrente, fila, rollback, retomada, limites e revogação. O schema de teste é removido ao terminar. Essa checagem também está no CI.
