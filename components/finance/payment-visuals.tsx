/** Representações visuais (mock) de código de barras e QR code Pix, em cores sólidas. */

function hash(text: string) {
  let h = 2166136261
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

export function Barcode({ value, height = 56 }: { value: string; height?: number }) {
  const digits = value.replace(/\D/g, "").split("").map(Number)
  const bars: { x: number; w: number }[] = []
  let x = 4
  for (const d of digits) {
    const w = 1 + (d % 3)
    bars.push({ x, w })
    x += w + 1 + ((d >> 1) % 2)
  }
  const width = x + 4
  return (
    <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" className="h-14 w-full rounded-md bg-[#f2f2f2]" role="img" aria-label="Código de barras">
      {bars.map((b, i) => (
        <rect key={i} x={b.x} y={4} width={b.w} height={height - 8} fill="#0a0a0a" />
      ))}
    </svg>
  )
}

export function PixQr({ value, size = 160 }: { value: string; size?: number }) {
  const n = 25
  let seed = hash(value)
  const next = () => {
    seed ^= seed << 13
    seed ^= seed >>> 17
    seed ^= seed << 5
    return (seed >>> 0) / 4294967296
  }
  const finder = (r: number, c: number) => {
    const inBox = (r0: number, c0: number) => r >= r0 && r < r0 + 7 && c >= c0 && c < c0 + 7
    return inBox(0, 0) || inBox(0, n - 7) || inBox(n - 7, 0)
  }
  const cells: { r: number; c: number }[] = []
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (!finder(r, c) && next() > 0.52) cells.push({ r, c })
  const box = (r: number, c: number) => (
    <g key={`f${r}${c}`}>
      <rect x={c} y={r} width={7} height={7} fill="#0a0a0a" />
      <rect x={c + 1} y={r + 1} width={5} height={5} fill="#f2f2f2" />
      <rect x={c + 2} y={r + 2} width={3} height={3} fill="#0a0a0a" />
    </g>
  )
  return (
    <svg viewBox={`-2 -2 ${n + 4} ${n + 4}`} width={size} height={size} className="rounded-md bg-[#f2f2f2]" role="img" aria-label="QR code Pix">
      {cells.map((cell) => (
        <rect key={`${cell.r}-${cell.c}`} x={cell.c} y={cell.r} width={1} height={1} fill="#0a0a0a" />
      ))}
      {box(0, 0)}
      {box(0, n - 7)}
      {box(n - 7, 0)}
    </svg>
  )
}
