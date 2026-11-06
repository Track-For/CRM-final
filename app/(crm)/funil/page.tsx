"use client"

import { SalesViewNav } from "@/components/sales/sales-view-nav"
import { useState } from "react"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { PageHeader } from "@/components/shared/page-header"
import { FunnelAnalysis } from "@/components/sales/funnel-analysis"
import { PipelineSettings } from "@/components/sales/pipeline-settings"
import { usePipelines } from "@/lib/data"
import { PERIOD_LABEL } from "@/lib/period"
import { useUiStore } from "@/lib/store/ui-store"

const ALL = "__all"

export default function FunilPage() {
  const pipelines = usePipelines()
  const period = useUiStore((s) => s.period)
  const [pipelineId, setPipelineId] = useState(ALL)
  const [configId, setConfigId] = useState(pipelines[0]?.id ?? "")

  return (
    <div>
      <PageHeader title="Vendas" description={`Conversão entre etapas, gargalos e motivos de perda · ${PERIOD_LABEL[period]}`} />
      <SalesViewNav />
      <Tabs defaultValue="analise" className="gap-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <TabsList>
            <TabsTrigger value="analise">Análise</TabsTrigger>
            <TabsTrigger value="config">Etapas e pipelines</TabsTrigger>
          </TabsList>
        </div>
        <TabsContent value="analise" className="space-y-4">
          <Select value={pipelineId} onValueChange={setPipelineId}>
            <SelectTrigger className="w-full sm:w-56" aria-label="Pipeline">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Todos os pipelines</SelectItem>
              {pipelines.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  Pipeline {p.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <FunnelAnalysis pipelineId={pipelineId === ALL ? null : pipelineId} />
        </TabsContent>
        <TabsContent value="config">
          <PipelineSettings selectedId={configId} onSelect={setConfigId} />
        </TabsContent>
      </Tabs>
    </div>
  )
}
