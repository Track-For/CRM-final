import { InvoicesView } from "@/components/invoices/invoices-view"
import { getCurrentUser } from "@/lib/auth/session"
import { getFiscalSettings, listInvoices, type FiscalSettingsView, type InvoiceView } from "@/lib/fiscal/actions"

const FISCAL_ROLES = new Set(["admin", "financeiro"])

export default async function NotasFiscaisPage() {
  const user = await getCurrentUser()
  if (!user || !FISCAL_ROLES.has(user.role)) {
    return <InvoicesView initialInvoices={[]} settings={null} errorTitle="Acesso restrito" loadError="Seu usuário não tem permissão para ver notas fiscais. Fale com um administrador." />
  }

  let data: { settings: FiscalSettingsView; invoices: InvoiceView[] } | null = null
  try {
    const [settings, invoices] = await Promise.all([getFiscalSettings(), listInvoices()])
    data = { settings, invoices }
  } catch (err) {
    console.error("[notas-fiscais] falha ao carregar:", err instanceof Error ? err.message : err)
  }

  if (!data) return <InvoicesView initialInvoices={[]} settings={null} loadError="Não foi possível carregar as notas do banco de dados. Tente recarregar a página." />
  return <InvoicesView initialInvoices={data.invoices} settings={data.settings} />
}
