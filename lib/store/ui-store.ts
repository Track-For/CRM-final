"use client"

import { create } from "zustand"
import { persist } from "zustand/middleware"
import type { Role } from "@/types"
import type { PeriodPreset } from "@/lib/period"

export type QuickCreateKind = "lead" | "deal" | "quote" | "task" | "event" | "charge"

interface UiState {
  role: Role
  period: PeriodPreset
  sidebarCollapsed: boolean
  showGrid: boolean
  density: "confortavel" | "compacta"
  commandOpen: boolean
  mobileNavOpen: boolean
  quickCreate: QuickCreateKind | null
  quickCreateDefaults: Record<string, string | undefined>
  setRole: (role: Role) => void
  setPeriod: (period: PeriodPreset) => void
  toggleSidebar: () => void
  setShowGrid: (v: boolean) => void
  setDensity: (v: "confortavel" | "compacta") => void
  setCommandOpen: (open: boolean) => void
  setMobileNavOpen: (open: boolean) => void
  openQuickCreate: (kind: QuickCreateKind, defaults?: Record<string, string | undefined>) => void
  closeQuickCreate: () => void
}

export const useUiStore = create<UiState>()(
  persist(
    (set) => ({
      role: "admin",
      period: "mes",
      sidebarCollapsed: false,
      showGrid: true,
      density: "confortavel",
      commandOpen: false,
      mobileNavOpen: false,
      quickCreate: null,
      quickCreateDefaults: {},
      setRole: (role) => set({ role }),
      setPeriod: (period) => set({ period }),
      toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
      setShowGrid: (showGrid) => set({ showGrid }),
      setDensity: (density) => set({ density }),
      setCommandOpen: (commandOpen) => set({ commandOpen }),
      setMobileNavOpen: (mobileNavOpen) => set({ mobileNavOpen }),
      openQuickCreate: (quickCreate, defaults = {}) => set({ quickCreate, quickCreateDefaults: defaults }),
      closeQuickCreate: () => set({ quickCreate: null, quickCreateDefaults: {} }),
    }),
    {
      name: "solidtech-ui",
      skipHydration: true,
      partialize: (s) => ({ role: s.role, period: s.period, sidebarCollapsed: s.sidebarCollapsed, showGrid: s.showGrid, density: s.density }),
    },
  ),
)
