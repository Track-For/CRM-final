"use client"

import { useEffect, useRef, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import {
  Bell,
  CalendarDays,
  Check,
  CheckSquare,
  FileText,
  Handshake,
  LogOut,
  Menu,
  Plus,
  Settings,
  Search,
  UserRound,
  Wallet,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { InitialsAvatar } from "@/components/shared/user-avatar"
import { getSessionUserAction } from "@/components/auth/session-user-action"
import { logoutAction } from "@/lib/auth/actions"
import { ROLE_LABEL } from "@/lib/constants"
import { useCrm, useCurrentUser, useNotifications } from "@/lib/data"
import { formatRelative } from "@/lib/format"
import { PERIOD_LABEL, type PeriodPreset } from "@/lib/period"
import { useUiStore, type QuickCreateKind } from "@/lib/store/ui-store"
import { cn } from "@/lib/utils"
import type { Role } from "@/types"

const NEW_ITEMS: { kind: QuickCreateKind; label: string; icon: typeof Plus; roles: Role[] }[] = [
  { kind: "lead", label: "Lead", icon: UserRound, roles: ["admin", "comercial"] },
  { kind: "deal", label: "Negócio", icon: Handshake, roles: ["admin", "comercial"] },
  { kind: "quote", label: "Orçamento", icon: FileText, roles: ["admin", "comercial", "financeiro"] },
  { kind: "task", label: "Tarefa", icon: CheckSquare, roles: ["admin", "comercial", "operacao", "financeiro"] },
  { kind: "event", label: "Evento", icon: CalendarDays, roles: ["admin", "comercial", "operacao", "financeiro"] },
  { kind: "charge", label: "Cobrança", icon: Wallet, roles: ["admin", "financeiro"] },
]

function NewMenu() {
  const router = useRouter()
  const role = useUiStore((s) => s.role)
  const openQuickCreate = useUiStore((s) => s.openQuickCreate)
  const items = NEW_ITEMS.filter((i) => i.roles.includes(role))
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button size="sm" className="gap-1.5 font-semibold">
          <Plus />
          <span className="hidden sm:inline">Novo</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        <DropdownMenuLabel className="text-xs text-muted-foreground">Criar</DropdownMenuLabel>
        {items.map((i) => (
          <DropdownMenuItem key={i.kind} onSelect={() => (i.kind === "quote" ? router.push("/orcamentos/novo") : openQuickCreate(i.kind))}>
            <i.icon />
            {i.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function Notifications() {
  const notifications = useNotifications()
  const markRead = useCrm((s) => s.markNotificationsRead)
  const unread = notifications.filter((n) => !n.read).length
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative" aria-label="Notificações">
          <Bell />
          {unread > 0 && <span className="num absolute -top-0.5 -right-0.5 flex size-4 items-center justify-center rounded-full bg-primary text-[9px] font-bold text-primary-foreground">{unread}</span>}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[min(22rem,calc(100vw-2rem))] gap-0 p-0">
        <div className="flex items-center justify-between border-b px-3 py-2.5">
          <p className="text-sm font-semibold">Notificações</p>
          {unread > 0 && (
            <Button variant="ghost" size="xs" onClick={() => markRead()} className="text-muted-foreground">
              <Check />
              Marcar todas como lidas
            </Button>
          )}
        </div>
        <div className="max-h-96 overflow-y-auto">
          {notifications.length === 0 ? (
            <p className="p-6 text-center text-xs text-muted-foreground">Nenhuma notificação</p>
          ) : (
            notifications.map((n) => (
              <Link key={n.id} href={n.href ?? "#"} onClick={() => markRead([n.id])} className="flex gap-3 border-b px-3 py-2.5 last:border-0 hover:bg-accent">
                <span className={cn("mt-1.5 size-2 shrink-0 rounded-full", n.read ? "bg-transparent" : "bg-primary")} />
                <div className="min-w-0 flex-1">
                  <p className={cn("text-sm", !n.read && "font-medium")}>{n.title}</p>
                  <p className="truncate text-xs text-muted-foreground">{n.description}</p>
                  <p className="mt-0.5 text-[11px] text-muted-foreground">{formatRelative(n.createdAt)}</p>
                </div>
              </Link>
            ))
          )}
        </div>
      </PopoverContent>
    </Popover>
  )
}

function PeriodSelect() {
  const period = useUiStore((s) => s.period)
  const setPeriod = useUiStore((s) => s.setPeriod)
  return (
    <Select value={period} onValueChange={(v) => setPeriod(v as PeriodPreset)}>
      <SelectTrigger size="sm" className="hidden w-40 md:flex" aria-label="Período">
        <CalendarDays className="size-3.5 text-muted-foreground" />
        <SelectValue />
      </SelectTrigger>
      <SelectContent align="end">
        {(Object.keys(PERIOD_LABEL) as PeriodPreset[]).map((p) => (
          <SelectItem key={p} value={p}>
            {PERIOD_LABEL[p]}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

/** Usuário da sessão real (servidor); cai no usuário do store se não houver. */
function useSessionUser() {
  const [sessionUser, setSessionUser] = useState<{ name: string; email: string } | null>(null)
  useEffect(() => {
    let active = true
    getSessionUserAction()
      .then((u) => {
        if (active) setSessionUser(u)
      })
      .catch(() => {
        /* mantém o usuário do store */
      })
    return () => {
      active = false
    }
  }, [])
  return sessionUser
}

function UserMenu() {
  const storeUser = useCurrentUser()
  const sessionUser = useSessionUser()
  const user = sessionUser ? { id: storeUser?.id, name: sessionUser.name, email: sessionUser.email } : storeUser
  const logoutFormRef = useRef<HTMLFormElement>(null)
  const role = useUiStore((s) => s.role)
  const setRole = useUiStore((s) => s.setRole)
  const period = useUiStore((s) => s.period)
  const setPeriod = useUiStore((s) => s.setPeriod)
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button type="button" className="flex items-center gap-2 rounded-lg p-1 hover:bg-accent" aria-label="Menu do usuário">
            <InitialsAvatar name={user?.name ?? "Usuário"} id={user?.id} size="md" />
            <div className="hidden text-left leading-tight xl:block">
              <p className="text-sm font-medium">{user?.name ?? "—"}</p>
              <p className="text-[11px] text-primary">{ROLE_LABEL[role]}</p>
            </div>
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-60">
          <DropdownMenuLabel>
            <p className="text-sm">{user?.name}</p>
            <p className="text-xs font-normal text-muted-foreground">{user?.email}</p>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuLabel className="text-xs text-muted-foreground">Visualizar como</DropdownMenuLabel>
          <DropdownMenuRadioGroup value={role} onValueChange={(v) => setRole(v as Role)}>
            {(Object.keys(ROLE_LABEL) as Role[]).map((r) => (
              <DropdownMenuRadioItem key={r} value={r}>
                {ROLE_LABEL[r]}
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
          <div className="md:hidden">
            <DropdownMenuSeparator />
            <DropdownMenuLabel className="text-xs text-muted-foreground">Período</DropdownMenuLabel>
            <DropdownMenuRadioGroup value={period} onValueChange={(v) => setPeriod(v as PeriodPreset)}>
              {(Object.keys(PERIOD_LABEL) as PeriodPreset[]).map((p) => (
                <DropdownMenuRadioItem key={p} value={p}>
                  {PERIOD_LABEL[p]}
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          </div>
          <DropdownMenuSeparator />
          {role === "admin" && (
            <DropdownMenuItem asChild>
              <Link href="/configuracoes">
                <Settings />
                Configurações
              </Link>
            </DropdownMenuItem>
          )}
          <DropdownMenuItem variant="destructive" onSelect={() => logoutFormRef.current?.requestSubmit()}>
            <LogOut />
            Sair
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      {/* Fora do menu para não ser desmontado quando o dropdown fecha. */}
      <form ref={logoutFormRef} action={logoutAction} className="hidden" aria-hidden />
    </>
  )
}

export function Topbar() {
  const setCommandOpen = useUiStore((s) => s.setCommandOpen)
  const setMobileNavOpen = useUiStore((s) => s.setMobileNavOpen)
  return (
    <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b bg-background px-4 lg:px-6">
      <Button variant="ghost" size="icon" className="lg:hidden" onClick={() => setMobileNavOpen(true)} aria-label="Abrir menu">
        <Menu />
      </Button>
      <button
        type="button"
        onClick={() => setCommandOpen(true)}
        className="flex h-8 min-w-0 flex-1 items-center gap-2 rounded-lg border bg-card px-2.5 text-sm text-muted-foreground transition-colors hover:border-[#333] sm:max-w-md"
      >
        <Search className="size-4 shrink-0" />
        <span className="truncate">Buscar leads, clientes, negócios...</span>
        <kbd className="num ml-auto hidden rounded border bg-surface px-1.5 py-0.5 text-[10px] sm:inline">Ctrl K</kbd>
      </button>
      <div className="ml-auto flex items-center gap-1.5">
        <PeriodSelect />
        <NewMenu />
        <Notifications />
        <UserMenu />
      </div>
    </header>
  )
}
