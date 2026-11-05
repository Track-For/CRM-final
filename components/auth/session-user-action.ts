"use server"

import { getCurrentUser } from "@/lib/auth/session"

/** Nome e e-mail do usuário logado, para exibição no menu do avatar. */
export async function getSessionUserAction(): Promise<{ name: string; email: string } | null> {
  const user = await getCurrentUser()
  return user ? { name: user.name, email: user.email } : null
}
