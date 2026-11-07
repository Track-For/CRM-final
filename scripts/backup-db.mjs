import { config } from "dotenv"
import { closeSync, openSync, mkdirSync, statSync, renameSync, unlinkSync } from "node:fs"
import { spawnSync } from "node:child_process"
import path from "node:path"

config({ path: ".env.local", quiet: true })
const docker = process.argv.includes("--docker-local")
const database = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL
if (!database) throw new Error("Configure DATABASE_URL_UNPOOLED antes de criar o backup.")
if (docker) {
  const url = new URL(database)
  if (!["localhost", "127.0.0.1"].includes(url.hostname) || url.port !== "5433" || url.pathname !== "/crm_mentoria") {
    throw new Error("--docker-local só pode copiar o banco local crm_mentoria na porta 5433.")
  }
}
const dir = path.resolve("backups")
mkdirSync(dir, { recursive: true, mode: 0o700 })
const target = path.join(dir, `crm-${new Date().toISOString().replace(/[:.]/g, "-")}.dump`)
const partial = `${target}.partial`
const env = { ...process.env, PGDATABASE: database }
const compose = ["compose", "--env-file", ".env.local", "-f", "docker-compose.local.yml", "exec", "-T", "postgres"]
let fd
try {
  fd = openSync(partial, "wx", 0o600)
  const args = ["--format=custom", "--no-owner", "--no-acl"]
  const result = docker
    ? spawnSync("docker", [...compose, "pg_dump", "-U", "crm", "-d", "crm_mentoria", ...args], { stdio: ["ignore", fd, "pipe"] })
    : spawnSync("pg_dump", args, { env, stdio: ["ignore", fd, "pipe"] })
  closeSync(fd); fd = undefined
  if (result.error || result.status !== 0) throw new Error("Backup falhou. Confira o banco, Docker ou instalação do pg_dump compatível com o servidor.")
  fd = openSync(partial, "r")
  const verify = docker
    ? spawnSync("docker", [...compose, "pg_restore", "--list"], { stdio: [fd, "ignore", "pipe"] })
    : spawnSync("pg_restore", ["--list"], { stdio: [fd, "ignore", "pipe"] })
  closeSync(fd); fd = undefined
  if (verify.error || verify.status !== 0 || statSync(partial).size === 0) throw new Error("Não foi possível validar o arquivo de backup.")
  renameSync(partial, target)
  console.log(`Backup criado e catálogo validado: ${target}`)
  console.log("Guarde também APP_ENCRYPTION_KEY em seu cofre de segredos. O backup não inclui .env.local nem volumes da prospecção/WhatsApp.")
} catch (error) {
  if (fd !== undefined) closeSync(fd)
  try { unlinkSync(partial) } catch {}
  console.error(error.message)
  process.exitCode = 1
}
