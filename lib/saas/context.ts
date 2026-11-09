import { AsyncLocalStorage } from "node:async_hooks"
import { cache } from "react"
import { controlSql } from "./control"
import { slugFromHost } from "./host"
export type Workspace = { id: string; slug: string; schemaName: string; name: string; status: string; onboardedAt: Date | null }
const context = new AsyncLocalStorage<Workspace | null>()
export async function withWorkspace<T>(workspace: Workspace | null, job: () => T | Promise<T>): Promise<T> { return context.run(workspace, async () => await job()) }
const fromRequest = cache(async (): Promise<Workspace | null> => {
  if (!process.env.SAAS_BASE_DOMAIN) return null
  let host: string | null
  try { const { headers } = await import("next/headers"); host = (await headers()).get("host") }
  catch (error) { if (process.env.SAAS_WORKSPACE === "legacy") return null; throw error }
  if (!host) { if (process.env.SAAS_WORKSPACE === "legacy") return null; throw Error("Endereço de empresa ausente.") }
  const slug = slugFromHost(host, process.env.SAAS_BASE_DOMAIN)
  if (!slug) return null
  const [row] = await controlSql()`select id,slug,schema_name as "schemaName",name,status,onboarded_at as "onboardedAt" from saas_workspaces where slug=${slug}`
  if (!row || row.status !== "active") throw Error("Empresa não encontrada ou acesso suspenso.")
  if (!/^tenant_[a-f0-9]{32}$/.test(row.schemaName)) throw Error("Espaço de empresa inválido.")
  return row as Workspace
})
export async function currentWorkspace() {
  const explicit = context.getStore()
  return explicit !== undefined ? explicit : fromRequest()
}
export async function assertLegacyConnection(feature: string) {
  if (await currentWorkspace()) throw Error(`Configure ${feature} para esta empresa. As conexões de outra empresa não são compartilhadas.`)
}
