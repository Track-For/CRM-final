"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { cn } from "@/lib/utils"

const TABS = [
  { href: "/financeiro", label: "Visão geral" },
  { href: "/financeiro/cobrancas", label: "Cobranças" },
  { href: "/financeiro/mensalidades", label: "Mensalidades" },
  { href: "/financeiro/lancamentos", label: "Entradas e saídas" },
]

export function FinanceTabs() {
  const pathname = usePathname()
  return (
    <nav className="flex max-w-full gap-1 overflow-x-auto rounded-xl border bg-card p-1" aria-label="Seções do financeiro">
      {TABS.map((t) => {
        const active = pathname === t.href
        return (
          <Link
            key={t.href}
            href={t.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "relative shrink-0 rounded-lg px-4 py-2.5 text-[13px] text-muted-foreground transition-colors hover:text-foreground",
              active && "bg-brand-soft font-semibold text-primary",
            )}
          >
            {t.label}
          </Link>
        )
      })}
    </nav>
  )
}

/** Barra de ações no topo de cada aba do financeiro. */
export function FinanceToolbar({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
      <h2 className="text-base font-semibold">{title}</h2>
      {children && <div className="flex flex-wrap items-center gap-2">{children}</div>}
    </div>
  )
}
