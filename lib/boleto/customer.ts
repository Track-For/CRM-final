// Operações compartilhadas pelos cadastros e pela emissão. Nunca desliga notificações.
import { and, eq, sql } from "drizzle-orm"
import { crmRecords, db } from "@/lib/db"
import { AsaasError, type AsaasClient, type AsaasCustomer, type AsaasCustomerInput, type AsaasEnvironment } from "./asaas"

export async function ensureAsaasCustomer(api: AsaasClient, input: AsaasCustomerInput, clientId: string, environment: AsaasEnvironment): Promise<AsaasCustomer> {
  const [record] = await db.select().from(crmRecords).where(and(eq(crmRecords.resource, "clients"), eq(crmRecords.id, clientId))).limit(1)
  let customer: AsaasCustomer | null = null
  if (record?.data.asaasCustomerId && record.data.asaasEnvironment === environment) {
    customer = await api.getCustomer(String(record.data.asaasCustomerId))
    if (customer.deleted || customer.cpfCnpj?.replace(/\D/g, "") !== input.cpfCnpj) throw new AsaasError("O cadastro vinculado no Asaas não corresponde ao CPF/CNPJ informado.")
  }
  customer ??= await api.findCustomerByDocument(input.cpfCnpj)
  if (!customer) {
    const id = `${environment}_${input.cpfCnpj}`
    const [lock] = await db.insert(crmRecords).values({ resource: "asaas_customer_lock", id, data: { phase: "creating" }, created: false }).onConflictDoNothing().returning()
    if (!lock) throw new AsaasError("O cadastro desse CPF/CNPJ está em processamento ou aguardando confirmação do Asaas. Tente novamente em instantes.")
    try {
      customer = await api.createCustomer({ ...input, externalReference: clientId, notificationDisabled: false })
      await db.update(crmRecords).set({ data: { phase: "created", customerId: customer.id }, updatedAt: new Date() }).where(and(eq(crmRecords.resource, "asaas_customer_lock"), eq(crmRecords.id, id)))
    } catch (error) {
      // Resultado incerto não permite repetir POST e duplicar o pagador.
      if (error instanceof AsaasError && error.status && error.status < 500 && error.status !== 408) await db.delete(crmRecords).where(and(eq(crmRecords.resource, "asaas_customer_lock"), eq(crmRecords.id, id)))
      throw error
    }
  }
  const patch = JSON.stringify({ asaasCustomerId: customer.id, asaasEnvironment: environment })
  await db.update(crmRecords).set({ data: sql`${crmRecords.data} || ${patch}::jsonb`, updatedAt: new Date() }).where(and(eq(crmRecords.resource, "clients"), eq(crmRecords.id, clientId)))
  return customer
}

export async function enableChargeNotification(api: AsaasClient, customer: AsaasCustomer, input: AsaasCustomerInput): Promise<"email" | "sms"> {
  const email = input.email || customer.email
  const phone = input.mobilePhone || customer.mobilePhone
  if (!email && !phone) throw new AsaasError("Cadastre um e-mail ou celular para o Asaas enviar a cobrança.")
  await api.updateCustomer(customer.id, { notificationDisabled: false, ...(input.email ? { email: input.email } : {}), ...(input.mobilePhone ? { mobilePhone: input.mobilePhone } : {}) })
  const notifications = await api.getNotifications(customer.id)
  const created = notifications.data?.filter(notification => notification.event === "PAYMENT_CREATED" && (notification.scheduleOffset || 0) === 0) || []
  if (!created.length) throw new AsaasError("Não foi encontrada a notificação de cobrança criada no Asaas. Revise as notificações do cliente antes de emitir.")
  const channel = email ? "email" : "sms"
  for (const notification of created) await api.updateNotification(notification.id, { enabled: true, ...(channel === "email" ? { emailEnabledForCustomer: true } : { smsEnabledForCustomer: true }) })
  return channel
}
