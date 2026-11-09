import postgres from "postgres"
let client: ReturnType<typeof postgres> | undefined
export function controlSql() {
  if (!process.env.DATABASE_URL) throw Error("DATABASE_URL não configurada.")
  return client ||= postgres(process.env.DATABASE_URL, { max: 5, prepare: false })
}
