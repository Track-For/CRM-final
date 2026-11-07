import { config } from "dotenv"
import postgres from "postgres"
config({ path: ".env.local", quiet: true })
const results = []
const check = (name, ok, detail) => results.push({ name, ok: Boolean(ok), detail })
const present = keys => keys.every(key => Boolean(process.env[key]))
check("Banco configurado", present(["DATABASE_URL", "DATABASE_URL_UNPOOLED"]), "DATABASE_URL e DATABASE_URL_UNPOOLED")
check("Criptografia", Buffer.from(process.env.APP_ENCRYPTION_KEY || "", "base64").length === 32, "Chave de 32 bytes em base64")
check("E-mail de acesso", present(["SMTP_HOST", "EMAIL_FROM"]), "SMTP necessário para usuários sem autenticador")
check("Porta SMTP", Number.isInteger(Number(process.env.SMTP_PORT || 587)) && Number(process.env.SMTP_PORT || 587) > 0 && Number(process.env.SMTP_PORT || 587) <= 65535, "Use a porta informada pelo provedor de e-mail")
const productionUrl = process.env.CRM_PUBLIC_URL || process.argv.find(arg => arg.startsWith("https://"))
check("Endereço publicado", productionUrl?.startsWith("https://"), "Defina CRM_PUBLIC_URL ou passe uma URL HTTPS como argumento")
if (process.env.DATABASE_URL) {
  const sql = postgres(process.env.DATABASE_URL, { max: 1, connect_timeout: 5, onnotice: () => {} })
  try {
    const users = await sql`select column_name from information_schema.columns where table_schema=current_schema() and table_name='users' and column_name in ('active','whatsapp')`
    check("Migração de usuários", users.length === 2, "Colunas active e whatsapp")
    const [admin] = await sql`select count(*)::int as total from users where active=true and role='admin' and id <> 'crm_local_development' and password_hash like 'scrypt$%'`
    check("Administrador definitivo", admin.total > 0, "Crie o administrador em /primeiro-acesso; a identidade de desenvolvimento não habilita login em produção")
    const [forms] = await sql`select count(*)::int as total from crm_records where resource='forms' and deleted=false and data->>'active'='true'`
    check("Formulário público ativo", forms.total > 0, "Necessário para captar leads por /f/slug")
    const [company] = await sql`select data->'company' as company from crm_records where resource='settings' and id='company' and deleted=false`
    const c = company?.company
    check("Cadastro da empresa salvo", c?.name && c?.legalName && c?.cnpj && c?.email, "Confira os dados em Configurações → Empresa; presença dos campos não valida seu conteúdo")
    const [ai] = await sql`select data->>'model' as model, data->>'enabled' as enabled, data->>'apiKeyEncrypted' is not null as has_key from crm_records where resource='aiProviderSettings' and id='openai' and deleted=false`
    check("IA de conversas configurada", ai?.enabled !== "false" && (ai?.model || process.env.OPENAI_MODEL) && (ai?.has_key || process.env.OPENAI_API_KEY), "Só verifica configuração; não consome créditos nem confirma saldo")
    const billing = await sql`select api_key_encrypted is not null as configured, webhook_token_encrypted is not null as webhook from billing_settings limit 1`
    check("Asaas cadastrado", billing[0]?.configured, "Somente verifica configuração; não emite cobranças")
    check("Token webhook Asaas", billing[0]?.webhook, "O cadastro da URL no painel Asaas ainda deve ser conferido")
    const fiscal = await sql`select token_encrypted is not null as configured from fiscal_settings limit 1`
    check("Brasil NFe cadastrado", fiscal[0]?.configured, "Sem emissão fiscal durante a verificação")
    for (const [table, label] of [["google_calendar_settings", "Aplicativo Google Agenda"], ["instagram_settings", "Aplicativo Instagram"]]) {
      const rows = await sql.unsafe(`select id from ${table} limit 1`)
      check(label, rows.length > 0, "Credenciais salvas; autorização do usuário é verificada na própria tela")
    }
  } catch (error) { check("Consulta ao banco", false, error.code || "Conexão ou migração indisponível") }
  finally { await sql.end() }
}
if (present(["EVOLUTION_URL", "EVOLUTION_API_KEY", "EVOLUTION_INSTANCE"])) {
  try {
    const response = await fetch(`${process.env.EVOLUTION_URL.replace(/\/$/, "")}/instance/connectionState/${encodeURIComponent(process.env.EVOLUTION_INSTANCE)}`, { headers: { apikey: process.env.EVOLUTION_API_KEY }, signal: AbortSignal.timeout(8000) })
    const body = response.ok ? await response.json() : null
    check("WhatsApp conectado", body?.instance?.state === "open", response.ok ? `Estado: ${body?.instance?.state || "desconhecido"}` : `HTTP ${response.status}`)
  } catch { check("Evolution acessível", false, "Serviço não respondeu") }
} else check("Evolution configurada", false, "Defina EVOLUTION_URL, EVOLUTION_API_KEY e EVOLUTION_INSTANCE")
let webhookMatches = false
try {
  const webhook = new URL(process.env.EVOLUTION_WEBHOOK_URL)
  webhookMatches = webhook.protocol === "https:" && webhook.pathname === "/api/webhooks/evolution" && (!productionUrl || webhook.origin === new URL(productionUrl).origin)
} catch {}
check("Webhook WhatsApp preparado", webhookMatches && present(["EVOLUTION_WEBHOOK_TOKEN"]), "URL HTTPS /api/webhooks/evolution e token; entrega externa precisa ser homologada após publicar")
try {
  const response = await fetch(`${(process.env.PROSPECTING_URL || "http://127.0.0.1:8091").replace(/\/$/, "")}/api/status`, { headers: process.env.PROSPECTING_TOKEN ? { Authorization: `Bearer ${process.env.PROSPECTING_TOKEN}` } : {}, signal: AbortSignal.timeout(8000) })
  const body = response.ok ? await response.json() : null
  check("Motor de prospecção", body?.motor === true, response.ok ? "Serviço respondeu; depende do motor" : `HTTP ${response.status}`)
} catch { check("Prospecção acessível", false, "Inicie prospecting:start e prospecting:engine") }
if (productionUrl) {
  try {
    const response = await fetch(new URL("/login", productionUrl), { redirect: "manual", signal: AbortSignal.timeout(10000) })
    check("Login publicado", response.status === 200, `HTTP ${response.status}`)
  } catch { check("CRM publicado acessível", false, "URL não respondeu") }
}
for (const result of results) console.log(`${result.ok ? "OK" : "PENDENTE"} | ${result.name} | ${result.detail}`)
if (results.some(result => !result.ok)) process.exitCode = 1
