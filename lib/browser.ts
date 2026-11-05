"use client"

import { toast } from "sonner"

export async function copyToClipboard(text: string, label = "Copiado para a área de transferência") {
  try {
    await navigator.clipboard.writeText(text)
    toast.success(label)
  } catch {
    toast.error("Não foi possível copiar")
  }
}

/** Gera e baixa um CSV (separador ";" e BOM para abrir certo no Excel pt-BR). */
export function downloadCsv(filename: string, rows: Record<string, string | number | null | undefined>[]) {
  if (!rows.length) {
    toast.info("Nada para exportar")
    return
  }
  const headers = Object.keys(rows[0])
  const escape = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`
  const csv = [headers.map(escape).join(";"), ...rows.map((r) => headers.map((h) => escape(r[h])).join(";"))].join("\n")
  const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = filename.endsWith(".csv") ? filename : `${filename}.csv`
  a.click()
  URL.revokeObjectURL(url)
  toast.success(`${rows.length} registro(s) exportado(s)`)
}

/** Ações que ainda não têm backend: mostram um toast coerente. */
export function mockAction(message: string, description?: string) {
  toast.success(message, { description })
}

export function openWhatsapp(url: string) {
  window.open(url, "_blank", "noopener,noreferrer")
}
