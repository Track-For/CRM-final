"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { PanelLeftClose, PanelLeftOpen } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { Logo } from "@/components/layout/logo"
import { NAV_GROUP_LABEL, NAV_ITEMS, type NavItem } from "@/lib/permissions"
import { useUiStore } from "@/lib/store/ui-store"
import { cn } from "@/lib/utils"

function useVisibleGroups() {
  const role = useUiStore((s) => s.role)
  const items = NAV_ITEMS.filter((i) => i.roles.includes(role) && !["/kanban", "/funil"].includes(i.href))
  const groups = (Object.keys(NAV_GROUP_LABEL) as NavItem["group"][])
    .map((g) => ({ group: g, items: items.filter((i) => i.group === g) }))
    .filter((g) => g.items.length)
  return groups
}

function NavLinks({ collapsed, onNavigate }: { collapsed?: boolean; onNavigate?: () => void }) {
  const pathname = usePathname()
  const groups = useVisibleGroups()
  return (
    <nav aria-label="Navegação principal" className="flex flex-col gap-5">
      {groups.map(({ group, items }) => (
        <div key={group} className="flex flex-col gap-0.5">
          {!collapsed && <p className="px-2.5 pb-1 text-[10px] font-medium tracking-widest text-muted-foreground uppercase">{NAV_GROUP_LABEL[group]}</p>}
          {items.map((item) => {
            const active = pathname === item.href || pathname.startsWith(`${item.href}/`) || (item.href === "/vendas" && ["/kanban", "/funil"].includes(pathname))
            const link = (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                onClick={onNavigate}
                className={cn(
                  "group relative flex min-h-11 items-center gap-2.5 rounded-lg px-2.5 text-sm text-sidebar-foreground transition-colors hover:bg-sidebar-accent hover:text-foreground",
                  active && "bg-sidebar-accent font-semibold text-foreground shadow-sm",
                  collapsed && "justify-center px-0",
                )}
              >
                {active && <span className="absolute top-1.5 bottom-1.5 left-0 w-0.5 rounded-full bg-primary" />}
                <item.icon className={cn("size-4 shrink-0", active ? "text-primary" : "text-muted-foreground group-hover:text-foreground")} />
                {!collapsed && <span className="truncate">{item.label}</span>}
              </Link>
            )
            return collapsed ? (
              <Tooltip key={item.href}>
                <TooltipTrigger asChild>{link}</TooltipTrigger>
                <TooltipContent side="right">{item.label}</TooltipContent>
              </Tooltip>
            ) : (
              link
            )
          })}
        </div>
      ))}
    </nav>
  )
}

export function Sidebar() {
  const collapsed = useUiStore((s) => s.sidebarCollapsed)
  const toggle = useUiStore((s) => s.toggleSidebar)
  return (
    <aside className={cn("crm-sidebar sticky top-0 hidden h-dvh shrink-0 flex-col border-r bg-sidebar transition-[width] duration-200 lg:flex", collapsed ? "w-16" : "w-64")}>
      <div className={cn("flex h-14 items-center border-b px-3", collapsed ? "justify-center" : "justify-between")}>
        <Link href="/dashboard" aria-label="Nexo CRM — início">
          <Logo collapsed={collapsed} />
        </Link>
      </div>
      <div className="flex-1 overflow-y-auto p-2 py-4">
        <NavLinks collapsed={collapsed} />
      </div>
      <div className="border-t p-2">
        <Button variant="ghost" size={collapsed ? "icon" : "sm"} className={cn("text-muted-foreground", !collapsed && "w-full justify-start")} onClick={toggle} aria-label={collapsed ? "Expandir menu" : "Recolher menu"}>
          {collapsed ? <PanelLeftOpen /> : <PanelLeftClose />}
          {!collapsed && "Recolher menu"}
        </Button>
      </div>
    </aside>
  )
}

export function MobileNav() {
  const open = useUiStore((s) => s.mobileNavOpen)
  const setOpen = useUiStore((s) => s.setMobileNavOpen)
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetContent side="left" className="crm-sidebar w-72 gap-0 bg-sidebar p-0">
        <div className="flex h-14 items-center border-b px-4">
          <SheetTitle asChild>
            <div>
              <Logo />
            </div>
          </SheetTitle>
          <SheetDescription className="sr-only">Menu de navegação</SheetDescription>
        </div>
        <div className="flex-1 overflow-y-auto p-3">
          <NavLinks onNavigate={() => setOpen(false)} />
        </div>
      </SheetContent>
    </Sheet>
  )
}
