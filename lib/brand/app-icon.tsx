import { readFile } from "node:fs/promises"
import path from "node:path"
import { ImageResponse } from "next/og"

export async function brandIcon(size: number) {
  const logo = await readFile(path.join(process.cwd(), "public/brand/track-for.png"))
  return new ImageResponse(
    <div style={{ display: "flex", width: "100%", height: "100%", alignItems: "center", justifyContent: "center", background: "#000000", padding: size / 10 }}>
      {/* A imagem original é incorporada para gerar o ícone sem alterar o desenho da marca. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={`data:image/png;base64,${logo.toString("base64")}`} alt="" width={size * 0.8} height={size * 0.8 * 648 / 673} />
    </div>,
    { width: size, height: size },
  )
}
