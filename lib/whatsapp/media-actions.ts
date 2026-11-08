"use server"
import { randomUUID } from "node:crypto"
import { sql } from "drizzle-orm"
import { db } from "@/lib/db"
import { authorizedMediaMessage, fetchMessageMedia } from "./media"
import { readMedia } from "@/lib/ai/media-provider"

export async function analyzeWhatsappMedia(id: string) {
  const { user, message } = await authorizedMediaMessage(id)
  if (!["imageMessage", "audioMessage", "documentMessage"].includes(message.messageType)) throw Error("Leitura com IA indisponível para este tipo de mensagem.")
  const [cached] = await db.execute(sql`select data from crm_records where resource='whatsappMediaAnalyses' and id=${id} and data->>'state'='completed'`) as unknown as { data: { text: string } }[]
  if (cached) return { text: cached.data.text }
  const bucket = `${user.id}:${Math.floor(Date.now() / 3600000)}`
  const rate = await db.execute(sql`insert into crm_records(resource,id,data,created) values('whatsappMediaRate',${bucket},'{"count":1}',true)
    on conflict(resource,id) do update set data=jsonb_build_object('count',(crm_records.data->>'count')::int+1)
    where (crm_records.data->>'count')::int<20 returning id`)
  if (!(rate as unknown[]).length) throw Error("Limite de 20 leituras por hora atingido. Tente mais tarde.")
  const lease = randomUUID()
  const reserved = await db.execute(sql`insert into crm_records(resource,id,data,created,updated_by) values('whatsappMediaAnalyses',${id},
    jsonb_build_object('state','processing','lease',${lease}::text,'leaseUntil',now()+interval '3 minutes'),true,${user.id})
    on conflict(resource,id) do update set data=excluded.data,updated_by=excluded.updated_by,updated_at=now()
    where (crm_records.data->>'state'='error' and crm_records.updated_at<now()-interval '1 minute')
      or (crm_records.data->>'state'='processing' and (crm_records.data->>'leaseUntil')::timestamptz<now()) returning id`)
  if (!(reserved as unknown[]).length) throw Error("Este arquivo está sendo analisado ou exige um minuto antes de tentar novamente.")
  try {
    const result = await readMedia(await fetchMessageMedia(message))
    const saved = await db.execute(sql`update crm_records set data=${JSON.stringify({ ...result, state: "completed", readAt: new Date().toISOString() })}::jsonb,updated_at=now()
      where resource='whatsappMediaAnalyses' and id=${id} and data->>'lease'=${lease} returning id`)
    if (!(saved as unknown[]).length) throw Error("A reserva de leitura expirou. Atualize a conversa.")
    return { text: result.text }
  } catch (error) {
    await db.execute(sql`update crm_records set data=jsonb_build_object('state','error'),updated_at=now() where resource='whatsappMediaAnalyses' and id=${id} and data->>'lease'=${lease}`)
    throw error
  }
}
