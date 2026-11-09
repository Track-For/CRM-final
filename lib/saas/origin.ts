import { currentWorkspace } from "./context"
export async function workspaceOrigin() {
  const workspace = await currentWorkspace()
  if (!workspace) return null
  const domain = process.env.SAAS_BASE_DOMAIN
  if (!domain) throw Error('Domínio da plataforma não configurado.')
  return `${domain==='localhost'?'http':'https'}://${workspace.slug}.${domain}${domain==='localhost'?':'+(process.env.PORT||'3000'):''}`
}
