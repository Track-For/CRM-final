import { cn } from "@/lib/utils"

export interface ReportColumn<T> {
  key: string
  label: string
  align?: "left" | "right"
  mono?: boolean
  render: (row: T) => React.ReactNode
}

interface ReportTableProps<T> {
  columns: ReportColumn<T>[]
  rows: T[]
  getKey: (row: T) => string
  footer?: T
  className?: string
}

/** Tabela compacta de relatório; no mobile vira lista de cards rótulo/valor. */
export function ReportTable<T>({ columns, rows, getKey, footer, className }: ReportTableProps<T>) {
  const all = footer ? [...rows, footer] : rows
  return (
    <div className={className}>
      <div className="hidden overflow-x-auto rounded-xl border md:block">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-surface/70 text-[11px] text-muted-foreground">
              {columns.map((c) => (
                <th key={c.key} className={cn("px-4 py-3 font-medium", c.align === "right" ? "text-right" : "text-left")}>
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {all.map((row, i) => {
              const isFooter = footer && i === all.length - 1
              return (
                <tr key={isFooter ? "__footer" : getKey(row)} className={cn("border-b border-border/70 transition-colors last:border-0 hover:bg-surface/60", isFooter && "bg-surface font-semibold")}>
                  {columns.map((c) => (
                    <td key={c.key} className={cn("px-4 py-3 tabular-nums", c.align === "right" && "text-right", c.mono && "num")}>
                      {c.render(row)}
                    </td>
                  ))}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <div className="space-y-2 md:hidden">
        {all.map((row, i) => {
          const isFooter = footer && i === all.length - 1
          return (
            <div key={isFooter ? "__footer" : getKey(row)} className={cn("rounded-lg border p-3", isFooter && "bg-surface")}>
              <div className="mb-1.5 text-sm font-medium">{columns[0].render(row)}</div>
              <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
                {columns.slice(1).map((c) => (
                  <div key={c.key} className="flex flex-col">
                    <dt className="text-muted-foreground">{c.label}</dt>
                    <dd className={cn(c.mono && "num")}>{c.render(row)}</dd>
                  </div>
                ))}
              </dl>
            </div>
          )
        })}
      </div>
    </div>
  )
}
