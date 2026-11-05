import Link from "next/link"
import { Lock } from "lucide-react"
import { Button } from "@/components/ui/button"
import { EmptyState } from "@/components/shared/empty-state"
import { AsaasConfig } from "@/components/integrations/asaas-config"
import { getCurrentUser } from "@/lib/auth/session"
import { getBillingSettings, type BillingSettingsView } from "@/lib/boleto/actions"

const BILLING_ROLES = new Set(["admin", "financeiro"])

/** Configuração real do Asaas (rota estática, tem prioridade sobre integracoes/[key]). */
export default async function AsaasPage() {
  const user = await getCurrentUser()
  if (!user || !BILLING_ROLES.has(user.role)) {
    return (
      <EmptyState
        icon={Lock}
        title="Acesso restrito"
        description="Só administradores e o financeiro configuram a emissão de boletos."
        className="mt-10"
        action={
          <Button asChild size="sm" variant="outline">
            <Link href="/integracoes">Voltar para integrações</Link>
          </Button>
        }
      />
    )
  }

  let settings: BillingSettingsView | null = null
  try {
    settings = await getBillingSettings()
  } catch (err) {
    console.error("[asaas] falha ao carregar configurações:", err instanceof Error ? err.message : err)
  }

  if (!settings) {
    return <EmptyState title="Não foi possível carregar a configuração" description="Falha ao ler o banco de dados. Tente recarregar a página." className="mt-10" />
  }
  return <AsaasConfig settings={settings} />
}
