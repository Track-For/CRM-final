import { randomBytes } from "node:crypto"
import { readFile, writeFile } from "node:fs/promises"
import { spawnSync } from "node:child_process"
import { parse } from "dotenv"

let content = ""
try { content = await readFile(".env.local", "utf8") } catch (error) { if (error.code !== "ENOENT") throw error }
const existing = parse(content)
if (existing.DATABASE_URL || process.env.DATABASE_URL) {
  const url = new URL(process.env.DATABASE_URL || existing.DATABASE_URL)
  if (!["localhost", "127.0.0.1"].includes(url.hostname) || url.port !== "5433" || url.pathname !== "/crm_mentoria") {
    throw new Error("Já existe um banco configurado. A configuração local foi interrompida para preservar essa conexão.")
  }
  if (!existing.LOCAL_POSTGRES_PASSWORD) throw new Error("Falta LOCAL_POSTGRES_PASSWORD em .env.local para iniciar o banco existente.")
}
const password = existing.LOCAL_POSTGRES_PASSWORD || randomBytes(24).toString("hex")
const url = `postgresql://crm:${password}@127.0.0.1:5433/crm_mentoria`
const additions = {
  LOCAL_POSTGRES_PASSWORD: password,
  DATABASE_URL: url,
  DATABASE_URL_UNPOOLED: url,
  APP_ENCRYPTION_KEY: randomBytes(32).toString("base64"),
}
for (const [key, value] of Object.entries(additions)) {
  if (!existing[key]) content += `\n${key}=${value}\n`
}
await writeFile(".env.local", content, { mode: 0o600 })
function run(command, args) {
  const result = spawnSync(command, args, { stdio: "inherit" })
  if (result.error) throw result.error
  if (result.status !== 0) process.exit(result.status || 1)
}
run("docker", ["compose", "--env-file", ".env.local", "-f", "docker-compose.local.yml", "up", "-d", "--wait"])
run("npm", ["run", "db:migrate"])
console.log("Banco local pronto. Abra /login para configurar o primeiro acesso. Nenhuma conta foi criada automaticamente.")
