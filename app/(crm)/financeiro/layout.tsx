import { PageHeader } from "@/components/shared/page-header"
import { FinanceTabs } from "@/components/finance/finance-tabs"

export default function FinanceLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <PageHeader title="Financeiro" description="Saldo, cobranças, mensalidades, entradas e saídas da Track For." className="mb-5">
        <FinanceTabs />
      </PageHeader>
      {children}
    </>
  )
}
