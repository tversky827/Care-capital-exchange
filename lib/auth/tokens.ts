import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'

/**
 * Signed, expiring tokens used for session cookies, magic links and
 * short-lived document URLs. Payloads are signed rather than encrypted — never
 * put anything confidential in one.
 */

let cachedSecret: string | null = null

export function authSecret(): string {
  if (cachedSecret) return cachedSecret
  const configured = process.env.AUTH_SECRET
  if (configured && configured.length >= 16) {
    cachedSecret = configured
    return cachedSecret
  }
  if (process.env.NODE_ENV === 'production') {
    throw new Error('AUTH_SECRET must be set (32+ random bytes) when running in production.')
  }
  // Development convenience only: a per-process ephemeral secret. Sessions do
  // not survive a restart, which is the correct trade-off for an unset secret.
  cachedSecret = randomBytes(32).toString('hex')
  return cachedSecret
}

function base64url(input: Buffer | string): string {
  return Buffer.from(input).toString('base64url')
}

export function signToken(payload: Record<string, unknown>, ttlSeconds: number): string {
  const body = { ...payload, exp: Math.floor(Date.now() / 1000) + ttlSeconds }
  const encoded = base64url(JSON.stringify(body))
  const signature = createHmac('sha256', authSecret()).update(encoded).digest('base64url')
  return `${encoded}.${signature}`
}

export function verifyToken<T extends Record<string, unknown>>(token: string | undefined | null): T | null {
  if (!token) return null
  const [encoded, signature] = token.split('.')
  if (!encoded || !signature) return null
  const expected = createHmac('sha256', authSecret()).update(encoded).digest('base64url')
  const a = Buffer.from(signature)
  const b = Buffer.from(expected)
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null
  try {
    const payload = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')) as T & { exp?: number }
    if (typeof payload.exp === 'number' && payload.exp * 1000 < Date.now()) return null
    return payload
  } catch {
    return null
  }
}

export const SESSION_TTL_SECONDS = 60 * 60 * 12
export const MAGIC_LINK_TTL_SECONDS = 60 * 15
export const DOCUMENT_TOKEN_TTL_SECONDS = 60 * 5
