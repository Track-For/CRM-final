import type { Role } from "../../types/index"

const all: Role[] = ["admin", "comercial", "operacao", "financeiro"]
const sales: Role[] = ["admin", "comercial", "financeiro"]
const finance: Role[] = ["admin", "financeiro"]
export const resourcePolicy: Record<string, { read: Role[]; write: Role[] }> = {
  leads: { read: sales, write: ["admin", "comercial"] },
  deals: { read: sales, write: sales },
  quotes: { read: sales, write: sales },
  clients: { read: all, write: all },
  projects: { read: all, write: ["admin", "operacao", "comercial"] },
  contracts: { read: all, write: sales },
  charges: { read: finance, write: finance },
  subscriptions: { read: finance, write: finance },
  entries: { read: finance, write: finance },
  events: { read: all, write: all },
  tasks: { read: all, write: all },
  forms: { read: ["admin", "comercial", "operacao"], write: ["admin", "comercial", "operacao"] },
  notes: { read: all, write: all },
  activities: { read: all, write: all },
  messages: { read: ["admin", "comercial", "operacao"], write: ["admin", "comercial", "operacao"] },
  settings: { read: all, write: ["admin"] },
  integrations: { read: ["admin"], write: ["admin"] },
  webhooks: { read: ["admin"], write: ["admin"] },
  apiKeys: { read: ["admin"], write: ["admin"] },
  integrationLogs: { read: ["admin"], write: ["admin"] },
  salesGoals: { read: sales, write: ["admin", "comercial"] },
  savedReports: { read: sales, write: sales },
  automationRules: { read: ["admin"], write: ["admin"] },
  automationRuns: { read: ["admin"], write: [] },
  automationEvents: { read: ["admin"], write: [] },
  notifications: { read: all, write: all },
}
for (const key of ["catalog", "addons", "hostingPlans", "pipelines", "lostReasons", "quickMessages", "financialCategories"]) {
  resourcePolicy[key] = { read: all, write: ["admin"] }
}
resourcePolicy.quickMessages = { read: all, write: ["admin", "comercial"] }
export function canUseResource(role: Role, resource: string, operation: "read" | "write") {
  return Boolean(resourcePolicy[resource]?.[operation].includes(role))
}
export function assertResourceAccess(role: Role, resource: string, operation: "read" | "write") {
  if (!canUseResource(role, resource, operation)) throw new Error("Sem permissão para acessar este recurso.")
}
