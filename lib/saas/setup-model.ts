import { z } from "zod"
import type { CatalogItem, Company } from "@/types"
export const setupSchema = z.object({
  name: z.string().trim().min(2).max(120), segment: z.string().trim().min(2).max(120),
  description: z.string().trim().max(2000), brandName: z.string().trim().min(2).max(80),
  brandColor: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  logo: z.string().max(140000).refine(v => !v || /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(v), "Use uma imagem PNG, JPEG ou WebP de até 100 KB."),
  services: z.array(z.object({ id: z.string().regex(/^[\w-]{1,100}$/), name: z.string().trim().min(2).max(120), description: z.string().trim().max(2000), basePrice: z.number().finite().min(0).max(1e9), monthlyFee: z.number().finite().min(0).max(1e9) })).min(1, "Cadastre pelo menos um serviço.").max(30)
    .refine(items => new Set(items.map(i => i.id)).size === items.length, "Serviços duplicados."),
})
export type SetupInput = z.infer<typeof setupSchema>
export function workspaceSetupPlan(input: SetupInput, company: Company, catalog: CatalogItem[], now: string) {
  const value = setupSchema.parse(input)
  const services: CatalogItem[] = value.services.map(service => ({ ...catalog.find(item => item.id === service.id), projectType: "outros", deadlineDays: null, priceFrom: false, includedPages: 0, ...service, active: true }))
  // Serviços removidos ficam inativos; propostas e contratos anteriores mantêm suas referências.
  const inactive = catalog.filter(item => !services.some(service => service.id === item.id)).map(item => ({ ...item, active: false }))
  return { company: { ...company, name: value.name, businessProfile: { segment: value.segment, description: value.description, brandName: value.brandName, brandColor: value.brandColor, logo: value.logo, configuredAt: now } }, catalog: [...services, ...inactive] }
}
