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
    <nav className="-mx-4 flex gap-1 overflow-x-auto border-b px-4 md:mx-0 md:px-0" aria-label="Seções do financeiro">
      {TABS.map((t) => {
        const active = pathname === t.href
        return (
          <Link
            key={t.href}
            href={t.href}
            className={cn(
              "relative shrink-0 px-3 py-2 text-sm text-muted-foreground transition-colors hover:text-foreground",
              active && "font-medium text-foreground after:absolute after:inset-x-2 after:-bottom-px after:h-0.5 after:bg-primary",
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
