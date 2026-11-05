import { getCurrentUser } from "@/lib/auth/session"
import { SettingsPage } from "@/components/settings/settings-page"

export default async function ConfiguracoesPage() {
  const user = await getCurrentUser()
  return <SettingsPage totpEnabled={user?.totpEnabled ?? false} />
}
