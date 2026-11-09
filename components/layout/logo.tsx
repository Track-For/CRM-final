import { cn } from "@/lib/utils"
import Image from "next/image"

/** Identidade do Nexo CRM, compartilhada pelas telas de acesso e navegação. */
export function Logo({ collapsed, className }: { collapsed?: boolean; className?: string }) {
  return (
    <div className={cn("flex items-center gap-2.5", className)}>
      <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-[#2563eb] p-1">
        <Image src="/brand/nexo.svg" alt="" width={64} height={64} sizes="32px" className="h-full w-full object-contain" priority />
      </span>
      {!collapsed && (
        <div className="min-w-0 leading-tight">
          <p className="truncate text-sm font-semibold tracking-tight">Nexo</p>
          <p className="num truncate text-[10px] tracking-widest text-muted-foreground uppercase">CRM</p>
        </div>
      )}
    </div>
  )
}
