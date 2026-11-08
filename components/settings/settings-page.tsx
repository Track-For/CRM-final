"use client"

import Link from "next/link"
import { Button } from "@/components/ui/button"
import { useState } from "react"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { PageHeader } from "@/components/shared/page-header"
import { AppearanceSettings } from "@/components/settings/appearance-settings"
import { CompanySettings } from "@/components/settings/company-settings"
import { FinancialCategoriesSettings, LostReasonsSettings } from "@/components/settings/list-settings"
import { PipelinesSettings } from "@/components/settings/pipelines-settings"
import { PricingSettings } from "@/components/settings/pricing-settings"
import { QuickMessagesSettings } from "@/components/settings/quick-messages-settings"
import { SecuritySettings } from "@/components/settings/security-settings"
import { UsersSettings } from "@/components/settings/users-settings"

interface TabContext {
  totpEnabled: boolean
}

const TABS: { value: string; label: string; render: (ctx: TabContext) => React.ReactNode }[] = [
  { value: "empresa", label: "Empresa", render: () => <CompanySettings /> },
  { value: "usuarios", label: "Usuários e permissões", render: () => <UsersSettings /> },
  { value: "pipelines", label: "Pipelines e etapas", render: () => <PipelinesSettings /> },
  { value: "precificacao", label: "Catálogo e precificação", render: () => <PricingSettings /> },
  { value: "mensagens", label: "Mensagens prontas", render: () => <QuickMessagesSettings /> },
  { value: "perda", label: "Motivos de perda", render: () => <LostReasonsSettings /> },
  { value: "categorias", label: "Categorias financeiras", render: () => <FinancialCategoriesSettings /> },
  { value: "seguranca", label: "Segurança", render: (ctx) => <SecuritySettings totpEnabled={ctx.totpEnabled} /> },
  { value: "aparencia", label: "Aparência", render: () => <AppearanceSettings /> },
]

const STORAGE_KEY = "solidtech-settings-tab"

function initialTab() {
  try {
    const saved = typeof window !== "undefined" ? window.localStorage.getItem(STORAGE_KEY) : null
    return TABS.some((t) => t.value === saved) ? saved! : "empresa"
  } catch {
    return "empresa"
  }
}

export function SettingsPage({ totpEnabled = false }: { totpEnabled?: boolean }) {
  const [tab, setTab] = useState(initialTab)
  const change = (value: string) => {
    setTab(value)
    try {
      window.localStorage.setItem(STORAGE_KEY, value)
    } catch {
      /* armazenamento indisponível */
    }
  }
  return (
    <>
      <PageHeader title="Configurações" description="Empresa, equipe, pipelines, precificação, mensagens, segurança e preferências." actions={<><Button variant="outline" asChild><Link href="/configuracoes/google-agenda">Google Agenda</Link></Button></>} />
      <Tabs value={tab} onValueChange={change} className="gap-6">
        <div className="-mx-4 overflow-x-auto px-4 pb-1 lg:mx-0 lg:px-0">
          <TabsList className="w-max">
            {TABS.map((t) => (
              <TabsTrigger key={t.value} value={t.value} className="px-3">
                {t.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>
        {TABS.map((t) => (
          <TabsContent key={t.value} value={t.value}>
            {t.render({ totpEnabled })}
          </TabsContent>
        ))}
      </Tabs>
    </>
  )
}
