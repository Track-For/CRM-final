// O servidor e a fila compartilham o ciclo de vida: npm start também executa os reenvios.
import { spawn } from "node:child_process"
import { createRequire } from "node:module"

const require = createRequire(import.meta.url)
const dev = process.argv.includes("--dev")
const args = process.argv.slice(2).filter(arg => arg !== "--dev")
const env = { ...process.env, NODE_ENV: dev ? "development" : "production" }
let stopping = false
const children = []
let timeout
function stop(signal = "SIGTERM") {
  if (stopping) return
  stopping = true
  for (const child of children) child.kill(signal)
  timeout = setTimeout(() => { for (const child of children) if (child.exitCode === null) child.kill("SIGKILL") }, 15000)
  timeout.unref()
}
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => stop(signal))

function start(name, scriptArgs) {
  const child = spawn(process.execPath, scriptArgs, { stdio: "inherit", env })
  children.push(child)
  return new Promise(resolve => {
    child.on("error", () => { console.error(`[crm] Não foi possível iniciar ${name}.`); process.exitCode = 1; stop(); resolve() })
    child.on("exit", (code, signal) => {
      if (!stopping) {
        console.error(`[crm] ${name} encerrou (${signal || code}). Encerrando o conjunto para permitir reinicialização pelo supervisor.`)
        process.exitCode = code || 1
        stop()
      }
      resolve()
    })
  })
}

await Promise.all([
  start("Next.js", [require.resolve("next/dist/bin/next"), dev ? "dev" : "start", ...args]),
  start("Fila de webhooks", ["scripts/process-webhooks.mjs", "--watch"]),
])
clearTimeout(timeout)
