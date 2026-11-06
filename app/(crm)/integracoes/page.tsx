import { getGoogleCalendarState } from "@/lib/google-calendar/actions"
import { getWhatsappConnection } from "@/lib/whatsapp/actions"
import { IntegrationsOverview } from "@/components/integrations/integrations-overview"
import { getCurrentUser } from "@/lib/auth/session"
import { billingSettings, db } from "@/lib/db"
import { getFiscalSettings } from "@/lib/fiscal/actions"

const FISCAL_ROLES = new Set(["admin", "financeiro"])

/** Só diz se há chave salva, sem decifrar nada: por isso vale para qualquer perfil logado. */
async function readAsaasStatus() {
  try {
    const [row] = await db.select({ apiKeyEncrypted: billingSettings.apiKeyEncrypted, updatedAt: billingSettings.updatedAt }).from(billingSettings).limit(1)
    return { connected: Boolean(row?.apiKeyEncrypted), updatedAt: row?.updatedAt ? row.updatedAt.toISOString() : null }
  } catch (err) {
    console.error("[integracoes] falha ao ler status do Asaas:", err instanceof Error ? err.message : err)
    return undefined
  }
}

export default async function IntegracoesPage() {
  // Status consultado nos serviços e configurações reais de cada integração.
  let fiscal: { connected: boolean; updatedAt: string | null } | undefined
  const user = await getCurrentUser()
  if (user && FISCAL_ROLES.has(user.role)) {
    try {
      const s = await getFiscalSettings()
      fiscal = { connected: s.connected, updatedAt: s.updatedAt }
    } catch (err) {
      console.error("[integracoes] falha ao ler status do Brasil NFe:", err instanceof Error ? err.message : err)
    }
  }
  const asaas = user ? await readAsaasStatus() : undefined
  let evolution = { connected: false, updatedAt: null as string | null }
  if (user && ["admin", "comercial", "operacao"].includes(user.role)) {
    const connection = await getWhatsappConnection()
    evolution = { connected: connection.state === "open", updatedAt: null }
  }
  const calendar = user ? await getGoogleCalendarState() : null
  const googleCalendar = { connected: Boolean(calendar?.connected), updatedAt: calendar?.lastSyncedAt || null }
  return <IntegrationsOverview fiscal={fiscal} asaas={asaas} evolution={evolution} googleCalendar={googleCalendar} />
}
