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
import type {
  InvestmentStage, OfferingAccessLevel, OfferingStatus,
} from '@/types/equity'

/** The subset of an `Actor` that authorization actually depends on. */
export interface PolicySubject {
  userId: string
  companyId: string
  companyType: 'borrower' | 'lender' | 'broker' | 'investor' | 'admin'
  memberRole: 'owner' | 'admin' | 'member' | 'viewer'
  lenderId: string | null
  /** Present only when the actor's company is an investing organisation. */
  investorId: string | null
  isAdmin: boolean
}

export interface DealAccessContext {
  /** The distribution row linking this lender's organisation to the deal, if any. */
  distribution?: DealDistribution | null
  /**
   * True when an offering on this deal has released this document to the
   * viewer's organisation: it is published at or below the access level their
   * engagement has earned, and they have signed the offering's confidentiality
   * agreement.
   *
   * Resolved by the caller rather than here, because it depends on rows this
   * module deliberately cannot read. It arrives already decided, the same way
   * the distribution row does.
   */
  offeringRelease?: boolean
  /**
   * True when the viewer's organisation has signed the confidentiality
   * agreement on an offering against this deal. Resolved by the caller, like
   * the distribution row.
   */
  ndaSigned?: boolean
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
  // An anonymized deal names itself only to someone who has taken on an
  // obligation about it: a lender the operator distributed to, or a viewer who
  // has signed the confidentiality agreement on its raise.
  if (subject.companyType === 'lender') return hasLiveDistribution(subject, deal, ctx)
  if (subject.companyType === 'investor') return ctx.ndaSigned === true
  return false
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
  // Restricted documents never leave the operator's organisation, whatever
  // route a viewer arrived by. This is checked before the offering release so
  // publishing to a data room cannot override it.
  if (document.visibility === 'restricted') return false
  // An investor reaches a document through an offering's data room, never
  // through deal distribution.
  if (subject.companyType === 'investor') return ctx.offeringRelease === true
  if (subject.companyType !== 'lender') return false
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

// ---------------------------------------------------------------------------
// Equity marketplace
// ---------------------------------------------------------------------------

/**
 * Authorization for the equity side.
 *
 * Two rules shape all of it. An investor is a member of the public until an
 * offering is published, and an investor's own dealings are private from every
 * other investor — amounts, identities, questions and positions alike. The
 * sponsor sees its own raise in aggregate and by investor; no investor ever
 * sees another.
 */

function ownsOffering(subject: PolicySubject, offering: OfferingLike): boolean {
  return offering.company_id === subject.companyId
}

/** The subset of an offering the policy layer needs. Keeps callers cheap. */
export interface OfferingLike {
  id: string
  deal_id: string
  company_id: string
  status: OfferingStatus
}

/** Statuses at which an offering is visible to investors at all. */
const INVESTOR_VISIBLE_STATUSES: OfferingStatus[] = [
  'live', 'paused', 'fully_subscribed', 'closed',
]

/**
 * An offering is discoverable once it has been published. Before that it
 * belongs to the sponsor and the reviewers, however complete it looks.
 */
export function isOfferingPublished(offering: OfferingLike): boolean {
  return INVESTOR_VISIBLE_STATUSES.includes(offering.status)
}

export function canViewOffering(subject: PolicySubject, offering: OfferingLike): boolean {
  if (subject.isAdmin) return true
  if (ownsOffering(subject, offering)) return true
  if (subject.companyType !== 'investor') return false
  return isOfferingPublished(offering)
}

/** Only the sponsor that owns the deal, or an administrator, may edit terms. */
export function canEditOffering(subject: PolicySubject, offering: OfferingLike): boolean {
  if (subject.memberRole === 'viewer') return false
  if (subject.isAdmin) return true
  if (!ownsOffering(subject, offering)) return false
  // Once an offering is live its terms are frozen; a change writes a version
  // and goes back through review rather than editing what investors have read.
  return offering.status === 'draft' || offering.status === 'under_review'
}

/**
 * Publication is an administrator's decision, never a sponsor's. The sponsor
 * submits; a reviewer with the compliance picture publishes.
 */
export function canPublishOffering(subject: PolicySubject): boolean {
  return subject.isAdmin
}

export function canReviewOffering(subject: PolicySubject): boolean {
  return subject.isAdmin
}

/**
 * Whether an investor may see a document at a given access level.
 *
 * Access is a ladder: reaching a rung grants everything below it. The rung an
 * investor stands on comes from their engagement with this specific offering,
 * so interest in one offering never opens another's data room.
 */
export function canViewOfferingDocument(
  subject: PolicySubject,
  offering: OfferingLike,
  accessLevel: OfferingAccessLevel,
  stage: InvestmentStage | null,
): boolean {
  if (subject.isAdmin) return true
  if (ownsOffering(subject, offering)) return true
  if (accessLevel === 'admin_only') return false
  if (subject.companyType !== 'investor') return false
  if (!isOfferingPublished(offering)) return false

  const reached = investorAccessLevel(stage)
  return OFFERING_ACCESS_ORDER.indexOf(accessLevel) <= OFFERING_ACCESS_ORDER.indexOf(reached)
}

const OFFERING_ACCESS_ORDER: OfferingAccessLevel[] = [
  'public_teaser', 'verified_investor', 'interested_investor',
  'committed_investor', 'closing_investor', 'admin_only',
]

/** The highest access level an investor's engagement has earned. */
export function investorAccessLevel(stage: InvestmentStage | null): OfferingAccessLevel {
  switch (stage) {
    case null:
    case undefined:
      return 'public_teaser'
    case 'withdrawn':
    case 'declined':
      return 'public_teaser'
    case 'interested':
    case 'eligibility_check':
      return 'verified_investor'
    case 'reviewing_documents':
    case 'application':
      return 'interested_investor'
    case 'commitment_pending':
    case 'commitment_submitted':
      return 'committed_investor'
    case 'investment_pending':
    case 'invested':
      return 'closing_investor'
    default:
      return 'public_teaser'
  }
}

/** An investor's own record: theirs and the platform's, nobody else's. */
export function canViewInvestorRecord(
  subject: PolicySubject,
  record: { investor_id: string },
): boolean {
  if (subject.isAdmin) return true
  return subject.investorId !== null && record.investor_id === subject.investorId
}

/**
 * A sponsor sees who has engaged with its own offering — that is the point of
 * raising capital. It does not see anything about that investor's dealings
 * elsewhere, which is why this takes the offering as well as the record.
 */
export function canViewCommitment(
  subject: PolicySubject,
  commitment: { investor_id: string; offering_id: string },
  offering: OfferingLike,
): boolean {
  if (subject.isAdmin) return true
  if (commitment.offering_id !== offering.id) return false
  if (ownsOffering(subject, offering)) return true
  return canViewInvestorRecord(subject, commitment)
}

/** Only the investor who holds a position, and administrators, may see it. */
export function canViewPosition(
  subject: PolicySubject,
  position: { investor_id: string },
): boolean {
  return canViewInvestorRecord(subject, position)
}

/**
 * A question is visible to its author and the sponsor always; to other
 * investors only when the author chose to share it and a moderator has not
 * pulled it.
 */
export function canViewQuestion(
  subject: PolicySubject,
  question: { investor_id: string; visibility: 'private' | 'shared'; status: string },
  offering: OfferingLike,
): boolean {
  if (subject.isAdmin) return true
  if (ownsOffering(subject, offering)) return true
  if (canViewInvestorRecord(subject, question)) return true
  if (subject.companyType !== 'investor') return false
  return question.visibility === 'shared' && question.status === 'answered'
}

/** Sponsors answer questions on their own offering; administrators moderate. */
export function canAnswerQuestion(subject: PolicySubject, offering: OfferingLike): boolean {
  if (subject.memberRole === 'viewer') return false
  return subject.isAdmin || ownsOffering(subject, offering)
}

/**
 * Whether an actor may act as an investor at all. A borrower browsing the
 * marketplace is not an investor, and must not reach an eligibility check.
 */
export function isInvestorSubject(subject: PolicySubject): boolean {
  return subject.companyType === 'investor' && subject.investorId !== null
}

/** The capital stack belongs to the deal, and follows the deal's own rules. */
export function canViewCapitalStack(subject: PolicySubject, deal: Deal): boolean {
  return canViewDeal(subject, deal)
}

export function canEditCapitalStack(subject: PolicySubject, deal: Deal): boolean {
  return canEditDeal(subject, deal)
}
