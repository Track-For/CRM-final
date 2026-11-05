import Link from "next/link"
import { FlaskConical, PlugZap, Receipt } from "lucide-react"
import { Button } from "@/components/ui/button"
import { EmptyState } from "@/components/shared/empty-state"
import { cn } from "@/lib/utils"

/** Aviso fixo quando as notas são emitidas em homologação (sem valor fiscal). */
export function HomologationBanner({ className }: { className?: string }) {
  return (
    <div role="status" className={cn("flex items-start gap-3 rounded-xl border border-[#4a330b] bg-warning-soft p-3 text-sm", className)}>
      <FlaskConical className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden />
      <div className="min-w-0">
        <p className="font-medium text-warning">Homologação (testes, sem valor fiscal)</p>
        <p className="text-xs text-muted-foreground">As notas vão para o ambiente de testes da prefeitura. Troque para produção em Integrações quando estiver tudo certo.</p>
      </div>
    </div>
  )
}

/** Estado vazio quando o token do Brasil NFe ainda não foi configurado. */
export function ConnectFiscalState({ canConfigure = true, className }: { canConfigure?: boolean; className?: string }) {
  return (
    <EmptyState
      icon={Receipt}
      title="Conecte o Brasil NFe"
      description="Para emitir NFS-e, cole o token da empresa do Brasil NFe na tela de integração. Sem conta ainda? O passo a passo está lá."
      className={className}
      action={
        canConfigure ? (
          <Button asChild size="sm">
            <Link href="/integracoes/brasil_nfe">
              <PlugZap />
              Configurar integração
            </Link>
          </Button>
        ) : undefined
      }
    />
  )
}
