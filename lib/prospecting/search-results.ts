import type { Prospect } from "./types"

export function prospectsForSearch(prospects: Prospect[], searchId: string, query = "") {
  if (!searchId) return []
  const filter = query.trim().toLocaleLowerCase("pt-BR")
  return prospects.filter(p => p.buscas?.includes(searchId) && `${p.nome} ${p.categoria} ${p.cidade}`.toLocaleLowerCase("pt-BR").includes(filter))
}
