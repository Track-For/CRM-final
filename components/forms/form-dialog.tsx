"use client"

import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { cn } from "@/lib/utils"

interface FormDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description?: string
  onSubmit: (e: React.FormEvent<HTMLFormElement>) => void
  submitLabel?: string
  submitting?: boolean
  size?: "md" | "lg" | "xl"
  children: React.ReactNode
  extraFooter?: React.ReactNode
}

const sizeClass = { md: "sm:max-w-md", lg: "sm:max-w-xl", xl: "sm:max-w-3xl" }

/** Modal com <form>, cabeçalho, corpo rolável e rodapé Cancelar/Salvar. */
export function FormDialog({ open, onOpenChange, title, description, onSubmit, submitLabel = "Salvar", submitting, size = "lg", children, extraFooter }: FormDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={cn("max-h-[92dvh] gap-0 overflow-hidden p-0", sizeClass[size])}>
        <form onSubmit={onSubmit} className="flex max-h-[92dvh] flex-col" noValidate>
          <DialogHeader className="border-b p-4">
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription className={description ? undefined : "sr-only"}>{description ?? title}</DialogDescription>
          </DialogHeader>
          <div className="flex-1 space-y-4 overflow-y-auto p-4">{children}</div>
          <DialogFooter className="m-0 flex-row justify-end gap-2 rounded-none border-t bg-card p-4">
            {extraFooter}
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitLabel}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
