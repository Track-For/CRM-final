// Processo separado para que a latência da IA não interrompa webhooks e automações.
import nextEnv from "@next/env"
import { build } from "esbuild"
import { mkdir } from "node:fs/promises"
import { pathToFileURL } from "node:url"
import path from "node:path"
nextEnv.loadEnvConfig(process.cwd(), process.env.NODE_ENV !== "production")
const dir = path.resolve("node_modules/.cache/whatsapp-intake-worker")
await mkdir(dir, { recursive: true })
const outfile = path.join(dir, "worker.mjs")
await build({ stdin: { contents: 'export {processWhatsappIntake,seedWhatsappIntake} from "./lib/whatsapp/intake"; export {aiConfigured} from "./lib/ai/provider"; import {db} from "./lib/db"; import {sql} from "drizzle-orm"; export async function heartbeat(){await db.execute(sql`insert into crm_records(resource,id,data,created) values(\'workerHeartbeats\',\'whatsapp-intake\',jsonb_build_object(\'checkedAt\',now()),true) on conflict(resource,id) do update set data=excluded.data,updated_at=now()`)}; export async function status(){const instance=process.env.EVOLUTION_INSTANCE||"crm-principal";const counts=await db.execute(sql`select data->>\'category\' as category,data->>\'state\' as state,count(*)::int as total from crm_records where resource=\'whatsappIntake\' and deleted=false and data->>\'instance\'=${instance} group by category,state`);const errors=await db.execute(sql`select data->>\'reason\' as reason,count(*)::int as total from crm_records where resource=\'whatsappIntake\' and deleted=false and data->>\'instance\'=${instance} and data->>\'state\'=\'review\' and coalesce(data->>\'reason\',\'\')<>\'\' group by reason`);const heartbeat=await db.execute(sql`select data from crm_records where resource=\'workerHeartbeats\' and id=\'whatsapp-intake\'`);return {counts,reviewReasons:errors,heartbeat}}; export async function close(){await db.$client.end()}', resolveDir: process.cwd() }, outfile, bundle: true, platform: "node", format: "esm", packages: "external", logLevel: "silent" })
const worker = await import(pathToFileURL(outfile).href)
let stopped = false
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => { stopped = true })
try {
  if (process.argv.includes("--status")) {
    console.log(JSON.stringify({ aiConfigured: await worker.aiConfigured(), ...await worker.status() }, null, 2))
  } else {
    await worker.seedWhatsappIntake()
    do {
      try { await worker.processWhatsappIntake(); await worker.heartbeat() }
      catch { console.error("[whatsapp] Falha na triagem. Conversas preservadas para revisão."); if (!process.argv.includes("--watch")) process.exitCode = 1 }
      if (!process.argv.includes("--watch") || stopped) break
      await new Promise(resolve => setTimeout(resolve, 5000))
    } while (!stopped)
  }
} finally { await worker.close() }
