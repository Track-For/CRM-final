"use client"

import { toast } from "@/lib/store/save-feedback"
import { Switch } from "@/components/ui/switch"
import { Panel } from "@/components/shared/panel"
import { ThemeSelector } from "@/components/layout/theme-selector"
import { useUiStore } from "@/lib/store/ui-store"
import { cn } from "@/lib/utils"

const TOKENS = [
  { name: "Fundo", var: "--background" },
  { name: "Menu lateral", var: "--sidebar" },
  { name: "Cor principal", var: "--primary" },
  { name: "Superfície de apoio", var: "--surface" },
]

function ToggleRow({ title, description, checked, onChange }: { title: string; description: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-4 py-3">
      <div>
        <p className="text-sm font-medium">{title}</p>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
      <Switch checked={checked} onCheckedChange={onChange} />
    </label>
  )
}

export function AppearanceSettings() {
  const showGrid = useUiStore((s) => s.showGrid)
  const setShowGrid = useUiStore((s) => s.setShowGrid)
  const density = useUiStore((s) => s.density)
  const setDensity = useUiStore((s) => s.setDensity)
  const collapsed = useUiStore((s) => s.sidebarCollapsed)
  const toggleSidebar = useUiStore((s) => s.toggleSidebar)

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Panel title="Tema" description="Escolha modo claro ou escuro. A preferência fica salva neste navegador." className="lg:col-span-2">
        <div className="max-w-sm"><ThemeSelector /></div>
      </Panel>
      <Panel title="Interface" description="Preferências salvas neste navegador.">
        <div className="divide-y">
          <ToggleRow title="Grid de fundo" description="Malha azul suave atrás do conteúdo" checked={showGrid} onChange={(v) => { setShowGrid(v); toast.success(v ? "Grid ativado" : "Grid desativado") }} />
          <ToggleRow title="Menu lateral recolhido" description="Mostra só os ícones no desktop" checked={collapsed} onChange={() => toggleSidebar()} />
          <div className="py-3">
            <p className="text-sm font-medium">Densidade</p>
            <p className="mb-3 text-xs text-muted-foreground">Espaçamento vertical das páginas</p>
            <div className="grid grid-cols-2 gap-2">
              {(["confortavel", "compacta"] as const).map((d) => (
                <button
                  key={d}
                  type="button"
                  aria-pressed={density === d}
                  onClick={() => setDensity(d)}
                  className={cn("rounded-lg border bg-surface p-3 text-left text-sm transition-colors hover:border-[#80ace9]", density === d && "border-primary/35 text-primary")}
                >
                  {d === "confortavel" ? "Confortável" : "Compacta"}
                </button>
              ))}
            </div>
          </div>
        </div>
      </Panel>
      <Panel title="Identidade visual" description="As cores acompanham o tema escolhido.">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {TOKENS.map((t) => (
            <div key={t.var} className="space-y-2 rounded-lg border bg-surface p-2">
              <div className="h-10 rounded-md border" style={{ backgroundColor: `var(${t.var})` }} />
              <div>
                <p className="text-xs font-medium">{t.name}</p>
              </div>
            </div>
          ))}
        </div>
        <div className="mt-4 space-y-1 text-sm">
          <p>
            Texto em fonte do sistema e títulos em <span className="font-semibold">Space Grotesk</span>
          </p>
          <p>
            Números, valores e IDs em <span className="num text-primary">JetBrains Mono · R$ 12.450,00</span>
          </p>
        </div>
      </Panel>
    </div>
  )
}
