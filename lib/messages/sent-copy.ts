import { connectionEnv, type ConnectionEnv } from "@/lib/saas/connections"
import { ImapFlow } from "imapflow"
import MailComposer from "nodemailer/lib/mail-composer"

export interface SentEmail {
  from: string; to: string; subject: string; text: string; messageId: string; date: Date
}

/** SMTP entrega a mensagem; IMAP armazena uma cópia na pasta Enviados. Nunca reenvia. */
export async function saveSentEmail(mail: SentEmail, configured?: ConnectionEnv) {
  const env = configured || await connectionEnv()
  if (env.EMAIL_SAVE_SENT === "false") return ""
  const host = env.IMAP_HOST || (env.SMTP_HOST?.trim().toLowerCase() === "smtp.hostinger.com" ? "imap.hostinger.com" : "")
  const user = env.IMAP_USER || env.SMTP_USER
  const pass = env.IMAP_PASS || env.SMTP_PASS
  const warning = "E-mail aceito pelo servidor, mas a cópia não foi salva na pasta Enviados. Não reenvie o e-mail. Verifique a configuração IMAP."
  if (!host || !user || !pass) return warning
  const client = new ImapFlow({ host, port: Number(env.IMAP_PORT || 993), secure: true,
    auth: { user, pass }, logger: false, connectionTimeout: 10000, greetingTimeout: 10000, socketTimeout: 15000 })
  client.on("error", () => {})
  try {
    await client.connect()
    const folders = await client.list()
    const path = env.IMAP_SENT_FOLDER || folders.find(folder => folder.specialUse === "\\Sent")?.path
      || folders.find(folder => ["Sent", "INBOX.Sent", "Enviados"].includes(folder.path))?.path
    if (!path) return warning
    await client.mailboxOpen(path, { readOnly: true })
    const existing = await client.search({ header: { "message-id": mail.messageId } }, { uid: true })
    if (existing && existing.length) return ""
    const raw = await new MailComposer({ ...mail, disableFileAccess: true, disableUrlAccess: true }).compile().build()
    if (!await client.append(path, raw, ["\\Seen"], mail.date)) return warning
    return ""
  } catch {
    return warning
  } finally {
    await client.logout().catch(() => client.close())
  }
}
