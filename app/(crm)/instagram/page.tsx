import { redirect } from "next/navigation"
import { requireUser } from "@/lib/auth/session"
import { getInstagramOverview } from "@/lib/instagram/actions"
import { InstagramView } from "@/components/instagram/instagram-view"

export default async function InstagramPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await requireUser()
  if (!["admin", "comercial", "operacao"].includes(user.role)) redirect("/dashboard")
  const [initial, params] = await Promise.all([getInstagramOverview(), searchParams])
  return <InstagramView initial={initial} notice={typeof params.notice === "string" ? params.notice : undefined} />
}
