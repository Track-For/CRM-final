// Somente servidor: nunca importe este módulo em Client Components.
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import postgres from "postgres";
import { drizzle as drizzlePostgres } from "drizzle-orm/postgres-js";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import * as schema from "./schema";

export * from "./schema";

type Database = PgDatabase<PgQueryResultHKT, typeof schema>;

let instance: Database | undefined;

function getDb(): Database {
  if (instance) return instance;
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      "DATABASE_URL não está definida. Rode `npm run db:local` para desenvolvimento local ou configure a conexão do banco em .env.local.",
    );
  }
  const hostname = new URL(url).hostname;
  instance = ["localhost", "127.0.0.1", "::1", "[::1]"].includes(hostname)
    ? drizzlePostgres(postgres(url, { max: 5, prepare: false }), { schema })
    : drizzle(neon(url), { schema });
  return instance;
}

/**
 * Conexão preguiçosa: só é criada no primeiro uso, para não quebrar o build
 * quando DATABASE_URL não existe em tempo de build.
 */
export const db: Database = new Proxy({} as Database, {
  get(_target, prop) {
    const real = getDb();
    const value = Reflect.get(real, prop, real);
    return typeof value === "function" && prop !== "$client" ? value.bind(real) : value;
  },
});
