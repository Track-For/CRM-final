import { spawnSync } from "node:child_process"
import { setTimeout } from "node:timers/promises"
import nextEnv from "@next/env"

// Use a mesma precedência de .env do Next, incluindo variáveis do terminal.
nextEnv.loadEnvConfig(process.cwd(), true)

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { stdio: "inherit", ...options })
  if (result.error || result.status !== 0) {
    throw new Error(`Falha ao executar ${command}. ${result.error?.message || "Confira a mensagem acima."}`)
  }
}

async function prepare() {
  const connection = process.env.DATABASE_URL
  if (!connection) {
    throw new Error("Banco não configurado. Execute npm run db:local antes do primeiro uso.")
  }
  const url = new URL(connection)
  // Gerencie apenas o banco Docker deste projeto; outras conexões são preservadas.
  if (!["localhost", "127.0.0.1"].includes(url.hostname) || url.port !== "5433" || url.pathname !== "/crm_mentoria") return
  if (!process.env.LOCAL_POSTGRES_PASSWORD) {
    throw new Error("Falta LOCAL_POSTGRES_PASSWORD. Execute npm run db:local para configurar o banco local.")
  }

  const dockerReady = () => spawnSync("docker", ["info"], { stdio: "ignore", timeout: 5000 }).status === 0
  if (!dockerReady()) {
    console.log("Iniciando Docker Desktop e aguardando o banco local...")
    if (process.platform === "darwin") run("open", ["-a", "Docker"])
    else throw new Error("Inicie o Docker e execute npm run dev novamente.")
    const deadline = Date.now() + 120_000
    while (!dockerReady()) {
      if (Date.now() >= deadline) throw new Error("Docker não ficou pronto em 120 segundos. Verifique o Docker Desktop e tente novamente.")
      await setTimeout(2000)
    }
  }

  run("docker", ["compose", "-f", "docker-compose.local.yml", "up", "-d", "--wait", "--wait-timeout", "90", "postgres"])
  run("npm", ["run", "db:migrate"])
  console.log("Banco local pronto. Iniciando Next.js...")
}

prepare().catch((error) => {
  console.error(`Não foi possível preparar o ambiente: ${error.message}`)
  process.exitCode = 1
})
