import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"

export function StatsSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="space-y-3 rounded-xl border bg-card p-4">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-7 w-32" />
          <Skeleton className="h-3 w-16" />
        </div>
      ))}
    </div>
  )
}

export function TableSkeleton({ rows = 8, className }: { rows?: number; className?: string }) {
  return (
    <div className={cn("overflow-hidden rounded-xl border bg-card", className)}>
      <div className="border-b p-3">
        <Skeleton className="h-4 w-1/3" />
      </div>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-4 border-b p-3 last:border-0">
          <Skeleton className="size-8 rounded-full" />
          <Skeleton className="h-4 flex-1" />
          <Skeleton className="hidden h-4 w-24 md:block" />
          <Skeleton className="hidden h-4 w-20 md:block" />
        </div>
      ))}
    </div>
  )
}

export function ChartSkeleton({ className }: { className?: string }) {
  return (
    <div className={cn("space-y-3 rounded-xl border bg-card p-4", className)}>
      <Skeleton className="h-4 w-40" />
      <Skeleton className="h-56 w-full" />
    </div>
  )
}

export function BoardSkeleton({ columns = 5 }: { columns?: number }) {
  return (
    <div className="flex gap-3 overflow-hidden">
      {Array.from({ length: columns }).map((_, i) => (
        <div key={i} className="w-72 shrink-0 space-y-2 rounded-xl border bg-card p-3">
          <Skeleton className="h-4 w-28" />
          {Array.from({ length: 3 }).map((__, k) => (
            <Skeleton key={k} className="h-24 w-full" />
          ))}
        </div>
      ))}
    </div>
  )
}

/** Skeleton genérico de página: cabeçalho + KPIs + tabela. */
export function PageSkeleton({ stats = true }: { stats?: boolean }) {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Skeleton className="h-7 w-48" />
        <Skeleton className="h-4 w-72" />
      </div>
      {stats && <StatsSkeleton />}
      <TableSkeleton />
    </div>
  )
}
