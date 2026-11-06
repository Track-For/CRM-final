"use client"

import { useState } from "react"
import { useForm, Controller } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { FlaskConical, KeyRound, Plus, Trash2, Webhook as WebhookIcon } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { FormDialog } from "@/components/forms/form-dialog"
import { EmptyState } from "@/components/shared/empty-state"
import { FormField } from "@/components/shared/form-field"
import { OptionSelect } from "@/components/shared/option-select"
import { Panel } from "@/components/shared/panel"
import { StatusBadge } from "@/components/shared/status-badge"
import { GenericConfig } from "@/components/integrations/generic-config"
import { LogsTable } from "@/components/integrations/logs-table"
import { randomToken, SecretInput } from "@/components/integrations/secret-input"
import { WEBHOOK_EVENTS } from "@/lib/constants"
import { copyToClipboard } from "@/lib/browser"
import { flushPendingWrites } from "@/lib/data/api"
import { createApiKeyAction } from "@/lib/integrations/actions"
import { api, newId, useApiKeys, useCrm, useWebhooks } from "@/lib/data"
import { formatDate, formatRelative } from "@/lib/format"
import type { Integration, Webhook, WebhookEvent } from "@/types"

const EVENT_OPTIONS = WEBHOOK_EVENTS.map((e) => ({ value: e.value, label: `${e.value} · ${e.label}` }))
const SCOPES = [
  { value: "leads:write", label: "Criar leads" },
  { value: "leads:read", label: "Ler leads" },
  { value: "deals:read", label: "Ler negócios" },
  { value: "deals:write", label: "Atualizar negócios" },
  { value: "tasks:write", label: "Criar tarefas" },
  { value: "charges:read", label: "Ler cobranças" },
]

function WebhookCard({ webhook }: { webhook: Webhook }) {
  const update = useCrm((s) => s.update)
  const remove = useCrm((s) => s.remove)
  const [url, setUrl] = useState(webhook.url)
  const [testing, setTesting] = useState(false)
  const urlValid = /^https?:\/\/.+/.test(url)

  const test = async () => {
    if (!urlValid) return toast.error("URL inválida")
    setTesting(true)
    try {
      update("webhooks", webhook.id, { url })
      await flushPendingWrites()
      const res = await api.actions.testWebhook(webhook.id)
      update("webhooks", webhook.id, { lastStatus: res.status, lastSentAt: new Date().toISOString() })
      if (res.status >= 200 && res.status < 300) toast.success(`Teste enviado: HTTP ${res.status}`, { description: `${res.ms} ms` })
      else toast.error(`Falha no teste: ${res.status ? `HTTP ${res.status}` : "sem resposta"}`)
    } catch (error) { toast.error(error instanceof Error ? error.message : "Não foi possível testar") }
    finally { setTesting(false) }
  }

  return (
    <div className="space-y-3 rounded-xl border bg-surface p-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="num text-sm font-medium text-primary">{webhook.event}</span>
        <span className="text-xs text-muted-foreground">{WEBHOOK_EVENTS.find((e) => e.value === webhook.event)?.label}</span>
        <div className="ml-auto flex items-center gap-2">
          {webhook.lastStatus != null && (
            <StatusBadge tone={webhook.lastStatus < 300 ? "success" : "danger"}>
              <span className="num">HTTP {webhook.lastStatus}</span>
            </StatusBadge>
          )}
          <Switch
            checked={webhook.active}
            onCheckedChange={(v) => {
              update("webhooks", webhook.id, { active: v })
              toast.success(v ? "Webhook ativado" : "Webhook pausado")
            }}
            aria-label="Ativo"
          />
        </div>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <FormField label="URL de destino" error={urlValid ? undefined : "URL inválida"}>
          <Input
            className="num text-xs"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onBlur={() => {
              if (urlValid && url !== webhook.url) {
                update("webhooks", webhook.id, { url })
                toast.success("URL atualizada")
              }
            }}
          />
        </FormField>
        <FormField label="Segredo (assinatura HMAC)">
          <SecretInput
            value={webhook.secret}
            readOnly
            onRegenerate={() => {
              update("webhooks", webhook.id, { secret: randomToken("whsec_", 12) })
              toast.success("Segredo regenerado", { description: "Atualize o segredo no n8n" })
            }}
          />
        </FormField>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-xs text-muted-foreground">{webhook.lastSentAt ? `Último envio ${formatRelative(webhook.lastSentAt)}` : "Nenhum envio ainda"}</span>
        <div className="flex gap-2">
          <Button
            variant="ghost"
            size="sm"
            className="text-danger"
            onClick={() => {
              remove("webhooks", webhook.id)
              toast.success("Webhook removido")
            }}
          >
            <Trash2 /> Remover
          </Button>
          <Button variant="outline" size="sm" onClick={test} disabled={testing}>
            <FlaskConical /> {testing ? "Enviando..." : "Testar"}
          </Button>
        </div>
      </div>
    </div>
  )
}

const webhookSchema = z.object({
  event: z.string().min(1, "Selecione o evento"),
  url: z.string().trim().min(1, "URL é obrigatória").url("URL inválida"),
})

function NewWebhookDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const add = useCrm((s) => s.add)
  const { register, control, handleSubmit, reset, formState } = useForm<z.infer<typeof webhookSchema>>({
    resolver: zodResolver(webhookSchema),
    defaultValues: { event: "lead.created", url: "https://n8n.solidtech.com.br/webhook/" },
  })
  const onSubmit = handleSubmit((v) => {
    add("webhooks", { id: newId("wh"), event: v.event as WebhookEvent, url: v.url, secret: randomToken("whsec_", 12), active: true })
    toast.success("Webhook criado")
    reset()
    onOpenChange(false)
  })
  return (
    <FormDialog open={open} onOpenChange={onOpenChange} title="Novo webhook de saída" description="O CRM envia um POST com o payload do evento para a URL." onSubmit={onSubmit} submitLabel="Criar webhook">
      <FormField label="Evento" required error={formState.errors.event?.message}>
        <Controller control={control} name="event" render={({ field }) => <OptionSelect value={field.value} onChange={field.onChange} options={EVENT_OPTIONS} />} />
      </FormField>
      <FormField label="URL" required error={formState.errors.url?.message}>
        <Input className="num" {...register("url")} aria-invalid={!!formState.errors.url} />
      </FormField>
    </FormDialog>
  )
}

function ApiKeysPanel() {
  const keys = useApiKeys()
  const remove = useCrm((s) => s.remove)
  const [creating, setCreating] = useState(false)
  const [name, setName] = useState("")
  const [scopes, setScopes] = useState<string[]>(["leads:write"])
  const [nameError, setNameError] = useState<string>()
  const [created, setCreated] = useState<string | null>(null)

  const create = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) return setNameError("Nome é obrigatório")
    if (!scopes.length) return setNameError("Selecione ao menos uma permissão")
    try {
      const result = await createApiKeyAction(name, scopes)
      useCrm.setState(state => ({ apiKeys: [...state.apiKeys, result.key] }))
      setCreating(false); setCreated(result.token); setName(""); setNameError(undefined)
    } catch (error) { setNameError(error instanceof Error ? error.message : "Falha ao criar chave") }

  }

  return (
    <Panel
      title="Chaves de API (entrada)"
      description="Use no n8n para criar leads, tarefas e atualizar negócios via POST /api/v1."
      actions={
        <Button size="sm" onClick={() => setCreating(true)}>
          <Plus /> Nova chave
        </Button>
      }
      contentClassName="p-0"
    >
      {keys.length === 0 ? (
        <EmptyState icon={KeyRound} title="Nenhuma chave criada" compact className="m-4" />
      ) : (
        <div className="divide-y">
          {keys.map((k) => (
            <div key={k.id} className="flex flex-col gap-2 p-4 sm:flex-row sm:items-center">
              <div className="min-w-0 flex-1">
                <p className="font-medium">{k.name}</p>
                <p className="num text-xs text-muted-foreground">{k.prefix}••••••••</p>
                <div className="mt-1.5 flex flex-wrap gap-1">
                  {k.scopes.map((s) => (
                    <StatusBadge key={s} dot={false}>
                      <span className="num">{s}</span>
                    </StatusBadge>
                  ))}
                </div>
              </div>
              <div className="text-xs text-muted-foreground sm:text-right">
                <p>
                  Criada em <span className="num">{formatDate(k.createdAt)}</span>
                </p>
                <p>{k.lastUsedAt ? `Último uso ${formatRelative(k.lastUsedAt)}` : "Nunca usada"}</p>
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="text-danger"
                onClick={() => {
                  remove("apiKeys", k.id)
                  toast.success("Chave revogada")
                }}
              >
                Revogar
              </Button>
            </div>
          ))}
        </div>
      )}

      <FormDialog open={creating} onOpenChange={setCreating} title="Nova chave de API" onSubmit={create} submitLabel="Gerar chave" size="md">
        <FormField label="Nome" required error={nameError}>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex.: n8n produção" aria-invalid={!!nameError} />
        </FormField>
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">Permissões</p>
          {SCOPES.map((s) => (
            <label key={s.value} className="flex items-center gap-2 text-sm">
              <Checkbox checked={scopes.includes(s.value)} onCheckedChange={(v) => setScopes((cur) => (v ? [...cur, s.value] : cur.filter((x) => x !== s.value)))} />
              {s.label} <span className="num text-xs text-muted-foreground">{s.value}</span>
            </label>
          ))}
        </div>
      </FormDialog>

      <Dialog open={!!created} onOpenChange={(o) => !o && setCreated(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Chave gerada</DialogTitle>
            <DialogDescription>Copie agora: por segurança ela não será exibida novamente.</DialogDescription>
          </DialogHeader>
          <div className="num rounded-lg border bg-surface p-3 text-xs break-all text-primary">{created}</div>
          <DialogFooter>
            <Button onClick={() => created && copyToClipboard(created, "Chave copiada")}>Copiar chave</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Panel>
  )
}

export function N8nConfig({ integration }: { integration: Integration }) {
  const webhooks = useWebhooks()
  const [creating, setCreating] = useState(false)
  return (
    <Tabs defaultValue="webhooks" className="gap-4">
      <div className="-mx-4 overflow-x-auto px-4 md:mx-0 md:px-0">
        <TabsList>
          <TabsTrigger value="webhooks">Webhooks de saída</TabsTrigger>
          <TabsTrigger value="keys">Chaves de API</TabsTrigger>
          <TabsTrigger value="logs">Log de envios</TabsTrigger>
          <TabsTrigger value="connection">Conexão</TabsTrigger>
        </TabsList>
      </div>
      <TabsContent value="webhooks">
        <Panel
          title="Webhooks por evento"
          description="Cada evento do CRM dispara um POST assinado para o fluxo do n8n."
          actions={
            <Button size="sm" onClick={() => setCreating(true)}>
              <Plus /> Novo webhook
            </Button>
          }
        >
          {webhooks.length === 0 ? (
            <EmptyState icon={WebhookIcon} title="Nenhum webhook configurado" description="Crie um webhook para enviar eventos ao n8n." compact />
          ) : (
            <div className="space-y-3">
              {webhooks.map((w) => (
                <WebhookCard key={w.id} webhook={w} />
              ))}
            </div>
          )}
          <p className="mt-4 text-xs text-muted-foreground">
            Cabeçalhos enviados: <span className="num">X-Solid-Event</span>, <span className="num">X-Solid-Signature</span> (HMAC SHA-256 do corpo com o segredo) e{" "}
            <span className="num">X-Solid-Delivery</span>.
          </p>
        </Panel>
        <NewWebhookDialog open={creating} onOpenChange={setCreating} />
      </TabsContent>
      <TabsContent value="keys">
        <ApiKeysPanel />
      </TabsContent>
      <TabsContent value="logs">
        <LogsTable integration="n8n" pageSize={10} />
      </TabsContent>
      <TabsContent value="connection">
        <GenericConfig integration={integration} title="Instância do n8n" />
      </TabsContent>
    </Tabs>
  )
}
