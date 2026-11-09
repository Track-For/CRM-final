import Link from "next/link"
import { ChevronLeft } from "lucide-react"
import { cn } from "@/lib/utils"

interface PageHeaderProps {
  title: React.ReactNode
  description?: React.ReactNode
  actions?: React.ReactNode
  backHref?: string
  backLabel?: string
  className?: string
  children?: React.ReactNode
}

export function PageHeader({ title, description, actions, backHref, backLabel = "Voltar", className, children }: PageHeaderProps) {
  return (
    <div className={cn("mb-6 flex flex-col gap-4 lg:mb-7", className)}>
      {backHref && (
        <Link href={backHref} className="inline-flex w-fit items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground">
          <ChevronLeft className="size-3.5" />
          {backLabel}
        </Link>
      )}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0 space-y-1.5">
          <h1 className="text-2xl font-semibold tracking-[-0.035em] text-balance sm:text-[28px] sm:leading-tight">{title}</h1>
          {description && <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">{description}</p>}
        </div>
        {actions && <div className="flex max-w-full shrink-0 flex-wrap items-center gap-2">{actions}</div>}
      </div>
      {children}
    </div>
  )
}
