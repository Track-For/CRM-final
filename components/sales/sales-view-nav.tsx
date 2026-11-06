"use client"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { Columns3, Filter, List } from "lucide-react"
import { canAccess } from "@/lib/permissions"
import { useUiStore } from "@/lib/store/ui-store"
import { cn } from "@/lib/utils"
const views = [{ href: "/vendas", label: "Lista de negócios", icon: List }, { href: "/kanban", label: "Quadro de etapas", icon: Columns3 }, { href: "/funil", label: "Análise do funil", icon: Filter }]
export function SalesViewNav() {
  const pathname = usePathname()
  const role = useUiStore(state => state.role)
  return <nav aria-label="Visualizações de vendas" className="mb-5 flex w-fit max-w-full gap-1 overflow-x-auto rounded-xl border bg-surface p-1">{views.filter(view => canAccess(role, view.href)).map(view => <Link key={view.href} href={view.href} aria-current={pathname === view.href ? "page" : undefined} className={cn("flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-background hover:text-primary", pathname === view.href && "bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground")}><view.icon className="size-4" />{view.label}</Link>)}</nav>
}
