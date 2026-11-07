import { openSync, closeSync, readdirSync } from "node:fs"
import { spawnSync } from "node:child_process"
import { randomBytes } from "node:crypto"
import path from "node:path"

// Restaura somente em um banco temporário com nome gerado aqui.
const file = readdirSync("backups").filter(name => /^crm-.*\.dump$/.test(name)).sort().at(-1)
if (!file) throw new Error("Execute npm run db:backup -- --docker-local primeiro.")
const name = `crm_restore_check_${randomBytes(6).toString("hex")}`
const compose = ["compose", "--env-file", ".env.local", "-f", "docker-compose.local.yml", "exec", "-T", "postgres"]
function run(args, input = "ignore") {
  const result = spawnSync("docker", [...compose, ...args], { stdio: [input, "pipe", "pipe"], encoding: "utf8" })
  if (result.error || result.status !== 0) throw new Error("A verificação de restauração falhou. Confira o Docker e a compatibilidade do backup.")
  return result.stdout
}
let created = false
try {
  run(["createdb", "-U", "crm", name]); created = true
  const fd = openSync(path.join("backups", file), "r")
  try { run(["pg_restore", "-U", "crm", "-d", name, "--no-owner", "--no-acl", "--exit-on-error"], fd) }
  finally { closeSync(fd) }
  run(["psql", "-U", "crm", "-d", name, "-v", "ON_ERROR_STOP=1", "-c", "SELECT count(*) FROM users; SELECT count(*) FROM crm_records;"])
  console.log("Backup restaurado e tabelas consultadas com sucesso em banco temporário.")
} finally {
  if (created) {
    run(["dropdb", "-U", "crm", name])
    console.log("Banco temporário removido. O banco do CRM foi preservado.")
  }
}
