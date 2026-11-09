"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { ProspectingView } from "./prospecting-view"
import { ReceitaView } from "./receita-view"

export function ClientSearchView() {
  const [source, setSource] = useState<"maps" | "receita">("maps")
  return <><div role="group" aria-label="Fonte da busca de clientes" className="mb-5 flex flex-wrap gap-2"><Button variant={source === "maps" ? "default" : "outline"} aria-pressed={source === "maps"} onClick={() => setSource("maps")}>Google Maps</Button><Button variant={source === "receita" ? "default" : "outline"} aria-pressed={source === "receita"} onClick={() => setSource("receita")}>Receita Federal · CNAE</Button></div>{source === "maps" ? <ProspectingView /> : <ReceitaView />}</>
}
