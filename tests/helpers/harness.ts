import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

/**
 * Test harness.
 *
 * Configures the environment before any application module is imported: an
 * in-memory store, an isolated upload directory, no demo seeding, and a fixed
 * auth secret. Importing this module first is what makes the acceptance test
 * hermetic.
 */
process.env.DATA_DRIVER = 'local'
process.env.SEED_DEMO_DATA = 'false'
process.env.AUTH_SECRET = 'test-secret-value-not-used-in-production'
process.env.CCX_UPLOAD_DIR = mkdtempSync(path.join(tmpdir(), 'ccx-uploads-'))

import { LocalStore } from '@/db/local-store'
import type { Store } from '@/db/store'
import type { Actor } from '@/lib/auth/session'
import type { Company, CompanyMember, User } from '@/types'

/** Installs a fresh in-memory store as the process singleton. */
export function installTestStore(): Store {
  const store = new LocalStore({ persist: false })
  ;(globalThis as { __ccxStore?: Store }).__ccxStore = store
  return store
}

export interface ActorSeed {
  email: string
  name: string
  companyName: string
  companyType: Company['type']
  role: User['role']
  memberRole?: CompanyMember['role']
}

/**
 * Creates a user, a company and the membership between them, and returns the
 * resolved `Actor` the services expect. Uses the same shape `resolveActor`
 * produces so services cannot tell the difference.
 */
export async function createActor(store: Store, seed: ActorSeed): Promise<Actor> {
  const user = await store.insert('users', {
    email: seed.email,
    full_name: seed.name,
    phone: null,
    role: seed.role,
    password_hash: null,
    mfa_enabled: false,
    mfa_required: seed.role === 'lender' || seed.role === 'admin',
    status: 'active',
    title: null,
    last_login_at: null,
    notification_preferences: { in_app: true, email: false, sms: false, muted_events: [] },
  } as never)

  const company = await store.insert('companies', {
    name: seed.companyName,
    type: seed.companyType,
    website: null,
    description: null,
    address_line1: null,
    city: null,
    state: null,
    zip: null,
    status: 'active',
  } as never)

  const membership = await store.insert('company_members', {
    company_id: company.id,
    user_id: user.id,
    role: seed.memberRole ?? 'owner',
  } as never)

  const lender =
    seed.companyType === 'lender'
      ? await store.selectOne('lenders', { where: { company_id: company.id } })
      : null

  return {
    user,
    company,
    membership,
    lender,
    isAdmin: seed.role === 'admin' || seed.companyType === 'admin',
    isLender: seed.companyType === 'lender',
    isBorrower: seed.companyType === 'borrower',
    isBroker: seed.companyType === 'broker',
    canWrite: (seed.memberRole ?? 'owner') !== 'viewer',
  }
}

/** Re-reads the lender record onto an actor after it has been created. */
export async function attachLender(store: Store, actor: Actor): Promise<Actor> {
  const lender = await store.selectOne('lenders', { where: { company_id: actor.company.id } })
  return { ...actor, lender }
}
