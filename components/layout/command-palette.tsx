"use client"
import { stageName } from "@/components/sales/utils"
import { usePipelines } from "@/lib/data"

import { useEffect } from "react"
import { useRouter } from "next/navigation"
import { Building2, CalendarDays, CheckSquare, FileText, Handshake, Plus, UserRound } from "lucide-react"
import { CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, CommandSeparator } from "@/components/ui/command"
import { useClients, useDeals, useLeads } from "@/lib/data"
import { formatMoney } from "@/lib/format"
import { NAV_ITEMS } from "@/lib/permissions"
import { useUiStore } from "@/lib/store/ui-store"

/** Busca global (Ctrl/Cmd+K): páginas, leads, clientes, negócios e atalhos de criação. */
export function CommandPalette() {
  const pipelines = usePipelines()
  const router = useRouter()
  const open = useUiStore((s) => s.commandOpen)
  const setOpen = useUiStore((s) => s.setCommandOpen)
  const role = useUiStore((s) => s.role)
  const openQuickCreate = useUiStore((s) => s.openQuickCreate)
  const leads = useLeads()
  const clients = useClients()
  const deals = useDeals()

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault()
        setOpen(!useUiStore.getState().commandOpen)
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [setOpen])

  const go = (href: string) => {
    setOpen(false)
    router.push(href)
  }
  const pages = NAV_ITEMS.filter((i) => i.roles.includes(role))
  const canSell = role === "admin" || role === "comercial"

  return (
    <CommandDialog open={open} onOpenChange={setOpen} className="sm:max-w-xl">
      <CommandInput placeholder="Buscar leads, clientes, negócios e páginas..." />
      <CommandList className="max-h-[60vh]">
        <CommandEmpty>Nenhum resultado encontrado.</CommandEmpty>
        <CommandGroup heading="Páginas">
          {pages.map((p) => (
            <CommandItem key={p.href} value={`página ${p.label}`} onSelect={() => go(p.href)}>
              <p.icon />
              {p.label}
            </CommandItem>
          ))}
        </CommandGroup>
        <CommandSeparator />
        <CommandGroup heading="Criar">
          {canSell && (
            <CommandItem value="criar novo lead" onSelect={() => { setOpen(false); openQuickCreate("lead") }}>
              <Plus /> Novo lead
            </CommandItem>
          )}
          {canSell && (
            <CommandItem value="criar novo negócio" onSelect={() => { setOpen(false); openQuickCreate("deal") }}>
              <Plus /> Novo negócio
            </CommandItem>
          )}
          <CommandItem value="criar novo orçamento" onSelect={() => go("/orcamentos/novo")}>
            <FileText /> Novo orçamento
          </CommandItem>
          <CommandItem value="criar nova tarefa" onSelect={() => { setOpen(false); openQuickCreate("task") }}>
            <CheckSquare /> Nova tarefa
          </CommandItem>
          <CommandItem value="criar novo evento agenda" onSelect={() => { setOpen(false); openQuickCreate("event") }}>
            <CalendarDays /> Novo evento
          </CommandItem>
        </CommandGroup>
        {canSell && (
          <>
            <CommandSeparator />
            <CommandGroup heading="Leads">
              {leads.map((l) => (
                <CommandItem key={l.id} value={`lead ${l.name} ${l.company} ${l.email} ${l.whatsapp}`} onSelect={() => go(`/leads/${l.id}`)}>
                  <UserRound />
                  <span className="truncate">{l.name}</span>
                  <span className="ml-auto truncate text-xs text-muted-foreground">{l.company}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </>
        )}
        <CommandSeparator />
        <CommandGroup heading="Clientes">
          {clients.map((c) => (
            <CommandItem key={c.id} value={`cliente ${c.name} ${c.legalName} ${c.document} ${c.contactName}`} onSelect={() => go(`/clientes/${c.id}`)}>
              <Building2 />
              <span className="truncate">{c.name}</span>
              <span className="num ml-auto truncate text-xs text-muted-foreground">{c.document}</span>
            </CommandItem>
          ))}
        </CommandGroup>
        {role !== "operacao" && (
          <>
            <CommandSeparator />
            <CommandGroup heading="Negócios">
              {deals.map((d) => (
                <CommandItem key={d.id} value={`negócio ${d.title} ${stageName(pipelines, d.pipelineId, d.stage)}`} onSelect={() => go(`/vendas/${d.id}`)}>
                  <Handshake />
                  <span className="truncate">{d.title}</span>
                  <span className="num ml-auto shrink-0 text-xs text-muted-foreground">{formatMoney(d.value)}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </>
        )}
      </CommandList>
    </CommandDialog>
  )
}
