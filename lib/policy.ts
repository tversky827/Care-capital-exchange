/**
 * Authorization policy.
 *
 * This module is the single authority on who may see and do what. It mirrors
 * the SQL policies in `supabase/migrations/0002_rls.sql` one-for-one: RLS is
 * the backstop for direct PostgREST access, this layer is the backstop for the
 * server-side service-role client. Both must agree, and `tests/policy.test.ts`
 * exercises the rules here.
 *
 * Design rules:
 *  - Deny by default. Every function returns false unless a rule grants access.
 *  - Lenders never gain access to a deal implicitly. A `deal_distributions`
 *    row with a non-revoked status is the only path in.
 *  - Nothing in this file consults cookies; it is pure over its inputs, which
 *    is what makes it testable.
 */
import type {
  Deal, DealDistribution, DocumentRecord, Indication, LenderNote, MessageThread,
} from '@/types'

/** The subset of an `Actor` that authorization actually depends on. */
export interface PolicySubject {
  userId: string
  companyId: string
  companyType: 'borrower' | 'lender' | 'broker' | 'admin'
  memberRole: 'owner' | 'admin' | 'member' | 'viewer'
  lenderId: string | null
  isAdmin: boolean
}

export interface DealAccessContext {
  /** The distribution row linking this lender's organisation to the deal, if any. */
  distribution?: DealDistribution | null
}

const LIVE_DISTRIBUTION_STATUSES: DealDistribution['status'][] = ['sent', 'viewed', 'engaged', 'passed']

function ownsDeal(subject: PolicySubject, deal: Deal): boolean {
  return deal.company_id === subject.companyId
}

function hasLiveDistribution(subject: PolicySubject, deal: Deal, ctx: DealAccessContext): boolean {
  const distribution = ctx.distribution
  if (!distribution) return false
  if (distribution.deal_id !== deal.id) return false
  if (subject.lenderId === null || distribution.lender_id !== subject.lenderId) return false
  return LIVE_DISTRIBUTION_STATUSES.includes(distribution.status)
}

/**
 * A deal that is open on the marketplace is discoverable by any verified
 * lender, but discovery only ever exposes the anonymized summary — see
 * `canViewDealIdentity`.
 */
export function isMarketplaceVisible(deal: Deal): boolean {
  return deal.distribution_scope === 'marketplace' && deal.status !== 'draft' && deal.distributed_at !== null
}

export function canViewDeal(subject: PolicySubject, deal: Deal, ctx: DealAccessContext = {}): boolean {
  if (subject.isAdmin) return true
  if (ownsDeal(subject, deal)) return true
  if (subject.companyType === 'lender') {
    if (hasLiveDistribution(subject, deal, ctx)) return true
    if (isMarketplaceVisible(deal)) return true
  }
  return false
}

/** Full facility name, address and sponsor identity — narrower than `canViewDeal`. */
export function canViewDealIdentity(subject: PolicySubject, deal: Deal, ctx: DealAccessContext = {}): boolean {
  if (subject.isAdmin) return true
  if (ownsDeal(subject, deal)) return true
  if (!deal.anonymize_in_marketplace && canViewDeal(subject, deal, ctx)) return true
  // Anonymized deals reveal identity only to lenders the borrower distributed to.
  return subject.companyType === 'lender' && hasLiveDistribution(subject, deal, ctx)
}

export function canEditDeal(subject: PolicySubject, deal: Deal): boolean {
  if (subject.memberRole === 'viewer') return false
  if (subject.isAdmin) return true
  if (!ownsDeal(subject, deal)) return false
  // Terminal states are read-only for borrowers; an admin can still correct them.
  return !(['funded', 'withdrawn', 'rejected', 'archived'] as Deal['status'][]).includes(deal.status)
}

export function canDistributeDeal(subject: PolicySubject, deal: Deal): boolean {
  if (subject.memberRole === 'viewer') return false
  if (subject.isAdmin) return true
  if (!ownsDeal(subject, deal)) return false
  return subject.memberRole === 'owner' || subject.memberRole === 'admin'
}

export function canDeleteDeal(subject: PolicySubject, deal: Deal): boolean {
  if (subject.isAdmin) return true
  return ownsDeal(subject, deal) && subject.memberRole === 'owner' && deal.status === 'draft'
}

// ---------------------------------------------------------------------------
// Documents
// ---------------------------------------------------------------------------

export interface DocumentAccessContext extends DealAccessContext {
  /** An explicit `document_permissions` grant to the subject's company. */
  grant?: { can_view: boolean; can_download: boolean; expires_at: string | null } | null
  now?: Date
}

function grantIsLive(ctx: DocumentAccessContext): boolean {
  const grant = ctx.grant
  if (!grant) return false
  if (!grant.expires_at) return true
  return new Date(grant.expires_at).getTime() > (ctx.now ?? new Date()).getTime()
}

export function canViewDocument(
  subject: PolicySubject,
  document: DocumentRecord,
  deal: Deal,
  ctx: DocumentAccessContext = {},
): boolean {
  if (document.deleted_at) return subject.isAdmin
  if (subject.isAdmin) return true
  if (document.company_id === subject.companyId) return true
  if (subject.companyType !== 'lender') return false
  // Restricted documents never leave the borrower's organisation, regardless
  // of distribution — this is the switch a borrower uses for anything they are
  // not willing to put in front of a lender.
  if (document.visibility === 'restricted') return false
  if (grantIsLive(ctx) && ctx.grant!.can_view) return true
  if (document.visibility !== 'distributed_lenders') return false
  // Marketplace discovery alone is never enough to reach a document.
  return hasLiveDistribution(subject, deal, ctx)
}

export function canDownloadDocument(
  subject: PolicySubject,
  document: DocumentRecord,
  deal: Deal,
  ctx: DocumentAccessContext = {},
): boolean {
  if (!canViewDocument(subject, document, deal, ctx)) return false
  if (subject.isAdmin || document.company_id === subject.companyId) return true
  if (grantIsLive(ctx) && !ctx.grant!.can_download) return false
  return true
}

export function canUploadDocument(subject: PolicySubject, deal: Deal): boolean {
  return canEditDeal(subject, deal)
}

export function canDeleteDocument(subject: PolicySubject, document: DocumentRecord): boolean {
  if (subject.isAdmin) return true
  if (subject.memberRole === 'viewer') return false
  return document.company_id === subject.companyId
}

// ---------------------------------------------------------------------------
// Lender-private data
// ---------------------------------------------------------------------------

/**
 * Internal lender notes are visible only inside the authoring lender
 * organisation. Borrowers and competing lenders never see them, and admins are
 * deliberately excluded so the notes stay genuinely private.
 */
export function canViewLenderNote(subject: PolicySubject, note: LenderNote): boolean {
  return subject.companyType === 'lender' && subject.lenderId !== null && note.lender_id === subject.lenderId
}

export function canEditLenderNote(subject: PolicySubject, note: LenderNote): boolean {
  return canViewLenderNote(subject, note) && subject.memberRole !== 'viewer'
}

export function canSubmitIndication(subject: PolicySubject, deal: Deal, ctx: DealAccessContext = {}): boolean {
  if (subject.companyType !== 'lender' || subject.lenderId === null) return false
  if (subject.memberRole === 'viewer') return false
  if (!hasLiveDistribution(subject, deal, ctx)) return false
  return !(['funded', 'withdrawn', 'rejected', 'archived'] as Deal['status'][]).includes(deal.status)
}

/**
 * Indication terms are visible to the borrower and to the lender that
 * submitted them — never to a competing lender.
 */
export function canViewIndication(subject: PolicySubject, indication: Indication, deal: Deal): boolean {
  if (subject.isAdmin) return true
  if (ownsDeal(subject, deal)) return true
  return subject.companyType === 'lender' && indication.lender_id === subject.lenderId
}

export function canEditIndication(subject: PolicySubject, indication: Indication): boolean {
  if (subject.memberRole === 'viewer') return false
  return subject.companyType === 'lender' && indication.lender_id === subject.lenderId
}

export function canSelectIndication(subject: PolicySubject, deal: Deal): boolean {
  return ownsDeal(subject, deal) && subject.memberRole !== 'viewer'
}

// ---------------------------------------------------------------------------
// Messaging
// ---------------------------------------------------------------------------

export function canViewThread(subject: PolicySubject, thread: MessageThread, deal: Deal): boolean {
  if (subject.isAdmin) return true
  if (ownsDeal(subject, deal)) return thread.kind !== 'admin' || subject.isAdmin
  return thread.participant_company_ids.includes(subject.companyId)
}

export function canPostToThread(subject: PolicySubject, thread: MessageThread, deal: Deal): boolean {
  if (subject.memberRole === 'viewer') return false
  return canViewThread(subject, thread, deal)
}

// ---------------------------------------------------------------------------
// Administration
// ---------------------------------------------------------------------------

export function canVerifyLenders(subject: PolicySubject): boolean {
  return subject.isAdmin
}

export function canViewAuditLog(subject: PolicySubject, log: { actor_company_id: string | null }): boolean {
  if (subject.isAdmin) return true
  return log.actor_company_id === subject.companyId
}

export function canManageCompany(subject: PolicySubject, companyId: string): boolean {
  if (subject.isAdmin) return true
  return subject.companyId === companyId && (subject.memberRole === 'owner' || subject.memberRole === 'admin')
}

/** Only verified lenders reach distributed opportunities or the marketplace. */
export function lenderIsEligible(verification: string): boolean {
  return verification === 'verified'
}

export class ForbiddenError extends Error {
  readonly status = 403
  constructor(message = 'You do not have access to this resource.') {
    super(message)
    this.name = 'ForbiddenError'
  }
}

/** Throws unless the condition holds. Keeps call sites to a single line. */
export function authorize(allowed: boolean, message?: string): void {
  if (!allowed) throw new ForbiddenError(message)
}
