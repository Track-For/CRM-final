"use server"

import { revalidatePath } from "next/cache"
import { getCurrentUser } from "@/lib/auth/session"
import { listFiscalJobs, processFiscalJob } from "./automatic"

async function requirePermission() {
  const user = await getCurrentUser()
  if (!user || !["admin", "financeiro"].includes(user.role)) throw Error("Sem permissão para gerenciar a emissão fiscal.")
}

export async function getAutomaticFiscalJobs() {
  await requirePermission()
  return listFiscalJobs()
}

export async function retryAutomaticFiscalJob(id: string) {
  await requirePermission()
  if (typeof id !== "string" || !/^[a-f0-9]{64}$/.test(id)) throw Error("Identificador de emissão inválido.")
  await processFiscalJob(id)
  revalidatePath("/notas-fiscais")
}
