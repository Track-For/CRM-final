import { randomBytes, scrypt as scryptCb, timingSafeEqual, type ScryptOptions } from "node:crypto"

const N = 16384
const R = 8
const P = 1
const KEY_LENGTH = 64
const SALT_BYTES = 16

function scrypt(password: string, salt: Buffer, keylen: number, options: ScryptOptions): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scryptCb(password.normalize("NFKC"), salt, keylen, options, (err, key) => (err ? reject(err) : resolve(key)))
  })
}

/** Gera hash no formato `scrypt$N$r$p$salt$hash` (salt e hash em base64). */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SALT_BYTES)
  const key = await scrypt(password, salt, KEY_LENGTH, { N, r: R, p: P, maxmem: 64 * 1024 * 1024 })
  return ["scrypt", N, R, P, salt.toString("base64"), key.toString("base64")].join("$")
}

/** Verifica a senha contra um hash gerado por `hashPassword`, em tempo constante. */
export async function verifyPassword(password: string, stored: string | null | undefined): Promise<boolean> {
  if (!stored) return false
  const parts = stored.split("$")
  if (parts.length !== 6 || parts[0] !== "scrypt") return false
  const n = Number(parts[1])
  const r = Number(parts[2])
  const p = Number(parts[3])
  if (![n, r, p].every((x) => Number.isInteger(x) && x > 0)) return false
  const salt = Buffer.from(parts[4], "base64")
  const expected = Buffer.from(parts[5], "base64")
  if (expected.length === 0) return false
  try {
    const actual = await scrypt(password, salt, expected.length, { N: n, r, p, maxmem: 256 * n * r + 1024 * 1024 })
    return actual.length === expected.length && timingSafeEqual(actual, expected)
  } catch {
    return false
  }
}

/** Hash fixo usado para igualar o tempo de resposta quando o e-mail não existe. */
let dummyHash: Promise<string> | null = null
export async function verifyDummyPassword(password: string): Promise<void> {
  dummyHash ??= hashPassword("senha-ficticia-para-tempo-constante")
  await verifyPassword(password, await dummyHash)
}
