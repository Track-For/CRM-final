# Serviço de prospecção do CRM

Adaptado de `software-motor-de-buscas` (Google Maps Scraper Kit), sob licença MIT, preservada em LICENSE. O motor é `gosom/google-maps-scraper:v1.18.1`. O código original do painel, persistência, geolocalização, fila, extração e enriquecimento de contatos foi copiado para funcionar sem acesso à pasta de origem. A interface usada é a seção `/buscas` do CRM; os arquivos estáticos da interface antiga não são necessários nem foram copiados.

Da raiz do CRM, execute `npm run prospecting:engine` e `npm run prospecting:start`. Dados de buscas ficam em `painel/dados/`; resultados do motor ficam em volumes Docker. Use `npm run prospecting:test` para as 21 regressões do serviço com dados temporários e motor simulado.

Portas exclusivas do CRM: 8082 (motor), 8091 (Python). Para produção, mantenha ambos numa máquina persistente, use rede privada/túnel e configure `PROSPECTING_URL` no Next.js. O Python mantém a restrição de loopback do original e acrescenta autenticação Bearer opcional com `PROSPECTING_TOKEN`, que deve ser igual nos dois serviços.
