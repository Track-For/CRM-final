import { randomUUID } from "node:crypto"
import { readFile } from "node:fs/promises"
import path from "node:path"
import { z } from "zod"
import { controlSql } from "./control"
import { schemaForWorkspace, workspaceSlug } from "./host"
import { hashPassword } from "@/lib/auth/password"
export const registrationSchema = z.object({
  company: z.string().trim().min(2).max(120), name: z.string().trim().min(2).max(120),
  slug: z.string().transform(workspaceSlug), email: z.email().trim().toLowerCase(),
  password: z.string().min(10, "Use pelo menos 10 caracteres na senha.").max(200),
})
export async function provisionWorkspace(input: unknown) {
  const value = registrationSchema.parse(input)
  const id = randomUUID().replaceAll("-", "")
  const schemaName = schemaForWorkspace(id)
  const passwordHash = await hashPassword(value.password)
  const journal = JSON.parse(await readFile(path.join(process.cwd(), "drizzle/meta/_journal.json"), "utf8")) as { entries: { tag: string }[] }
  // Migrações do plano de controle não pertencem aos espaços dos clientes.
  const migrations = await Promise.all(journal.entries.filter(e => !e.tag.includes("_saas_")).map(async entry => readFile(path.join(process.cwd(), "drizzle", `${entry.tag}.sql`), "utf8")))
  await controlSql().begin(async tx => {
    await tx`select pg_advisory_xact_lock(hashtext(${`saas-registration:${value.slug}`}))`
    if ((await tx`select id from saas_workspaces where slug=${value.slug}`).length) throw Error("Este endereço já está em uso. Escolha outro.")
    await tx`insert into saas_workspaces(id,slug,schema_name,name) values(${id},${value.slug},${schemaName},${value.company})`
    await tx.unsafe(`create schema "${schemaName}"`)
    await tx`select set_config('search_path',${schemaName},true)`
    for (const migration of migrations) for (const statement of migration.replaceAll('"public".', `"${schemaName}".`).split('--> statement-breakpoint')) {
      if (statement.trim()) await tx.unsafe(statement)
    }
    const userId = randomUUID()
    await tx`insert into users(id,name,email,password_hash,role) values(${userId},${value.name},${value.email},${passwordHash},'admin')`
    const company = { name: value.company, legalName: "", cnpj: "", municipalRegistration: "", email: value.email, whatsapp: "", website: "", address: { zip: "", street: "", number: "", district: "", city: "", state: "" } }
    await tx`insert into crm_records(resource,id,data,created,updated_by) values('settings','company',${tx.json({company})},true,${userId})`
  })
  return { id, slug: value.slug, schemaName, name: value.company, status: "active", onboardedAt: null }
}
