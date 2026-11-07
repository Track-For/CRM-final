import { config } from "dotenv"
import { spawn } from "node:child_process"

// O Python não carrega .env.local sozinho. Preserve variáveis do servidor.
config({ path: ".env.local", quiet: true })
const child = spawn("python3", ["services/prospecting/painel/server.py", "--sem-navegador"], {
  stdio: "inherit",
  env: { ...process.env, PAINEL_PORT: process.env.PAINEL_PORT || "8091", SCRAPER_PORT: process.env.SCRAPER_PORT || "8082" },
})
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => child.kill(signal))
child.on("error", () => { console.error("Não foi possível iniciar a prospecção. Confira a instalação do Python 3."); process.exitCode = 1 })
child.on("exit", code => { process.exitCode = code ?? 1 })
