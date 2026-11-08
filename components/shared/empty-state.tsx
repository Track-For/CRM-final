import type { LucideIcon } from "lucide-react"
import { Inbox } from "lucide-react"
import { cn } from "@/lib/utils"

interface EmptyStateProps {
  icon?: LucideIcon
  title: string
  description?: string
  action?: React.ReactNode
  className?: string
  compact?: boolean
}

export function EmptyState({ icon: Icon = Inbox, title, description, action, className, compact }: EmptyStateProps) {
  return (
    <div className={cn("flex flex-col items-center justify-center gap-4 rounded-xl border border-dashed bg-card text-center", compact ? "p-6" : "p-10", className)}>
      <div className="flex size-12 items-center justify-center rounded-2xl bg-brand-soft">
        <Icon className="size-5 text-primary" />
      </div>
      <div className="space-y-1">
        <p className="text-base font-semibold">{title}</p>
        {description && <p className="max-w-sm text-sm leading-relaxed text-muted-foreground">{description}</p>}
      </div>
      {action}
    </div>
  )
}
