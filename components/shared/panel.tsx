import { cn } from "@/lib/utils"

interface PanelProps {
  title?: React.ReactNode
  description?: React.ReactNode
  actions?: React.ReactNode
  children: React.ReactNode
  className?: string
  contentClassName?: string
}

/** Card padrão de seção: preto sólido, borda fina, cabeçalho opcional. */
export function Panel({ title, description, actions, children, className, contentClassName }: PanelProps) {
  return (
    <section className={cn("flex min-w-0 flex-col rounded-xl border bg-card shadow-[0_2px_8px_#17243b04]", className)}>
      {(title || actions) && (
        <header className="flex flex-wrap items-start justify-between gap-3 border-b border-border/70 px-5 py-4">
          <div className="min-w-0">
            {title && <h2 className="text-sm font-semibold leading-relaxed">{title}</h2>}
            {description && <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>}
          </div>
          {actions && <div className="flex max-w-full flex-wrap items-center gap-2">{actions}</div>}
        </header>
      )}
      <div className={cn("flex-1 p-5", contentClassName)}>{children}</div>
    </section>
  )
}

/** Linha "rótulo: valor" usada em fichas e resumos. */
export function InfoRow({ label, children, mono }: { label: string; children: React.ReactNode; mono?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-4 py-1.5 text-sm">
      <span className="shrink-0 text-muted-foreground">{label}</span>
      <span className={cn("min-w-0 text-right break-words", mono && "num")}>{children}</span>
    </div>
  )
}
