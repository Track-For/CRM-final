import postgres from "postgres"
import { controlSql } from "./control"
import { currentWorkspace } from "./context"

/** Resolve a conexão no momento da execução, inclusive para SQL e transações. */
export function scopedSql() {
  const root = controlSql()
  const pools = new Map<string, Promise<ReturnType<typeof postgres>>>()
  async function resolve() {
    const workspace = await currentWorkspace()
    if (!workspace) return root
    let pending = pools.get(workspace.schemaName)
    if (!pending) {
      pending = (async () => {
        const url = new URL(process.env.DATABASE_URL!)
        url.searchParams.set("search_path", workspace.schemaName)
        const client = postgres(url.toString(), { max: 2, prepare: false, idle_timeout: 20, connection: { search_path: workspace.schemaName } })
        Object.assign(client.options.parsers, root.options.parsers)
        Object.assign(client.options.serializers, root.options.serializers)
        const [check] = await client.unsafe('select current_schema() as schema')
        if (check?.schema !== workspace.schemaName) { await client.end(); throw Error("A conexão não confirmou o espaço isolado da empresa.") }
        return client
      })()
      pools.set(workspace.schemaName, pending)
      pending.catch(() => { pools.delete(workspace.schemaName) })
    }
    return pending
  }
  return new Proxy(root, { get(target, prop) {
    if (prop === "unsafe") return (...args: Parameters<typeof root.unsafe>) => {
      const execute = async (arrays = false) => {
        const client = await resolve()
        const query = client.unsafe(...args)
        return arrays ? query.values() : query
      }
      // postgres-js queries are lazy thenables; values() selects array rows.
      return { then: (yes: (value: unknown) => unknown, no: (error: unknown) => unknown) => execute().then(yes, no),
        catch: (no: (error: unknown) => unknown) => execute().catch(no), values: () => execute(true) }
    }
    if (prop === "begin") return async (job: (sql: unknown) => Promise<unknown>) => (await resolve()).begin(job)
    if (prop === "end") return async () => { await Promise.all([...pools.values()].map(async pending => { const client = await pending.catch(() => null); await client?.end() })); pools.clear(); await root.end() }
    const value = Reflect.get(target, prop, target)
    return typeof value === "function" ? value.bind(target) : value
  } }) as typeof root
}
