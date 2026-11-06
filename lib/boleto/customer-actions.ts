"use server"

import { z } from "zod"
import { getCurrentUser } from "@/lib/auth/session"
import { saveRecord } from "@/lib/data/records-actions"
import { loadBillingSettings } from "./sync"
import { decryptSecret } from "@/lib/fiscal/crypto"
import { AsaasError, createAsaasClient } from "./asaas"
import { ensureAsaasCustomer } from "./customer"
import type { Client } from "@/types"

const schema = z.object({ id: z.string().min(1).max(120), name: z.string().trim().min(1), legalName: z.string().trim().min(1), document: z.string().transform(value => value.replace(/\D/g, "")).refine(value => [11, 14].includes(value.length), "Informe CPF/CNPJ válido"), email: z.string().email().or(z.literal("")), whatsapp: z.string(), address: z.object({ zip: z.string(), street: z.string(), number: z.string(), complement: z.string().optional(), district: z.string(), city: z.string(), state: z.string() }) })

export async function saveClientAndSyncAsaasAction(client: Client) {
  const user = await getCurrentUser()
  if (!user || !["admin", "comercial", "financeiro"].includes(user.role)) return { ok: false as const, error: "Sem permissão para cadastrar clientes no Asaas." }
  const parsed = schema.safeParse(client)
  if (!parsed.success) return { ok: false as const, error: parsed.error.issues[0]?.message || "Dados do cliente inválidos" }
  try {
    await saveRecord("clients", client.id, { ...client, deletedAt: null }, true)
    const settings = await loadBillingSettings()
    if (!settings.apiKeyEncrypted) return { ok: false as const, localSaved: true, error: "Cliente salvo no CRM. Configure a chave do Asaas para concluir a sincronização." }
    const api = createAsaasClient(decryptSecret(settings.apiKeyEncrypted), settings.environment)
    const remote = await ensureAsaasCustomer(api, { name: parsed.data.legalName, cpfCnpj: parsed.data.document, email: client.email || undefined, mobilePhone: client.whatsapp.replace(/\D/g, "") || undefined, address: client.address.street || undefined, addressNumber: client.address.number || undefined, complement: client.address.complement || undefined, province: client.address.district || undefined, postalCode: client.address.zip.replace(/\D/g, "") || undefined, notificationDisabled: false, company: client.name, municipalInscription: client.municipalRegistration || undefined }, client.id, settings.environment)
    return { ok: true as const, client: { ...client, asaasCustomerId: remote.id, asaasEnvironment: settings.environment }, environment: settings.environment }
  } catch (error) { return { ok: false as const, localSaved: true, error: error instanceof AsaasError ? error.message : "Não foi possível concluir o cadastro no Asaas. Os dados locais foram preservados; tente novamente." } }
}
