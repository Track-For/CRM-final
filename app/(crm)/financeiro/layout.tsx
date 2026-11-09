import { PageHeader } from "@/components/shared/page-header"
import { FinanceTabs } from "@/components/finance/finance-tabs"

export default function FinanceLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <PageHeader title="Financeiro" description="Acompanhe recebimentos, cobranças e o fluxo financeiro da sua empresa." className="mb-5">
        <FinanceTabs />
      </PageHeader>
      {children}
    </>
  )
}
