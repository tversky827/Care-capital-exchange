import 'server-only'
import { cookies, headers } from 'next/headers'
import { cache } from 'react'
import { db } from '@/db'
import type { Company, CompanyMember, InvestorProfile, Lender, User } from '@/types'
import { SESSION_TTL_SECONDS, signToken, verifyToken } from './tokens'

export const SESSION_COOKIE = 'ccx_session'

export interface SessionPayload extends Record<string, unknown> {
  userId: string
  companyId: string
}

/** The resolved actor for a request. Everything downstream authorizes on this. */
export interface Actor {
  user: User
  company: Company
  membership: CompanyMember
  /** Present only when the actor's company is a lender organisation. */
  lender: Lender | null
  /** Present only when the actor's company is an investing organisation. */
  investor: InvestorProfile | null
  isAdmin: boolean
  isLender: boolean
  isBorrower: boolean
  isBroker: boolean
  isInvestor: boolean
  /** Membership roles that may mutate deal data. */
  canWrite: boolean
}

export function createSessionToken(payload: SessionPayload): string {
  return signToken(payload, SESSION_TTL_SECONDS)
}

export async function setSessionCookie(token: string): Promise<void> {
  const jar = await cookies()
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: SESSION_TTL_SECONDS,
  })
}

export async function clearSessionCookie(): Promise<void> {
  const jar = await cookies()
  jar.delete(SESSION_COOKIE)
}

/**
 * Resolves the current actor, or null when unauthenticated.
 *
 * Wrapped in React `cache` so the several dozen server components that need
 * the actor during one render share a single set of lookups.
 */
export const getActor = cache(async (): Promise<Actor | null> => {
  const jar = await cookies()
  const payload = verifyToken<SessionPayload>(jar.get(SESSION_COOKIE)?.value)
  if (!payload?.userId || !payload?.companyId) return null
  return resolveActor(payload.userId, payload.companyId)
})

export async function resolveActor(userId: string, companyId: string): Promise<Actor | null> {
  const store = await db()
  const user = await store.findById('users', userId)
  if (!user || user.status === 'suspended') return null
  const company = await store.findById('companies', companyId)
  if (!company || company.status === 'suspended') return null
  const membership = await store.selectOne('company_members', {
    where: { user_id: userId, company_id: companyId },
  })
  if (!membership) return null
  const lender =
    company.type === 'lender'
      ? await store.selectOne('lenders', { where: { company_id: companyId } })
      : null

  const investor =
    company.type === 'investor'
      ? await store.selectOne('investor_profiles', { where: { company_id: companyId } })
      : null

  return {
    user,
    company,
    membership,
    lender,
    investor,
    isAdmin: user.role === 'admin' || company.type === 'admin',
    isLender: company.type === 'lender',
    isBorrower: company.type === 'borrower',
    isBroker: company.type === 'broker',
    isInvestor: company.type === 'investor',
    canWrite: membership.role !== 'viewer',
  }
}

export class AuthError extends Error {
  constructor(message = 'Authentication required', readonly status = 401) {
    super(message)
    this.name = 'AuthError'
  }
}

/** Throws when unauthenticated. Use in route handlers and server actions. */
export async function requireActor(): Promise<Actor> {
  const actor = await getActor()
  if (!actor) throw new AuthError()
  return actor
}

export async function requireAdmin(): Promise<Actor> {
  const actor = await requireActor()
  if (!actor.isAdmin) throw new AuthError('Administrator access required', 403)
  return actor
}

export async function requestIp(): Promise<string | null> {
  const h = await headers()
  const forwarded = h.get('x-forwarded-for')
  return forwarded?.split(',')[0]?.trim() ?? h.get('x-real-ip') ?? null
}

export async function requestUserAgent(): Promise<string | null> {
  const h = await headers()
  return h.get('user-agent')
}
