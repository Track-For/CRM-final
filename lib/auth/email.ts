import nodemailer from "nodemailer"

export type SendResult = { ok: true } | { ok: false; error: string }

function smtpConfigured(): boolean {
  return Boolean(process.env.SMTP_HOST && process.env.EMAIL_FROM)
}

/** Envia o código de verificação de login por e-mail (SMTP). */
export async function sendLoginCodeEmail(to: string, code: string, name?: string): Promise<SendResult> {
  if (!smtpConfigured()) {
    if (process.env.NODE_ENV !== "production") {
      console.info(`[auth] SMTP não configurado. Código de verificação para ${to}: ${code}`)
      return { ok: true }
    }
    return { ok: false, error: "O envio de e-mail não está configurado. Use o aplicativo autenticador ou fale com o administrador." }
  }

  const port = Number(process.env.SMTP_PORT || 587)
  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port,
    secure: port === 465,
    auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined,
  })

  const greeting = name ? `Olá, ${name.split(" ")[0]}.` : "Olá."
  const text = [
    greeting,
    "",
    `Seu código de acesso ao Track For CRM é: ${code}`,
    "",
    "O código vale por 10 minutos. Se você não tentou entrar, ignore este e-mail e considere trocar sua senha.",
    "",
    "Track For CRM",
  ].join("\n")
  const html = `<div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;color:#111;line-height:1.5">
<p>${escapeHtml(greeting)}</p>
<p>Seu código de acesso ao Track For CRM é:</p>
<p style="font-size:28px;font-weight:bold;letter-spacing:6px;margin:16px 0">${code}</p>
<p>O código vale por 10 minutos. Se você não tentou entrar, ignore este e-mail e considere trocar sua senha.</p>
<p style="color:#666">Track For CRM</p>
</div>`

  try {
    await transporter.sendMail({
      from: process.env.EMAIL_FROM,
      to,
      subject: `Seu código de acesso: ${code}`,
      text,
      html,
    })
    return { ok: true }
  } catch (err) {
    console.error("[auth] Falha ao enviar e-mail de código", err)
    return { ok: false, error: "Não foi possível enviar o e-mail agora. Tente novamente em instantes." }
  }
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string)
}
