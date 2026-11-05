/** PRNG determinístico (mulberry32) para que o mock seja o mesmo a cada carga. */
export function createRandom(seed: number) {
  let a = seed >>> 0
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
  const int = (min: number, max: number) => Math.floor(next() * (max - min + 1)) + min
  const pick = <T,>(list: readonly T[]): T => list[Math.floor(next() * list.length)]
  const chance = (p: number) => next() < p
  const digits = (n: number) => Array.from({ length: n }, () => int(0, 9)).join("")
  const weighted = <T,>(entries: readonly (readonly [T, number])[]): T => {
    const total = entries.reduce((s, [, w]) => s + w, 0)
    let r = next() * total
    for (const [value, w] of entries) {
      r -= w
      if (r <= 0) return value
    }
    return entries[entries.length - 1][0]
  }
  return { next, int, pick, chance, digits, weighted }
}

export type Random = ReturnType<typeof createRandom>
