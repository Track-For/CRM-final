// Run once from a scheduler, or keep --watch running as a separate production worker.
import nextEnv from "@next/env"
import { build } from "esbuild"
import { mkdir } from "node:fs/promises"
import { pathToFileURL } from "node:url"
import path from "node:path"

nextEnv.loadEnvConfig(process.cwd(), process.env.NODE_ENV !== "production")
const dir = path.resolve("node_modules/.cache/crm-webhook-worker")
await mkdir(dir, { recursive: true })
const outfile = path.join(dir, "worker.mjs")
await build({ stdin: { contents: 'export {processPendingWebhooks} from "./lib/integrations/webhook-queue"; export {processAutomationEvents} from "./lib/commercial/automations"; import {db} from "./lib/db"; export async function close(){await db.$client.end?.()}', resolveDir: process.cwd() }, outfile, bundle: true, platform: "node", format: "esm", packages: "external", logLevel: "silent" })
const worker = await import(pathToFileURL(outfile).href)
let stopped = false
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => { stopped = true })
try {
  do {
    try { await worker.processPendingWebhooks() }
    catch { console.error("[webhooks] Falha ao processar fila. Pendências preservadas no banco."); if (!process.argv.includes("--watch")) process.exitCode = 1 }
    try { await worker.processAutomationEvents() }
    catch { console.error("[automacoes] Falha ao processar fila. Pendências preservadas no banco."); if (!process.argv.includes("--watch")) process.exitCode = 1 }
    if (!process.argv.includes("--watch") || stopped) break
    await new Promise(resolve => setTimeout(resolve, 5000))
  } while (!stopped)
} finally { await worker.close() }
