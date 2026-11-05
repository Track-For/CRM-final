"use client"

import { useMemo } from "react"
import type { ComboOption } from "@/components/shared/entity-combobox"
import type { Option } from "@/lib/constants"
import { useClients, useDeals, useLeads, useUsers } from "@/lib/data"

/** Opções prontas para selects/combobox de vínculo (lead, cliente, negócio, responsável). */
export function useEntityOptions() {
  const leads = useLeads()
  const clients = useClients()
  const deals = useDeals()
  const users = useUsers()
  return useMemo(() => {
    const leadOptions: ComboOption[] = leads.map((l) => ({ value: l.id, label: l.name, hint: l.company, group: "Leads" }))
    const clientOptions: ComboOption[] = clients.map((c) => ({ value: c.id, label: c.name, hint: c.contactName, group: "Clientes" }))
    const dealOptions: ComboOption[] = deals.map((d) => ({ value: d.id, label: d.title, group: "Negócios" }))
    const userOptions: Option[] = users.filter((u) => u.active).map((u) => ({ value: u.id, label: u.name }))
    return { leadOptions, clientOptions, dealOptions, userOptions }
  }, [leads, clients, deals, users])
}
