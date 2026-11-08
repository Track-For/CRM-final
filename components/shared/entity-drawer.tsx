"use client"

import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { cn } from "@/lib/utils"

interface EntityDrawerProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: React.ReactNode
  description?: React.ReactNode
  badge?: React.ReactNode
  children: React.ReactNode
  footer?: React.ReactNode
  size?: "md" | "lg" | "xl"
}

const sizeClass = { md: "sm:max-w-md", lg: "sm:max-w-xl", xl: "sm:max-w-3xl" }

/** Painel lateral para detalhe/edição de qualquer entidade. */
export function EntityDrawer({ open, onOpenChange, title, description, badge, children, footer, size = "lg" }: EntityDrawerProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className={cn("w-full gap-0 p-0", sizeClass[size])}>
        <SheetHeader className="border-b bg-surface/70 p-5 pr-12">
          <div className="flex flex-wrap items-center gap-2">
            <SheetTitle className="text-lg break-words">{title}</SheetTitle>
            {badge}
          </div>
          <SheetDescription className={description ? undefined : "sr-only"}>{description ?? "Detalhes"}</SheetDescription>
        </SheetHeader>
        <div className="min-h-0 flex-1 overflow-y-auto p-5">{children}</div>
        {footer && <SheetFooter className="flex-row flex-wrap justify-end gap-2 border-t bg-card p-5">{footer}</SheetFooter>}
      </SheetContent>
    </Sheet>
  )
}
