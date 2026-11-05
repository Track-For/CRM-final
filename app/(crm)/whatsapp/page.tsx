import { redirect } from "next/navigation"
import { requireUser } from "@/lib/auth/session"
import { WhatsappInbox } from "@/components/whatsapp/inbox"

export default async function WhatsappPage() {
  const user = await requireUser()
  if (!["admin", "comercial", "operacao"].includes(user.role)) redirect("/dashboard")
  return <WhatsappInbox canManage={user.role === "admin"} />
}
