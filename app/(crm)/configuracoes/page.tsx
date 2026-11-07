import { requireUser } from "@/lib/auth/session"
import { SettingsPage } from "@/components/settings/settings-page"
import { EmptyState } from "@/components/shared/empty-state"

export default async function ConfiguracoesPage() {
  const user = await requireUser()
  if (user.role !== "admin") return <EmptyState title="Acesso restrito" description="Somente administradores gerenciam as configurações do CRM. Sua senha e seu autenticador estão em Minha conta." />
  return <SettingsPage totpEnabled={user.totpEnabled} />
}
