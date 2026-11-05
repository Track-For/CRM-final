"use client"

import Link from "next/link"
import { useParams } from "next/navigation"
import { FileX2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { EmptyState } from "@/components/shared/empty-state"
import { FormEditor } from "@/components/lead-forms/form-editor"
import { useEntity } from "@/lib/data"

export default function FormularioEditorPage() {
  const { id } = useParams<{ id: string }>()
  const publicForm = useEntity("forms", id)
  if (!publicForm) {
    return (
      <EmptyState
        icon={FileX2}
        title="Formulário não encontrado"
        description="Ele pode ter sido excluído."
        action={
          <Button asChild size="sm" variant="outline">
            <Link href="/formularios">Voltar para formulários</Link>
          </Button>
        }
      />
    )
  }
  return <FormEditor key={publicForm.id} initial={publicForm} />
}
