import { randomBytes } from "node:crypto"
import { readFile, writeFile } from "node:fs/promises"
import { spawnSync } from "node:child_process"
import { parse } from "dotenv"

const file = ".env.local"
const content = await readFile(file, "utf8")
const existing = parse(content)
const defaults = {
  EVOLUTION_URL: "http://127.0.0.1:8083",
  EVOLUTION_API_KEY: randomBytes(32).toString("hex"),
  EVOLUTION_DB_PASSWORD: randomBytes(24).toString("hex"),
  EVOLUTION_INSTANCE: "crm-principal",
  EVOLUTION_PHONE: "",
  EVOLUTION_WEBHOOK_TOKEN: randomBytes(32).toString("hex"),
  EVOLUTION_WEBHOOK_URL: "http://host.docker.internal:3000/api/webhooks/evolution",
}
let updated = content
for (const [key, value] of Object.entries(defaults)) {
  if (!existing[key] && value) updated += `\n${key}=${value}\n`
}
await writeFile(file, updated, { mode: 0o600 })
const result = spawnSync("docker", ["compose", "--env-file", file, "-f", "docker-compose.whatsapp.yml", "up", "-d"], { stdio: "inherit" })
if (result.error) throw result.error
if (result.status) process.exit(result.status)
console.log("Serviço iniciado. Abra /whatsapp no CRM e clique em Gerar QR Code. A conexão só termina após a leitura no celular.")
