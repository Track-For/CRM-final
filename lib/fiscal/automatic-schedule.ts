import { after } from "next/server"
import { enqueuePaidCharge, processFiscalJob } from "./automatic"

/** Persist inside the payment request; transmit after its response has completed. */
export async function schedulePaidChargeInvoice(chargeId: string): Promise<void> {
  const id = await enqueuePaidCharge(chargeId)
  if (!id) return
  after(async () => {
    try { await processFiscalJob(id) }
    catch { console.error("[fiscal] Emissão automática pendente; use Notas fiscais para retomar.") }
  })
}
