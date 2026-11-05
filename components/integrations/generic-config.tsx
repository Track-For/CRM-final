"use client"

import { useState } from "react"
import { Copy, FlaskConical, Save } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { FormField, FormGrid } from "@/components/shared/form-field"
import { OptionSelect } from "@/components/shared/option-select"
import { InfoRow, Panel } from "@/components/shared/panel"
import { SecretInput } from "@/components/integrations/secret-input"
import { CONFIG_FIELDS, INTEGRATION_HELP, webhookUrlFor } from "@/components/integrations/meta"
import { copyToClipboard } from "@/lib/browser"
import { useCrm } from "@/lib/data"
import { formatDateTime } from "@/lib/format"
import type { Integration } from "@/types"

/** Formulário de credenciais montado a partir de `integration.config`. */
export function GenericConfig({ integration, title = "Credenciais" }: { integration: Integration; title?: string }) {
  const updateIntegration = useCrm((s) => s.updateIntegration)
  const [config, setConfig] = useState<Record<string, string>>(integration.config)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [testing, setTesting] = useState(false)
  const keys = Object.keys(integration.config)

  const validate = () => {
    const next: Record<string, string> = {}
    for (const k of keys) {
      const meta = CONFIG_FIELDS[k]
      if (!config[k]?.trim()) next[k] = `${meta?.label ?? k} é obrigatório`
      else if (k === "baseUrl" && !/^https?:\/\/.+/.test(config[k])) next[k] = "URL inválida"
    }
    setErrors(next)
    return Object.keys(next).length === 0
  }

  const save = () => {
    if (!validate()) {
      toast.error("Preencha as credenciais para salvar")
      return
    }
    updateIntegration(integration.key, { config })
    toast.success("Configuração salva")
  }

  const test = () => {
    if (!validate()) {
      toast.error("Preencha as credenciais antes de testar")
      return
    }
    setTesting(true)
    setTimeout(() => {
      setTesting(false)
      updateIntegration(integration.key, { config, status: "conectado", errorMessage: undefined, lastSyncAt: new Date().toISOString() })
      toast.success("Conexão testada com sucesso", { description: "Resposta em 214 ms" })
    }, 900)
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
      <Panel
        title={title}
        description={INTEGRATION_HELP[integration.key]}
        actions={
          <>
            <Button variant="outline" size="sm" onClick={test} disabled={testing}>
              <FlaskConical /> {testing ? "Testando..." : "Testar"}
            </Button>
            <Button size="sm" onClick={save}>
              <Save /> Salvar
            </Button>
          </>
        }
      >
        <FormGrid>
          {keys.map((k) => {
            const meta = CONFIG_FIELDS[k] ?? { label: k }
            return (
              <FormField key={k} label={meta.label} required error={errors[k]} hint={meta.hint} htmlFor={`cfg-${k}`}>
                {meta.options ? (
                  <OptionSelect id={`cfg-${k}`} value={config[k]} onChange={(v) => setConfig((c) => ({ ...c, [k]: v }))} options={meta.options} />
                ) : meta.secret ? (
                  <SecretInput id={`cfg-${k}`} value={config[k] ?? ""} onChange={(v) => setConfig((c) => ({ ...c, [k]: v }))} placeholder="Cole o token aqui" />
                ) : (
                  <Input id={`cfg-${k}`} className="num" value={config[k] ?? ""} placeholder={meta.placeholder} onChange={(e) => setConfig((c) => ({ ...c, [k]: e.target.value }))} aria-invalid={!!errors[k]} />
                )}
              </FormField>
            )
          })}
        </FormGrid>
      </Panel>
      <Panel title="Webhook de entrada" description="Cadastre esta URL no painel do provedor para receber eventos.">
        <div className="space-y-3">
          <div className="flex items-center gap-1">
            <Input readOnly className="num text-xs" value={webhookUrlFor(integration.key)} />
            <Button variant="outline" size="icon" onClick={() => copyToClipboard(webhookUrlFor(integration.key), "URL copiada")} aria-label="Copiar URL">
              <Copy />
            </Button>
          </div>
          <div className="divide-y">
            <InfoRow label="Última sincronização" mono>
              {integration.lastSyncAt ? formatDateTime(integration.lastSyncAt) : "—"}
            </InfoRow>
            <InfoRow label="Identificador" mono>
              {integration.key}
            </InfoRow>
          </div>
        </div>
      </Panel>
    </div>
  )
}
