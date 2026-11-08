"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { Lock } from "lucide-react"
import { Button } from "@/components/ui/button"
import { EmptyState } from "@/components/shared/empty-state"
import { PageSkeleton } from "@/components/shared/skeletons"
import { CommandPalette } from "@/components/layout/command-palette"
import { QuickCreateHost } from "@/components/layout/quick-create-host"
import { MobileNav, Sidebar } from "@/components/layout/sidebar"
import { Topbar } from "@/components/layout/topbar"
import { ROLE_LABEL } from "@/lib/constants"
import { useCrm } from "@/lib/data"
import { canAccess } from "@/lib/permissions"
import { useUiStore } from "@/lib/store/ui-store"

/** Carrega o store (mock/API) e reidrata as preferências locais no cliente. */
export function useAppBootstrap() {
  const bootstrap = useCrm((s) => s.bootstrap)
  const [hydrated, setHydrated] = useState(false)
  useEffect(() => {
    let active = true
    void (async () => {
      await useUiStore.persist.rehydrate()
      await bootstrap(true)
      if (active) setHydrated(true)
    })()
    return () => { active = false }
  }, [bootstrap])
  return hydrated
}

function RoleGuard({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const role = useUiStore((s) => s.role)
  if (canAccess(role, pathname)) return <>{children}</>
  return (
    <EmptyState
      icon={Lock}
      title="Acesso restrito"
      description={`O papel ${ROLE_LABEL[role]} não tem permissão para esta tela. Fale com um administrador.`}
      action={
        <Button asChild size="sm" variant="outline">
          <Link href="/dashboard">Ir para o Dashboard</Link>
        </Button>
      }
      className="mt-10"
    />
  )
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const hydrated = useAppBootstrap()
  const [pendingWrites, setPendingWrites] = useState(0)
  const ready = useCrm((s) => s.status === "ready")
  const status = useCrm((s) => s.status)
  useEffect(() => {
    const failed = () => useCrm.setState({ status: "error" })
    const pending = (event: Event) => setPendingWrites(count => Math.max(0, count + (event as CustomEvent<number>).detail))
    window.addEventListener("crm-save-pending", pending)
    window.addEventListener("crm-save-error", failed)
    return () => { window.removeEventListener("crm-save-error", failed); window.removeEventListener("crm-save-pending", pending) }
  }, [])
  useEffect(() => {
    if (!pendingWrites) return
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = "" }
    window.addEventListener("beforeunload", warn)
    return () => window.removeEventListener("beforeunload", warn)
  }, [pendingWrites])
  const density = useUiStore((s) => s.density)
  const showGrid = useUiStore((s) => s.showGrid)
  useEffect(() => {
    document.body.classList.toggle("no-grid", !showGrid)
  }, [showGrid])
  if (!hydrated || (!ready && status !== "error")) return <div className="p-6"><PageSkeleton /></div>
  return (
    <div className="flex min-h-dvh">
      <div role="status" aria-live="polite" className={pendingWrites || status === "error" ? "fixed right-4 bottom-4 z-50 rounded-xl border border-primary/25 bg-background px-4 py-3 text-sm shadow-lg" : "sr-only"}>{pendingWrites ? "Salvando alterações…" : status === "error" ? "Há alterações sem confirmação" : "Dados sincronizados"}</div>
      <a href="#main-content" className="sr-only fixed top-2 left-2 z-50 rounded-lg bg-primary px-4 py-3 text-primary-foreground focus:not-sr-only">Ir para o conteúdo</a>
      <Sidebar />
      <MobileNav />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar />
        <main id="main-content" tabIndex={-1} data-density={density} className="mx-auto w-full max-w-[1600px] flex-1 px-4 py-6 data-[density=compacta]:py-4 lg:px-6">
          {status === "error" ? <EmptyState title="Não foi possível confirmar os dados" description="Uma leitura ou gravação falhou. Recarregue os registros salvos antes de continuar." action={<Button onClick={() => window.location.reload()}>Recarregar dados</Button>} /> : hydrated && ready ? <RoleGuard>{children}</RoleGuard> : <PageSkeleton />}
        </main>
      </div>
      <CommandPalette />
      {ready && <QuickCreateHost />}
    </div>
  )
}
