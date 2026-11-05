import { eq } from "drizzle-orm"
import type { NextRequest } from "next/server"
import { db, invoices } from "@/lib/db"
import { getCurrentUser } from "@/lib/auth/session"

const FILE_TYPES = {
  pdf: { contentType: "application/pdf", ext: "pdf" },
  xml: { contentType: "application/xml; charset=utf-8", ext: "xml" },
} as const

function jsonError(error: string, status: number) {
  return Response.json({ error }, { status, headers: { "Cache-Control": "no-store" } })
}

/** Remove um eventual prefixo data URI e espaços antes de decodificar. */
function decodeBase64(value: string): Buffer {
  const clean = value.replace(/^data:[^;]+;base64,/, "").replace(/\s/g, "")
  return Buffer.from(clean, "base64")
}

export async function GET(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser()
  if (!user) return jsonError("Não autenticado", 401)
  if (user.role !== "admin" && user.role !== "financeiro") return jsonError("Sem permissão", 403)

  const { id } = await ctx.params
  const tipo = request.nextUrl.searchParams.get("tipo") ?? "pdf"
  if (tipo !== "pdf" && tipo !== "xml") return jsonError("Tipo de arquivo inválido. Use pdf ou xml.", 400)

  const [row] = await db
    .select({
      number: invoices.number,
      rpsSeries: invoices.rpsSeries,
      rpsNumber: invoices.rpsNumber,
      file: tipo === "pdf" ? invoices.pdfBase64 : invoices.xmlBase64,
    })
    .from(invoices)
    .where(eq(invoices.id, id))
    .limit(1)

  if (!row) return jsonError("Nota não encontrada", 404)
  if (!row.file) return jsonError(tipo === "pdf" ? "O PDF desta nota ainda não está disponível." : "O XML desta nota ainda não está disponível.", 404)

  const bytes = decodeBase64(row.file)
  const { contentType, ext } = FILE_TYPES[tipo]
  const ref = (row.number ?? `RPS-${row.rpsSeries ?? ""}${row.rpsNumber ?? ""}`).replace(/[^\w.-]/g, "")
  const filename = `NFS-e-${ref || id}.${ext}`

  return new Response(new Uint8Array(bytes), {
    headers: {
      "Content-Type": contentType,
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Content-Length": String(bytes.length),
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  })
}
