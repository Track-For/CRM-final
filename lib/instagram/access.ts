import { requireUser } from "@/lib/auth/session"

export async function requireInstagramUser(manage = false) {
  const user = await requireUser()
  if (!(manage ? ["admin"] : ["admin", "comercial", "operacao"]).includes(user.role)) throw new Error("Sem permissão para acessar o Instagram.")
  return user
}
