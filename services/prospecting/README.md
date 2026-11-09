# Serviço de prospecção do CRM

Adaptado de `software-motor-de-buscas` (Google Maps Scraper Kit), sob licença MIT, preservada em LICENSE. O motor é `gosom/google-maps-scraper:v1.18.1`. O código original do painel, persistência, geolocalização, fila, extração e enriquecimento de contatos foi copiado para funcionar sem acesso à pasta de origem. A interface usada é a seção `/buscas` do CRM; os arquivos estáticos da interface antiga não são necessários nem foram copiados.

Da raiz do CRM, execute `npm run prospecting:engine` e `npm run prospecting:start`. Dados de buscas ficam em `painel/dados/`; resultados do motor ficam em volumes Docker. Use `npm run prospecting:test` para as regressões do serviço com dados temporários e motor simulado.

Portas exclusivas do CRM: 8082 (motor), 8091 (Python). Para produção, mantenha ambos numa máquina persistente, use rede privada/túnel e configure `PROSPECTING_URL` no Next.js. O Python mantém a restrição de loopback do original e acrescenta autenticação Bearer opcional com `PROSPECTING_TOKEN`, que deve ser igual nos dois serviços.

## Receita Federal / CNAE

Em `/buscas`, selecione **Receita Federal · CNAE**. A consulta usa uma base SQLite própria (`painel/dados/receita.sqlite3`), separada dos leads e do motor Maps. Pesquisas não criam leads; a equipe escolhe quais importar. A origem `receita_federal`, CNPJ, CNAE e competência permanecem no cadastro importado. A importação reaproveita a deduplicação por telefone/e-mail e usa um ID estável por CNPJ, incluindo o formato alfanumérico.

A fonte oficial passou a ser o [Repositório de Arquivos da Receita Federal](https://arquivos.receitafederal.gov.br/), em Dados → Cadastros → CNPJ. O script descobre o identificador de compartilhamento público, lista competências e baixa os ZIPs por WebDAV público. Não exige chave de API comercial. O [leiaute oficial](https://www.gov.br/receitafederal/dados/cnpj-metadados.pdf/@@download/file) define as colunas. O banco inclui estabelecimentos ativos, CNAE principal e secundários, razão social, nome fantasia, município, endereço e contatos cadastrais; não carrega sócios.

Confira o tamanho antes da carga. Os arquivos nacionais não são separados por UF: mesmo um recorte regional exige ler as partes que abrangem o Brasil. O filtro regional reduz o banco final, não o volume de download necessário à cobertura completa.

```sh
# Apenas lista arquivos/tamanho da última competência, sem baixar:
npm run prospecting:receita:download -- --output services/prospecting/painel/dados/receita-fontes/2026-10 --month 2026-10 --check

# Baixa os 22 ZIPs necessários. Arquivos válidos são reutilizados e downloads parciais podem ser retomados:
npm run prospecting:receita:download -- --output services/prospecting/painel/dados/receita-fontes/2026-10 --month 2026-10

# Gera o recorte de estabelecimentos ativos da BA, mantendo os dados fora do Git:
npm run prospecting:receita:import -- --source services/prospecting/painel/dados/receita-fontes/2026-10 --uf BA --month 2026-10
# Opcional: --cidade Salvador
```

Por padrão, a importação exige Empresas0..9.zip, Estabelecimentos0..9.zip, Cnaes.zip e Municipios.zip da mesma competência. Não misture competências. Um arquivo `fonte.json` gerado no download documenta a origem e a competência. CSVs são lidos diretamente dos ZIPs em Latin-1, separados por ponto e vírgula; não precisam ser extraídos no disco. As tabelas são indexadas por CNAE/UF/município e os resultados têm 50 registros por página.

Para um piloto, o downloader aceita `--parts 1` (Empresas1 e Estabelecimentos1) e o importador aceita `--allow-partial`. Também é possível fornecer partes diferentes baixadas do mesmo mês. **Essa carga é explicitamente parcial**, pode não ter razão social para todos os estabelecimentos e não representa todas as empresas da região. A tela informa essa limitação; um nome ausente usa o CNPJ como identificação. Após carregar todos os arquivos, execute a importação novamente sem `--allow-partial`.

A publicação do banco é atômica: erros na carga mantêm o banco anterior. Cada importação substitui o recorte anterior (uma UF/cidade por banco nesta versão), sem apagar leads já importados. Mantenha o serviço Python em armazenamento persistente e configure `PAINEL_DATA_DIR` de forma igual no importador e no serviço, caso use diretório personalizado. Se o serviço já estava rodando antes desta implementação, reinicie `npm run prospecting:start` para disponibilizar as novas rotas; atualizações posteriores do arquivo SQLite não exigem reinício.

Telefone da Receita não comprova WhatsApp ativo. A origem não informa site: não há filtro “sem site” para resultados da Receita. Contatos e situação cadastral refletem o mês de referência, sem confirmação em tempo real. O telefone cadastrado é colocado no campo de contato do lead, sujeito à conferência antes do atendimento.

`npm run prospecting:test` cobre o importador e as rotas com arquivos fictícios e banco temporário. `node --test scripts/test-receita-import.mjs` cobre permissões, proveniência e deduplicação na importação para o CRM, sem gravar leads reais.

Verificação da base real sem criar leads: `npm run prospecting:receita:check`. O script consulta metadados, CNAE odontológico, paginação e leitura de uma empresa, e confirma que a quantidade de leads da prospecção permanece igual.
