import 'server-only'
import { db } from '@/db'
import type { Actor } from '@/lib/auth/session'
import {
  authorize, canViewDeal, ForbiddenError, isMarketplaceVisible, type DealAccessContext, type PolicySubject,
} from '@/lib/policy'
import type { Deal, DealDistribution, DocumentRecord } from '@/types'

/** Projects a request actor onto the pure policy subject. */
export function subjectOf(actor: Actor): PolicySubject {
  return {
    userId: actor.user.id,
    companyId: actor.company.id,
    companyType: actor.company.type,
    memberRole: actor.membership.role,
    lenderId: actor.lender?.id ?? null,
    investorId: actor.investor?.id ?? null,
    isAdmin: actor.isAdmin,
  }
}

/** Loads the distribution row that links a lender actor to a deal, if any. */
export async function distributionFor(actor: Actor, dealId: string): Promise<DealDistribution | null> {
  if (!actor.lender) return null
  const store = await db()
  return store.selectOne('deal_distributions', {
    where: { deal_id: dealId, lender_id: actor.lender.id },
  })
}

export async function dealContext(actor: Actor, dealId: string): Promise<DealAccessContext> {
  return { distribution: await distributionFor(actor, dealId) }
}

export interface DealAccess {
  deal: Deal
  subject: PolicySubject
  context: DealAccessContext
  /** True when the actor reached the deal only through marketplace discovery. */
  viaMarketplaceOnly: boolean
}

/**
 * Loads a deal and asserts read access in one step. Every deal-scoped route
 * goes through this, so there is exactly one place where the check can be
 * forgotten — and it is not forgotten here.
 */
export async function loadDealForActor(actor: Actor, dealId: string): Promise<DealAccess> {
  const store = await db()
  const deal = await store.findById('deals', dealId)
  if (!deal) throw new ForbiddenError('Deal not found or not accessible.')
  const subject = subjectOf(actor)
  const context = await dealContext(actor, dealId)

  // An unverified lender never reaches deal content, distributed or not.
  if (actor.isLender && actor.lender?.verification_status !== 'verified') {
    throw new ForbiddenError('Your lender profile is pending verification.')
  }
  authorize(canViewDeal(subject, deal, context), 'Deal not found or not accessible.')

  const viaMarketplaceOnly =
    actor.isLender && !context.distribution && isMarketplaceVisible(deal)
  return { deal, subject, context, viaMarketplaceOnly }
}

export async function documentContext(
  actor: Actor,
  document: DocumentRecord,
): Promise<DealAccessContext & { grant: { can_view: boolean; can_download: boolean; expires_at: string | null } | null }> {
  const store = await db()
  const grant = await store.selectOne('document_permissions', {
    where: { document_id: document.id, company_id: actor.company.id },
  })
  return {
    distribution: await distributionFor(actor, document.deal_id),
    grant: grant ? { can_view: grant.can_view, can_download: grant.can_download, expires_at: grant.expires_at } : null,
  }
}
