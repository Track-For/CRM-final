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
    void Promise.resolve(useUiStore.persist.rehydrate()).then(() => setHydrated(true))
    void bootstrap()
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
      description={`O papel ${ROLE_LABEL[role]} não tem permissão para esta tela. Troque o papel no avatar ou fale com um administrador.`}
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
  const ready = useCrm((s) => s.status === "ready")
  const density = useUiStore((s) => s.density)
  const showGrid = useUiStore((s) => s.showGrid)
  useEffect(() => {
    document.body.classList.toggle("no-grid", !showGrid)
  }, [showGrid])
  return (
    <div className="flex min-h-dvh">
      <Sidebar />
      <MobileNav />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar />
        <main data-density={density} className="mx-auto w-full max-w-[1600px] flex-1 px-4 py-6 data-[density=compacta]:py-4 lg:px-6">
          {hydrated && ready ? <RoleGuard>{children}</RoleGuard> : <PageSkeleton />}
        </main>
      </div>
      <CommandPalette />
      {ready && <QuickCreateHost />}
    </div>
  )
}
