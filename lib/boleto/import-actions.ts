"use server"

import { getCurrentUser } from "@/lib/auth/session"
import { syncAsaasReceivables } from "./import"

export async function refreshAsaasChargesAction() {
  const user = await getCurrentUser()
  if (!user || (user.role !== "admin" && user.role !== "financeiro")) return { ok: false as const, error: "Sem permissão para sincronizar cobranças." }
  try { return { ok: true as const, ...await syncAsaasReceivables(true) } }
  catch (error) { return { ok: false as const, error: error instanceof Error ? error.message : "Não foi possível consultar o Asaas." } }
}
