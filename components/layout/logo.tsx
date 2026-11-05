import { cn } from "@/lib/utils"
import Image from "next/image"

/** Símbolo vetorial baseado na referência da marca. */
export function Logo({ collapsed, className }: { collapsed?: boolean; className?: string }) {
  return (
    <div className={cn("flex items-center gap-2.5", className)}>
      <Image src="/brand/solid-tech.svg" alt="" width={36} height={36} className="size-9 shrink-0" />
      {!collapsed && (
        <div className="min-w-0 leading-tight">
          <p className="truncate text-sm font-semibold tracking-tight">Track For</p>
          <p className="num truncate text-[10px] tracking-widest text-muted-foreground uppercase">CRM</p>
        </div>
      )}
    </div>
  )
}
