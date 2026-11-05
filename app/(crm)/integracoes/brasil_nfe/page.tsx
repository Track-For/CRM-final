import Link from "next/link"
import { Lock } from "lucide-react"
import { Button } from "@/components/ui/button"
import { EmptyState } from "@/components/shared/empty-state"
import { BrasilNfeConfig } from "@/components/integrations/brasil-nfe-config"
import { getCurrentUser } from "@/lib/auth/session"
import { getFiscalSettings, type FiscalSettingsView } from "@/lib/fiscal/actions"

const FISCAL_ROLES = new Set(["admin", "financeiro"])

/** Configuração real do Brasil NFe (rota estática, tem prioridade sobre integracoes/[key]). */
export default async function BrasilNfePage() {
  const user = await getCurrentUser()
  if (!user || !FISCAL_ROLES.has(user.role)) {
    return (
      <EmptyState
        icon={Lock}
        title="Acesso restrito"
        description="Só administradores e o financeiro configuram a emissão de notas fiscais."
        className="mt-10"
        action={
          <Button asChild size="sm" variant="outline">
            <Link href="/integracoes">Voltar para integrações</Link>
          </Button>
        }
      />
    )
  }

  let settings: FiscalSettingsView | null = null
  try {
    settings = await getFiscalSettings()
  } catch (err) {
    console.error("[brasil_nfe] falha ao carregar configurações:", err instanceof Error ? err.message : err)
  }

  if (!settings) {
    return <EmptyState title="Não foi possível carregar a configuração" description="Falha ao ler o banco de dados. Tente recarregar a página." className="mt-10" />
  }
  return <BrasilNfeConfig settings={settings} />
}
