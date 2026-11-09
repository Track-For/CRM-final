"use server"
import { createHash } from "node:crypto"
import { controlSql } from "./control"
import { headers } from "next/headers"
import { currentWorkspace } from "./context"
import { provisionWorkspace } from "./provision"
export type RegistrationState = { error?: string; loginUrl?: string }
export async function registerWorkspace(_previous: RegistrationState, fields: FormData): Promise<RegistrationState> {
  if (!process.env.SAAS_BASE_DOMAIN || process.env.SAAS_REGISTRATION_ENABLED !== "true") return {error:"O cadastro de empresas ainda não está disponível. Entre em contato com a equipe."}
  if (await currentWorkspace()) return {error:"Crie novas empresas pelo endereço principal da plataforma."}
  const h = await headers()
  const host = h.get("host") || ""
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "unknown"
  const bucket = createHash("sha256").update(`${ip}:${Math.floor(Date.now()/3600000)}`).digest("hex")
  const allowed = await controlSql()`insert into saas_registration_limits(id,count,expires_at) values(${bucket},1,now()+interval '1 hour') on conflict(id) do update set count=saas_registration_limits.count+1 where saas_registration_limits.count<5 returning id`
  if (!allowed.length) return {error:"Muitas tentativas de cadastro. Aguarde antes de tentar novamente."}
  const domain = process.env.SAAS_BASE_DOMAIN
  const local = domain === "localhost"
  try {
    const workspace = await provisionWorkspace(Object.fromEntries(fields))
    const port = local ? host.match(/:\d+$/)?.[0] || "" : ""
    return { loginUrl: `${local ? "http" : "https"}://${workspace.slug}.${domain}${port}/login?conta=criada` }
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("Este endereço")) return {error:error.message}
    const {z} = await import("zod")
    return {error:error instanceof z.ZodError ? error.issues[0]?.message : "Não foi possível criar a empresa. Nenhuma configuração parcial foi mantida."}
  }
}
