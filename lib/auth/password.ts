import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto'
import { promisify } from 'node:util'

const scryptAsync = promisify(scrypt) as (
  password: string,
  salt: Buffer,
  keylen: number,
) => Promise<Buffer>

const KEY_LENGTH = 64

/** Hashes a password with scrypt and a per-password random salt. */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16)
  const derived = await scryptAsync(password, salt, KEY_LENGTH)
  return `scrypt$${salt.toString('hex')}$${derived.toString('hex')}`
}

/** Constant-time password verification. Returns false for malformed hashes. */
export async function verifyPassword(password: string, stored: string | null): Promise<boolean> {
  if (!stored) return false
  const [scheme, saltHex, hashHex] = stored.split('$')
  if (scheme !== 'scrypt' || !saltHex || !hashHex) return false
  let expected: Buffer
  try {
    expected = Buffer.from(hashHex, 'hex')
  } catch {
    return false
  }
  if (expected.length !== KEY_LENGTH) return false
  const derived = await scryptAsync(password, Buffer.from(saltHex, 'hex'), KEY_LENGTH)
  return timingSafeEqual(derived, expected)
}

export interface PasswordCheck {
  ok: boolean
  message?: string
}

export function checkPasswordStrength(password: string): PasswordCheck {
  if (password.length < 10) return { ok: false, message: 'Password must be at least 10 characters.' }
  if (!/[a-z]/.test(password)) return { ok: false, message: 'Password must contain a lowercase letter.' }
  if (!/[A-Z]/.test(password)) return { ok: false, message: 'Password must contain an uppercase letter.' }
  if (!/[0-9]/.test(password)) return { ok: false, message: 'Password must contain a number.' }
  return { ok: true }
}
