import { createHmac, randomBytes, timingSafeEqual } from "node:crypto"
import QRCode from "qrcode"

/** Implementação própria de TOTP (RFC 6238): HMAC-SHA1, 6 dígitos, passo de 30s. */

const ISSUER = "Track For CRM"
const DIGITS = 6
const PERIOD = 30
const WINDOW = 1
const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567"

export function base32Encode(buf: Buffer): string {
  let bits = 0
  let value = 0
  let out = ""
  for (const byte of buf) {
    value = (value << 8) | byte
    bits += 8
    while (bits >= 5) {
      out += ALPHABET[(value >>> (bits - 5)) & 31]
      bits -= 5
    }
  }
  if (bits > 0) out += ALPHABET[(value << (5 - bits)) & 31]
  return out
}

export function base32Decode(input: string): Buffer {
  const clean = input.toUpperCase().replace(/[\s=-]/g, "")
  let bits = 0
  let value = 0
  const bytes: number[] = []
  for (const ch of clean) {
    const idx = ALPHABET.indexOf(ch)
    if (idx === -1) throw new Error("Segredo base32 inválido")
    value = (value << 5) | idx
    bits += 5
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 0xff)
      bits -= 8
    }
  }
  return Buffer.from(bytes)
}

/** Gera um segredo aleatório de 160 bits em base32. */
export function generateTotpSecret(): string {
  return base32Encode(randomBytes(20))
}

function hotp(key: Buffer, counter: number): string {
  const msg = Buffer.alloc(8)
  msg.writeBigUInt64BE(BigInt(counter))
  const hmac = createHmac("sha1", key).update(msg).digest()
  const offset = hmac[hmac.length - 1] & 0x0f
  const bin =
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff)
  return (bin % 10 ** DIGITS).toString().padStart(DIGITS, "0")
}

/** Código atual (útil para testes). */
export function generateTotp(secret: string, at = Date.now()): string {
  return hotp(base32Decode(secret), Math.floor(at / 1000 / PERIOD))
}

/** Verifica o código com janela de +-1 passo, comparando em tempo constante. */
export function verifyTotp(secret: string | null | undefined, code: string): boolean {
  if (!secret) return false
  const normalized = code.replace(/\s/g, "")
  if (!/^\d{6}$/.test(normalized)) return false
  let key: Buffer
  try {
    key = base32Decode(secret)
  } catch {
    return false
  }
  const counter = Math.floor(Date.now() / 1000 / PERIOD)
  const given = Buffer.from(normalized)
  let ok = false
  for (let i = -WINDOW; i <= WINDOW; i++) {
    const expected = Buffer.from(hotp(key, counter + i))
    if (timingSafeEqual(expected, given)) ok = true
  }
  return ok
}

/** URI otpauth:// para apps autenticadores (Google Authenticator etc.). */
export function totpUri(email: string, secret: string): string {
  const label = encodeURIComponent(`${ISSUER}:${email}`)
  const params = new URLSearchParams({
    secret,
    issuer: ISSUER,
    algorithm: "SHA1",
    digits: String(DIGITS),
    period: String(PERIOD),
  })
  return `otpauth://totp/${label}?${params.toString()}`
}

/** QR code (data URL PNG) da URI otpauth. */
export function totpQrDataUrl(email: string, secret: string): Promise<string> {
  return QRCode.toDataURL(totpUri(email, secret), { margin: 1, width: 240 })
}
