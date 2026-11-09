# Central de IA

Acesse **Central de IA** no menu ou `/central-ia`. Clique em **Gerar análise** para uma avaliação conjunta dos registros pendentes do CRM. A análise não depende de conversas do WhatsApp.

Use o campo **Seu prompt** para orientar o foco ou fazer uma pergunta, por exemplo: “priorize projetos atrasados” ou “quais negócios precisam de atenção?”. O campo é opcional, tem limite de 2.000 caracteres e fica registrado junto à análise como **Prompt utilizado**. Deixe vazio para uma análise geral. A orientação respeita as permissões e os dados disponíveis no recorte.

- Comercial: leads ativos, negócios abertos e propostas enviadas ou visualizadas.
- Financeiro: cobranças pendentes e vencidas, apenas para administrador e financeiro.
- Operação: projetos não entregues, etapas bloqueadas e tarefas não concluídas.

As permissões de leitura são verificadas no servidor. Operação recebe projetos e tarefas; comercial não recebe cobranças. Nomes, situação, prazos e valores permitidos são projetados explicitamente. Telefone, e-mail, mensagens, observações internas, chaves e objetos brutos não são enviados.

Cada área inclui até 20 registros, ordenados pelas datas mais antigas. A tela informa o total elegível e quantos registros foram incluídos. O relatório é um recorte das pendências, não uma auditoria do CRM inteiro ou conciliação bancária. A consulta usa a conexão de **Integrações → WhatsApp e IA**, consome créditos da API e aceita uma solicitação por minuto por usuário.

As recomendações incluem prioridade, observação, próximo passo e referências verificadas aos registros. Links são montados pelo CRM, não pelo modelo. A versão atual orienta a equipe; a execução de tarefas, mudanças de etapa, cobranças ou envios permanece manual.

A última análise fica salva por usuário em `managementAiReports`. Uma mudança de papel invalida sua apresentação. Ao recarregar, registros alterados ou removidos no recorte invalidam o relatório salvo. A data da consulta é exibida; análises com mais de 24 horas são sinalizadas. A configuração de IA e os registros internos da central não são expostos pelas coleções genéricas do CRM.

Validação sem consultas reais ao provedor:

```sh
node --test scripts/test-management-ai.mjs scripts/test-whatsapp-ai-provider.mjs
npm run typecheck
```
