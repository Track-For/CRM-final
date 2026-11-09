import { readFile } from "node:fs/promises"
import path from "node:path"
import { ImageResponse } from "next/og"

export async function brandIcon(size: number) {
  const logo = await readFile(path.join(process.cwd(), "public/brand/nexo.svg"))
  return new ImageResponse(
    <div style={{ display: "flex", width: "100%", height: "100%", alignItems: "center", justifyContent: "center", background: "#2563eb", padding: size / 10 }}>
      {/* Usa o mesmo símbolo da navegação nos ícones do navegador e do celular. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={`data:image/svg+xml;base64,${logo.toString("base64")}`} alt="" width={size * 0.8} height={size * 0.8} />
    </div>,
    { width: size, height: size },
  )
}
