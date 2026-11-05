import { AppShell } from "@/components/layout/app-shell"
import { requireUser } from "@/lib/auth/session"

export default async function CrmLayout({ children }: { children: React.ReactNode }) {
  await requireUser()
  return <AppShell>{children}</AppShell>
}
