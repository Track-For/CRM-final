import { requireUser } from "@/lib/auth/session"
import { redirect } from "next/navigation"
import { ClientSearchView } from "@/components/prospecting/client-search-view"

export default async function SearchesPage() {
  const user = await requireUser()
  if (!["admin", "comercial"].includes(user.role)) redirect("/dashboard")
  return <ClientSearchView />
}
