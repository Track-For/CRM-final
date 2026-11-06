"use client"

import { useMemo } from "react"
import QRCode from "qrcode"

/** Codifica exatamente o Pix copia e cola recebido da cobrança. */
export function PixQr({ value, size = 160 }: { value: string; size?: number }) {
  const qr = useMemo(() => {
    try {
      if (!value.trim()) return null
      const { modules } = QRCode.create(value, { errorCorrectionLevel: "M" })
      const cells: string[] = []
      for (let row = 0; row < modules.size; row++) {
        for (let col = 0; col < modules.size; col++) {
          if (modules.get(row, col)) cells.push(`M${col},${row}h1v1h-1z`)
        }
      }
      return { dimension: modules.size, path: cells.join("") }
    } catch { return null }
  }, [value])
  if (!qr) return <p role="status" className="text-xs text-muted-foreground">Não foi possível gerar o QR Code. Use o código Pix copia e cola.</p>
  // Margem branca de quatro módulos para permitir a leitura por aplicativos bancários.
  return <svg viewBox={`-4 -4 ${qr.dimension + 8} ${qr.dimension + 8}`} width={size} height={size} className="shrink-0 rounded-md bg-white" role="img" aria-label="QR code Pix" shapeRendering="crispEdges">
    <rect x={-4} y={-4} width={qr.dimension + 8} height={qr.dimension + 8} fill="#ffffff" />
    <path d={qr.path} fill="#000000" />
  </svg>
}
