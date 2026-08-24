import 'server-only'
import { db } from '@/db'
import { checkPasswordStrength, hashPassword, verifyPassword } from '@/lib/auth/password'
import { createSessionToken, resolveActor, setSessionCookie, type Actor } from '@/lib/auth/session'
import { MAGIC_LINK_TTL_SECONDS, signToken, verifyToken } from '@/lib/auth/tokens'
import { recordAudit } from './audit'
import type { Company, CompanyMember, CompanyType, User, UserRole } from '@/types'

/**
 * Registration and sign-in.
 *
 * Intent, not job title, determines the role: a new user says what they are
 * here to do and that answer creates the right kind of organisation. A lender
 * organisation additionally gets a `lenders` row in `pending` verification —
 * they can configure their lending box immediately, but see no opportunities
 * until an administrator verifies them.
 */

export type Intent = 'find_financing' | 'provide_financing' | 'manage_for_clients'

const INTENT_TO_ROLE: Record<Intent, { role: UserRole; companyType: CompanyType }> = {
  find_financing: { role: 'borrower', companyType: 'borrower' },
  provide_financing: { role: 'lender', companyType: 'lender' },
  manage_for_clients: { role: 'broker', companyType: 'broker' },
}

export class AuthFailure extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'AuthFailure'
  }
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase()
}

export interface RegisterInput {
  email: string
  password: string
  fullName: string
  companyName: string
  intent: Intent
  title?: string | null
  phone?: string | null
}

export async function register(input: RegisterInput): Promise<{ actor: Actor; token: string }> {
  const store = await db()
  const email = normalizeEmail(input.email)
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new AuthFailure('Enter a valid email address.')
  if (!input.fullName.trim()) throw new AuthFailure('Enter your full name.')
  if (!input.companyName.trim()) throw new AuthFailure('Enter your organisation name.')

  const strength = checkPasswordStrength(input.password)
  if (!strength.ok) throw new AuthFailure(strength.message!)

  const existing = await store.selectOne('users', { where: { email } })
  if (existing) throw new AuthFailure('An account with that email already exists. Sign in instead.')

  const { role, companyType } = INTENT_TO_ROLE[input.intent]

  const user = await store.insert('users', {
    email,
    full_name: input.fullName.trim(),
    phone: input.phone ?? null,
    role,
    password_hash: await hashPassword(input.password),
    mfa_enabled: false,
    // Lenders and admins handle other parties' confidential information.
    mfa_required: role === 'lender' || role === 'admin',
    status: 'active',
    title: input.title ?? null,
    last_login_at: null,
    notification_preferences: { in_app: true, email: true, sms: false, muted_events: [] },
  } as Omit<User, 'id' | 'created_at' | 'updated_at'>)

  const company = await store.insert('companies', {
    name: input.companyName.trim(),
    type: companyType,
    website: null,
    description: null,
    address_line1: null,
    city: null,
    state: null,
    zip: null,
    status: 'active',
  } as Omit<Company, 'id' | 'created_at' | 'updated_at'>)

  await store.insert('company_members', {
    company_id: company.id,
    user_id: user.id,
    role: 'owner',
  } as Omit<CompanyMember, 'id' | 'created_at'>)

  if (companyType === 'lender') {
    await store.insert('lenders', {
      company_id: company.id,
      institution_name: company.name,
      institution_type: 'bank',
      description: null,
      logo_initials: company.name.slice(0, 2).toUpperCase(),
      verification_status: 'pending',
      verified_at: null,
      verified_by: null,
      contact_name: user.full_name,
      contact_email: user.email,
      contact_phone: input.phone ?? null,
      public_profile_fields: ['description', 'asset_types', 'states', 'loan_range', 'transaction_types'],
      responsiveness_score: 50,
      is_demo: false,
    } as never)
  }

  const actor = await resolveActor(user.id, company.id)
  if (!actor) throw new AuthFailure('Account created but the session could not be established.')

  await recordAudit({
    actor,
    action: 'auth.registered',
    entityType: 'user',
    entityId: user.id,
    summary: `${user.full_name} registered ${company.name} as a ${companyType} organisation.`,
    metadata: { intent: input.intent, role },
  })

  const token = createSessionToken({ userId: user.id, companyId: company.id })
  return { actor, token }
}

export async function login(email: string, password: string): Promise<{ actor: Actor; token: string }> {
  const store = await db()
  const user = await store.selectOne('users', { where: { email: normalizeEmail(email) } })

  // Same message and comparable work whether or not the account exists.
  const ok = await verifyPassword(password, user?.password_hash ?? null)
  if (!user || !ok) throw new AuthFailure('That email and password combination is not recognised.')
  if (user.status === 'suspended') throw new AuthFailure('This account has been suspended. Contact your administrator.')

  const membership = await store.selectOne('company_members', { where: { user_id: user.id } })
  if (!membership) throw new AuthFailure('This account is not linked to an organisation.')

  const actor = await resolveActor(user.id, membership.company_id)
  if (!actor) throw new AuthFailure('This account is not linked to an active organisation.')

  await store.update('users', user.id, { last_login_at: new Date().toISOString() })
  await recordAudit({
    actor,
    action: 'auth.login',
    entityType: 'user',
    entityId: user.id,
    summary: `${user.full_name} signed in.`,
    metadata: { companyId: membership.company_id },
  })

  return { actor, token: createSessionToken({ userId: user.id, companyId: membership.company_id }) }
}

/**
 * Magic-link sign-in.
 *
 * The link is a signed, short-lived token. With no email transport configured
 * the link is returned to the caller so it can be shown in development; in
 * production it is delivered by email and never returned.
 */
export async function requestMagicLink(email: string, origin: string): Promise<{ link: string | null }> {
  const store = await db()
  const user = await store.selectOne('users', { where: { email: normalizeEmail(email) } })
  // Do not reveal whether the address is registered.
  if (!user || user.status === 'suspended') return { link: null }

  const membership = await store.selectOne('company_members', { where: { user_id: user.id } })
  if (!membership) return { link: null }

  const token = signToken({ userId: user.id, companyId: membership.company_id, scope: 'magic' }, MAGIC_LINK_TTL_SECONDS)
  const link = `${origin}/login/verify?token=${encodeURIComponent(token)}`
  const isDevelopment = process.env.NODE_ENV !== 'production'
  const { setEmailTransport: _unused, ...rest } = await import('./notifications')
  await rest.notify({
    event: 'message.received',
    companyId: membership.company_id,
    userIds: [user.id],
    title: 'Your CareCapital sign-in link',
    body: 'Use the link to sign in. It expires in 15 minutes.',
    href: link,
  })
  return { link: isDevelopment ? link : null }
}

export async function consumeMagicLink(token: string): Promise<{ actor: Actor; token: string }> {
  const payload = verifyToken<{ userId: string; companyId: string; scope: string }>(token)
  if (!payload || payload.scope !== 'magic') throw new AuthFailure('That sign-in link is invalid or has expired.')
  const actor = await resolveActor(payload.userId, payload.companyId)
  if (!actor) throw new AuthFailure('That sign-in link is no longer valid.')

  const store = await db()
  await store.update('users', actor.user.id, { last_login_at: new Date().toISOString() })
  return { actor, token: createSessionToken({ userId: actor.user.id, companyId: actor.company.id }) }
}

/** Signs a demo user in directly. Only available while demo data is enabled. */
export async function loginAsDemoUser(email: string): Promise<{ actor: Actor; token: string }> {
  if (process.env.SEED_DEMO_DATA === 'false') throw new AuthFailure('Demo sign-in is disabled.')
  const store = await db()
  const user = await store.selectOne('users', { where: { email: normalizeEmail(email) } })
  if (!user) throw new AuthFailure('Demo user not found.')
  const membership = await store.selectOne('company_members', { where: { user_id: user.id } })
  if (!membership) throw new AuthFailure('Demo user has no organisation.')
  const actor = await resolveActor(user.id, membership.company_id)
  if (!actor) throw new AuthFailure('Demo user could not be resolved.')
  await store.update('users', user.id, { last_login_at: new Date().toISOString() })
  return { actor, token: createSessionToken({ userId: user.id, companyId: membership.company_id }) }
}

export async function establishSession(token: string): Promise<void> {
  await setSessionCookie(token)
}

export async function switchCompany(actor: Actor, companyId: string): Promise<string> {
  const store = await db()
  const membership = await store.selectOne('company_members', {
    where: { user_id: actor.user.id, company_id: companyId },
  })
  if (!membership) throw new AuthFailure('You are not a member of that organisation.')
  return createSessionToken({ userId: actor.user.id, companyId })
}
