import { requireUser } from "@/lib/auth/session"
import { SecuritySettings } from "@/components/settings/security-settings"
import { PageHeader } from "@/components/shared/page-header"

export default async function MinhaContaPage() {
  const user = await requireUser()
  return <>
    <PageHeader title="Minha conta" description={`${user.name} · ${user.email}`} />
    <SecuritySettings totpEnabled={user.totpEnabled} />
  </>
}
