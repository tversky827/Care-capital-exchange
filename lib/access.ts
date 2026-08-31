import 'server-only'
import { db } from '@/db'
import type { Actor } from '@/lib/auth/session'
import {
  authorize, canViewDeal, canViewOfferingDocument, ForbiddenError, isMarketplaceVisible,
  type DealAccessContext, type PolicySubject,
} from '@/lib/policy'
import { CURRENT_NDA } from '@/lib/equity/nda'
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
    offeringRelease: await offeringReleasesDocument(actor, document),
    grant: grant ? { can_view: grant.can_view, can_download: grant.can_download, expires_at: grant.expires_at } : null,
  }
}

/**
 * Whether an offering has released this document to the actor's organisation.
 *
 * Three things have to be true, and all three are about *this* offering: it
 * publishes the document, the actor's engagement has reached the level it was
 * published at, and the actor has signed its confidentiality agreement. An
 * investor with several offerings open therefore reaches exactly the documents
 * each one has released to them, and no others.
 *
 * The download route is the only place bytes are served, and it consults this
 * through `canViewDocument`. A data room listing that leaks a link is
 * therefore still not a way to read the file.
 */
async function offeringReleasesDocument(actor: Actor, document: DocumentRecord): Promise<boolean> {
  if (actor.company.type !== 'investor') return false
  const store = await db()
  const entries = await store.select('offering_documents', { where: { document_id: document.id } })
  if (entries.length === 0) return false

  for (const entry of entries) {
    const offering = await store.findById('offerings', entry.offering_id)
    if (!offering || offering.deal_id !== document.deal_id) continue

    // A demonstration raise has no confidential information to protect, so no
    // agreement gates it. Every other raise does.
    if ((offering.environment ?? 'live') !== 'demo') {
      const signed = await store.select('nda_acceptances', {
        where: { offering_id: offering.id, company_id: actor.company.id, nda_version: CURRENT_NDA.version },
      })
      if (signed.length === 0) continue
    }

    const interest = actor.investor
      ? await store.selectOne('investment_interests', {
        where: { offering_id: offering.id, investor_id: actor.investor.id },
      })
      : null
    if (canViewOfferingDocument(subjectOf(actor), offering, entry.access_level, interest?.stage ?? null)) {
      return true
    }
  }
  return false
}
