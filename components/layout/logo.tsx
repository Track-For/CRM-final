"use client"

import { cn } from "@/lib/utils"
import Image from "next/image"
import { useCompany } from "@/lib/data"

/** Identidade do Nexo CRM, compartilhada pelas telas de acesso e navegação. */
export function Logo({ collapsed, className, brand }: { collapsed?: boolean; className?: string; brand?: { brandName: string; brandColor: string; logo: string } }) {
  const stored = useCompany().businessProfile
  const profile = brand || stored
  return (
    <div className={cn("flex items-center gap-2.5", className)}>
      <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-[#2563eb] p-1 shadow-[0_3px_12px_#2563eb30]" style={profile ? { backgroundColor: profile.brandColor } : undefined}>
        <Image src={profile?.logo || "/brand/nexo.svg"} unoptimized={Boolean(profile?.logo)} alt="" width={64} height={64} sizes="32px" className="h-full w-full object-contain" priority />
      </span>
      {!collapsed && (
        <div className="min-w-0 leading-tight">
          <p className="truncate text-lg font-semibold tracking-tight">{profile?.brandName || "Nexo"}</p>
          <p className="truncate text-[9px] tracking-[0.2em] text-muted-foreground uppercase">CRM</p>
        </div>
      )}
    </div>
  )
}
