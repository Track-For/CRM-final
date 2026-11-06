"use client"

import { useState } from "react"
import { RefreshCw } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { refreshAsaasChargesAction } from "@/lib/boleto/import-actions"
import { getDatabase } from "@/lib/data/api"
import { useCrm } from "@/lib/data"

export function AsaasSyncButton() {
  const [busy, setBusy] = useState(false)
  const refresh = async () => {
    setBusy(true)
    try {
      const result = await refreshAsaasChargesAction()
      if (!result.ok) return void toast.error(result.error)
      if (!result.connected) return void toast.error("Configure o Asaas em Integrações antes de sincronizar")
      useCrm.setState(await getDatabase())
      toast.success(`${result.imported} cobrança(s) sincronizada(s)`, { description: result.unmatched ? `${result.unmatched} sem correspondência segura no CRM.` : "Valores e status atualizados pelo Asaas." })
    } catch { toast.error("Não foi possível atualizar as cobranças. Tente novamente.") }
    finally { setBusy(false) }
  }
  return <Button variant="outline" size="sm" disabled={busy} onClick={() => void refresh()}><RefreshCw className={busy ? "animate-spin" : undefined} />{busy ? "Sincronizando…" : "Sincronizar Asaas"}</Button>
}
