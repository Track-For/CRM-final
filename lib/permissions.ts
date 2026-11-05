import type { LucideIcon } from "lucide-react"
import {
  BarChart3,
  Calendar,
  CheckSquare,
  Columns3,
  FileText,
  Filter,
  FormInput,
  Handshake,
  LayoutDashboard,
  Plug,
  Receipt,
  Settings,
  Search,
  MessageCircle,
  Camera as Instagram,
  Users,
  UserRound,
  Wallet,
} from "lucide-react"
import type { Role } from "@/types"

export interface NavItem {
  href: string
  label: string
  icon: LucideIcon
  roles: Role[]
  group: "comercial" | "operacao" | "financeiro" | "sistema"
}

const ALL: Role[] = ["admin", "comercial", "operacao", "financeiro"]

export const NAV_ITEMS: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard, roles: ALL, group: "comercial" },
  { href: "/instagram", label: "Instagram", icon: Instagram, roles: ["admin", "comercial", "operacao"], group: "comercial" },
  { href: "/whatsapp", label: "WhatsApp", icon: MessageCircle, roles: ["admin", "comercial", "operacao"], group: "comercial" },
  { href: "/buscas", label: "Buscar clientes", icon: Search, roles: ["admin", "comercial"], group: "comercial" },
  { href: "/leads", label: "Leads", icon: UserRound, roles: ["admin", "comercial"], group: "comercial" },
  { href: "/vendas", label: "Vendas", icon: Handshake, roles: ["admin", "comercial", "financeiro"], group: "comercial" },
  { href: "/kanban", label: "Kanban", icon: Columns3, roles: ["admin", "comercial"], group: "comercial" },
  { href: "/funil", label: "Funil de vendas", icon: Filter, roles: ["admin", "comercial"], group: "comercial" },
  { href: "/orcamentos", label: "Orçamentos", icon: FileText, roles: ["admin", "comercial", "financeiro"], group: "comercial" },
  { href: "/agenda", label: "Agenda", icon: Calendar, roles: ALL, group: "operacao" },
  { href: "/tarefas", label: "Tarefas", icon: CheckSquare, roles: ALL, group: "operacao" },
  { href: "/clientes", label: "Clientes", icon: Users, roles: ALL, group: "operacao" },
  { href: "/financeiro", label: "Financeiro", icon: Wallet, roles: ["admin", "financeiro"], group: "financeiro" },
  { href: "/notas-fiscais", label: "Notas fiscais", icon: Receipt, roles: ["admin", "financeiro"], group: "financeiro" },
  { href: "/relatorios", label: "Relatórios", icon: BarChart3, roles: ["admin", "comercial", "financeiro"], group: "financeiro" },
  { href: "/formularios", label: "Formulários", icon: FormInput, roles: ["admin", "comercial", "operacao"], group: "sistema" },
  { href: "/integracoes", label: "Integrações", icon: Plug, roles: ["admin", "operacao", "financeiro"], group: "sistema" },
  { href: "/configuracoes", label: "Configurações", icon: Settings, roles: ["admin"], group: "sistema" },
]

export const NAV_GROUP_LABEL: Record<NavItem["group"], string> = {
  comercial: "Comercial",
  operacao: "Operação",
  financeiro: "Financeiro",
  sistema: "Sistema",
}

export function navItemFor(pathname: string): NavItem | undefined {
  return NAV_ITEMS.find((item) => pathname === item.href || pathname.startsWith(`${item.href}/`))
}

export function canAccess(role: Role, pathname: string): boolean {
  const item = navItemFor(pathname)
  return item ? item.roles.includes(role) : true
}
