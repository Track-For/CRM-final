import { cn } from "@/lib/utils"
import Image from "next/image"

/** Logo oficial, com fundo escuro para preservar o contraste da parte branca. */
export function Logo({ collapsed, className }: { collapsed?: boolean; className?: string }) {
  return (
    <div className={cn("flex items-center gap-2.5", className)}>
      <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-black p-1">
        <Image src="/brand/track-for.png" alt="" width={673} height={648} sizes="32px" className="h-full w-full object-contain" priority />
      </span>
      {!collapsed && (
        <div className="min-w-0 leading-tight">
          <p className="truncate text-sm font-semibold tracking-tight">Track For</p>
          <p className="num truncate text-[10px] tracking-widest text-muted-foreground uppercase">CRM</p>
        </div>
      )}
    </div>
  )
}
