import { requireUser } from "@/lib/auth/session"
import { redirect } from "next/navigation"
import { ProspectingView } from "@/components/prospecting/prospecting-view"

export default async function SearchesPage() {
  const user = await requireUser()
  if (!["admin", "comercial"].includes(user.role)) redirect("/dashboard")
  return <ProspectingView />
}
