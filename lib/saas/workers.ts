import { controlSql } from "./control"
import { withWorkspace, type Workspace } from "./context"
/** Filas são executadas no espaço de cada empresa; uma falha não interrompe as demais. */
export async function forEachWorkspace(job: () => Promise<unknown>) {
  const workspaces: (Workspace | null)[] = [null]
  if (process.env.SAAS_BASE_DOMAIN) workspaces.push(...await controlSql()`select id,slug,schema_name as "schemaName",name,status,onboarded_at as "onboardedAt" from saas_workspaces where status='active' and onboarded_at is not null` as Workspace[])
  let failures = 0
  for (const workspace of workspaces) {
    try { await withWorkspace(workspace, job) }
    catch { failures++; console.error(`[saas] Não foi possível processar a fila de ${workspace?.slug || 'operação original'}. Pendências preservadas.`) }
  }
  if (failures) throw Error('Uma ou mais filas aguardam nova tentativa.')
}
