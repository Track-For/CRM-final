# Triagem do WhatsApp no Nexo CRM

Todas as conversas continuam na caixa de entrada. O recebimento de mensagens não cria um negócio.

- Telefones que correspondem a um único cliente ou lead usam o cadastro existente.
- Novos contatos são classificados em Interesse comercial, Cliente atual, Fornecedor, Suporte, Spam / sem interesse ou A classificar.
- A criação automática de um lead exige intenção de compra, confiança de pelo menos 90% e evidências em mensagens recebidas. Saudação, oferta de fornecedor e mensagens da própria equipe não bastam.
- O lead recebe origem WhatsApp, resumo e próximo passo sugerido. O resumo também fica nas notas. A criação alimenta as automações comerciais e os webhooks já configurados.
- Mensagens antigas (mais de sete dias), contatos ambíguos, falhas de IA e conteúdo insuficiente ficam para revisão. Áudios e anexos não são interpretados até existir uma leitura/transcrição disponível.
- A equipe pode revisar a categoria na conversa. Confirmar interesse comercial cadastra ou reaproveita o lead. A revisão humana prevalece nas mensagens seguintes; “Analisar com IA” libera uma nova análise.
- Leads excluídos pela própria triagem não são recriados automaticamente. Cadastros anteriores não são removidos nem convertidos em novas oportunidades.

## Execução

O provedor é o mesmo de Integrações → WhatsApp e IA. A triagem roda em processo separado, iniciado por `npm run dev` e `npm start`, para não atrasar mensagens, webhooks ou outras automações.

```sh
npm run whatsapp:check-intake          # testes em schema isolado, IA simulada
npm run whatsapp:triage               # uma passagem pela fila
npm run whatsapp:triage -- --watch    # execução contínua
npm run whatsapp:triage -- --status   # verifica configuração sem mostrar credenciais
```

Mensagens são persistidas antes de entrar na fila. A sincronização de histórico não duplica a análise da mesma mensagem. Cada conversa tem reserva com expiração; mensagens novas invalidam resultados antigos. Há limite global de 60 análises por hora e intervalo de um minuto por contato. Se o limite for atingido, a equipe pode revisar manualmente ou solicitar nova análise depois.

A implementação usa saída estruturada e valida evidências antes de criar registros, conforme a [documentação oficial da OpenAI](https://developers.openai.com/api/docs/guides/structured-outputs). Não envia respostas pelo WhatsApp automaticamente.
