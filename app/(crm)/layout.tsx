import { workspaceBrand } from "@/lib/saas/brand"
import { AppShell } from "@/components/layout/app-shell"
import { currentWorkspace } from "@/lib/saas/context"
import { redirect } from "next/navigation"
import { requireUser } from "@/lib/auth/session"

export async function generateMetadata() { const brand = await workspaceBrand(); return brand ? { title: { default: brand.brandName, template: `%s · ${brand.brandName}` } } : {} }

export default async function CrmLayout({ children }: { children: React.ReactNode }) {
  await requireUser()
  const workspace = await currentWorkspace()
  if (workspace && !workspace.onboardedAt) redirect("/configuracao-inicial")
  return <AppShell>{children}</AppShell>
}
