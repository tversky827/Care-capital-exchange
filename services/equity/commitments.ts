import 'server-only'
import { db } from '@/db'
import { subjectOf } from '@/lib/access'
import { authorize, canViewOffering, isInvestorSubject } from '@/lib/policy'
import { isAvailable } from '@/lib/flags'
import { checkAmount, checkEligibility, type EligibilityResult } from '@/lib/equity/eligibility'
import { ownershipShare } from '@/lib/equity/returns'
import { recordAudit } from '../audit'
import { notify } from '../notifications'
import { requireOffering } from './offerings'
import { requireOwnProfile } from './investors'
import { getTransactionService } from './providers'
import type { Actor } from '@/lib/auth/session'
import type {
  DisclosureAcknowledgement, InvestmentCommitment, InvestmentInterest, InvestmentPosition,
  InvestmentStage, InvestmentTransaction, Offering,
} from '@/types/equity'

/**
 * The path from interest to a recorded commitment.
 *
 * This is the most consequential file in the equity product, and the most
 * constrained. Three rules govern all of it.
 *
 * Eligibility is re-checked at every transition, from the database, on the
 * server. A client that posts a later stage does not reach it; a URL that
 * skips a step does not work. The check is not a view concern.
 *
 * A commitment is not a securities transaction. It is a recorded intention.
 * It becomes a transaction only where a provider is configured *and*
 * INVESTMENT_TRANSACTIONS_ENABLED is on, and even then the provider does the
 * transacting. Nothing here moves money.
 *
 * Disclosures are acknowledged before a commitment is submitted, at the
 * version then current, and the acknowledgement is written append-only.
 */

/** Loads or opens an investor's engagement with an offering. */
export async function recordInterest(
  actor: Actor,
  offeringId: string,
  input: { indicatedAmount?: number | null; notes?: string | null } = {},
): Promise<InvestmentInterest> {
  authorize(isInvestorSubject(subjectOf(actor)), 'Only an investor account can express interest.')
  const profile = await requireOwnProfile(actor)
  const offering = await requireOffering(offeringId)
  authorize(canViewOffering(subjectOf(actor), offering), 'This offering is not available to you.')
  authorize(offering.status === 'live', 'This offering is not currently open.')

  const store = await db()
  const existing = await store.selectOne('investment_interests', {
    where: { offering_id: offeringId, investor_id: profile.id },
  })
  const now = new Date().toISOString()

  if (existing) {
    const updated = await store.update('investment_interests', existing.id, {
      indicated_amount: input.indicatedAmount ?? existing.indicated_amount,
      notes: input.notes ?? existing.notes,
      expressed_at: existing.expressed_at ?? now,
      // Re-expressing interest after withdrawing reopens the engagement.
      stage: existing.stage === 'withdrawn' ? 'interested' : existing.stage,
      withdrawn_at: existing.stage === 'withdrawn' ? null : existing.withdrawn_at,
    } as Partial<InvestmentInterest>)
    return updated
  }

  const interest = await store.insert('investment_interests', {
    offering_id: offeringId,
    investor_id: profile.id,
    deal_id: offering.deal_id,
    stage: 'interested',
    indicated_amount: input.indicatedAmount ?? null,
    notes: input.notes ?? null,
    first_viewed_at: now,
    expressed_at: now,
    withdrawn_at: null,
  } as Omit<InvestmentInterest, 'id' | 'created_at' | 'updated_at'>)

  await recordAudit({
    actor, action: 'investment.interest_expressed', entityType: 'offering', entityId: offeringId,
    dealId: offering.deal_id, summary: `An investor expressed interest in ${offering.reference}.`,
  })
  await notify({
    event: 'investment.status_changed',
    companyId: offering.company_id,
    title: `New investor interest in ${offering.name}`,
    body: 'An investor has expressed interest in your offering.',
    href: `/deals/${offering.deal_id}/equity`,
    dealId: offering.deal_id,
  })
  return interest
}

/** Records that an investor has opened an offering, without implying interest. */
export async function recordView(actor: Actor, offeringId: string): Promise<void> {
  if (!actor.investor) return
  const store = await db()
  const existing = await store.selectOne('investment_interests', {
    where: { offering_id: offeringId, investor_id: actor.investor.id },
  })
  if (existing?.first_viewed_at) return
  const offering = await store.findById('offerings', offeringId)
  if (!offering) return
  if (existing) {
    await store.update('investment_interests', existing.id, {
      first_viewed_at: new Date().toISOString(),
    } as Partial<InvestmentInterest>)
  }
}

/**
 * Runs the eligibility check for the acting investor against an offering.
 *
 * Reads everything it needs from the database rather than trusting a caller,
 * because this result decides whether a commitment may be made at all.
 */
export async function evaluateEligibility(
  actor: Actor,
  offeringId: string,
): Promise<EligibilityResult> {
  const profile = await requireOwnProfile(actor)
  const store = await db()
  const offering = await requireOffering(offeringId)

  const [eligibility, verifications, disclosures, acknowledgements, commitments] = await Promise.all([
    store.selectOne('offering_eligibility', { where: { offering_id: offeringId } }),
    store.select('investor_verifications', { where: { investor_id: profile.id } }),
    store.select('offering_disclosures', { where: { offering_id: offeringId } }),
    store.select('disclosure_acknowledgements', {
      where: { offering_id: offeringId, investor_id: profile.id },
    }),
    store.select('investment_commitments', {
      where: { offering_id: offeringId, investor_id: profile.id },
    }),
  ])

  // A disclosure is acknowledged only at its current version. Bumping a
  // version is what forces investors to read a material change.
  const required = disclosures.filter((d) => d.required)
  const acknowledged = required.every((disclosure) =>
    acknowledgements.some((a) =>
      a.disclosure_id === disclosure.id && a.disclosure_version === disclosure.version))

  const committedToDate = commitments
    .filter((c) => ['submitted', 'accepted', 'funded'].includes(c.status))
    .reduce((total, c) => total + c.amount, 0)

  const result = checkEligibility({
    offering,
    eligibility,
    investor: profile,
    verifications,
    committedToDate,
    disclosuresAcknowledged: required.length === 0 ? true : acknowledged,
  })

  await advanceStage(profile.id, offeringId, 'eligibility_check')
  return result
}

/**
 * Records an investor's acknowledgement of a disclosure.
 *
 * Append-only and versioned: the row states which words, at which version, on
 * which date. That is the entire point of the record, so nothing updates it.
 */
export async function acknowledgeDisclosures(
  actor: Actor,
  offeringId: string,
  disclosureIds: string[],
  context: { ip?: string | null; userAgent?: string | null } = {},
): Promise<DisclosureAcknowledgement[]> {
  const profile = await requireOwnProfile(actor)
  const store = await db()
  const offering = await requireOffering(offeringId)
  const disclosures = await store.select('offering_disclosures', { where: { offering_id: offeringId } })

  const written: DisclosureAcknowledgement[] = []
  for (const id of disclosureIds) {
    const disclosure = disclosures.find((d) => d.id === id)
    if (!disclosure) continue
    const already = await store.selectOne('disclosure_acknowledgements', {
      where: {
        offering_id: offeringId, investor_id: profile.id,
        disclosure_id: id, disclosure_version: disclosure.version,
      },
    })
    if (already) { written.push(already); continue }

    written.push(await store.insert('disclosure_acknowledgements', {
      offering_id: offeringId,
      disclosure_id: id,
      investor_id: profile.id,
      user_id: actor.user.id,
      disclosure_version: disclosure.version,
      acknowledged_at: new Date().toISOString(),
      ip_address: context.ip ?? null,
      user_agent: context.userAgent ?? null,
    } as Omit<DisclosureAcknowledgement, 'id' | 'created_at'>))
  }

  await recordAudit({
    actor, action: 'investment.disclosures_acknowledged', entityType: 'offering', entityId: offeringId,
    dealId: offering.deal_id,
    summary: `An investor acknowledged ${written.length} disclosure${written.length === 1 ? '' : 's'} on ${offering.reference}.`,
  })
  await advanceStage(profile.id, offeringId, 'reviewing_documents')
  return written
}

/**
 * Records a commitment.
 *
 * Every gate is re-checked here even though the UI checked them already: this
 * function is reachable by anything that can call a server action, and it is
 * the last place where "no" can still be said.
 */
export async function submitCommitment(
  actor: Actor,
  offeringId: string,
  amount: number,
): Promise<InvestmentCommitment> {
  authorize(isAvailable('INVESTMENT_COMMITMENTS_ENABLED'), 'Investment commitments are not enabled.')
  const profile = await requireOwnProfile(actor)
  const store = await db()
  const offering = await requireOffering(offeringId)

  const eligibility = await evaluateEligibility(actor, offeringId)
  authorize(
    eligibility.verdict === 'eligible',
    eligibility.verdict === 'needs_information'
      ? 'Some steps remain before you can commit to this offering.'
      : eligibility.summary,
  )

  const amountCheck = checkAmount(amount, eligibility)
  authorize(amountCheck.ok, amountCheck.error ?? 'That amount cannot be committed.')

  const interest = await store.selectOne('investment_interests', {
    where: { offering_id: offeringId, investor_id: profile.id },
  })
  if (!interest) throw new Error('Express interest in this offering before committing.')

  const acknowledgements = await store.select('disclosure_acknowledgements', {
    where: { offering_id: offeringId, investor_id: profile.id },
  })

  const commitment = await store.insert('investment_commitments', {
    offering_id: offeringId,
    investor_id: profile.id,
    interest_id: interest.id,
    amount,
    status: 'submitted',
    acknowledged_disclosures: acknowledgements.map((a) => a.disclosure_id),
    submitted_at: new Date().toISOString(),
    accepted_at: null,
    accepted_by: null,
    rejected_reason: null,
  } as Omit<InvestmentCommitment, 'id' | 'created_at' | 'updated_at'>)

  await advanceStage(profile.id, offeringId, 'commitment_submitted')

  // Hand the commitment to whoever is permitted to process it. With
  // transactions disabled this records the handoff and stops, which is the
  // correct behaviour for a platform that is not a broker-dealer.
  if (isAvailable('INVESTMENT_TRANSACTIONS_ENABLED')) {
    await startTransaction(actor, commitment)
  }

  await recordAudit({
    actor, action: 'investment.commitment_submitted', entityType: 'offering', entityId: offeringId,
    dealId: offering.deal_id,
    summary: `An investor submitted a commitment of ${money(amount)} to ${offering.reference}.`,
  })
  await notify({
    event: 'investment.status_changed',
    companyId: offering.company_id,
    title: `New commitment in ${offering.name}`,
    body: `A commitment of ${money(amount)} has been submitted.`,
    href: `/deals/${offering.deal_id}/equity`,
    dealId: offering.deal_id,
  })
  return commitment
}

/**
 * Accepts a commitment, which is the sponsor's decision, and opens the
 * investor's position.
 *
 * The position records what was actually committed. Where transactions are not
 * live it is explicitly a demonstration position: no security changed hands.
 */
export async function acceptCommitment(
  actor: Actor,
  commitmentId: string,
): Promise<InvestmentPosition> {
  const store = await db()
  const commitment = await store.findById('investment_commitments', commitmentId)
  if (!commitment) throw new Error('Commitment not found.')
  const offering = await requireOffering(commitment.offering_id)
  authorize(
    offering.company_id === actor.company.id || actor.isAdmin,
    'Only the sponsor can accept a commitment in this offering.',
  )
  authorize(commitment.status === 'submitted', 'This commitment is not awaiting acceptance.')

  const now = new Date().toISOString()
  await store.update('investment_commitments', commitmentId, {
    status: 'accepted', accepted_at: now, accepted_by: actor.user.id,
  } as Partial<InvestmentCommitment>)

  // The raise total is maintained from accepted commitments, never typed in.
  const accepted = await store.select('investment_commitments', {
    where: { offering_id: offering.id },
  })
  const committed = accepted
    .filter((c) => ['accepted', 'funded'].includes(c.status))
    .reduce((total, c) => total + c.amount, 0)
  await store.update('offerings', offering.id, { committed_amount: committed } as Partial<Offering>)

  const existingPosition = await store.selectOne('investment_positions', {
    where: { offering_id: offering.id, investor_id: commitment.investor_id },
  })
  const position = existingPosition
    ? await store.update('investment_positions', existingPosition.id, {
      invested_amount: existingPosition.invested_amount + commitment.amount,
      ownership_pct: ownershipShare(existingPosition.invested_amount + commitment.amount, offering.target_raise),
    } as Partial<InvestmentPosition>)
    : await store.insert('investment_positions', {
      offering_id: offering.id,
      investor_id: commitment.investor_id,
      deal_id: offering.deal_id,
      invested_amount: commitment.amount,
      ownership_pct: ownershipShare(commitment.amount, offering.target_raise),
      capital_position: 'common_equity',
      estimated_value: commitment.amount,
      estimated_value_at: now,
      distributions_received: 0,
      status: 'active',
      acquired_at: now,
      exited_at: null,
    } as Omit<InvestmentPosition, 'id' | 'created_at' | 'updated_at'>)

  await advanceStage(commitment.investor_id, offering.id, 'invested')

  // A raise that reaches its target closes itself rather than over-subscribing.
  if (offering.target_raise !== null && committed >= offering.target_raise) {
    await store.update('offerings', offering.id, { status: 'fully_subscribed' } as Partial<Offering>)
  }

  const profile = await store.findById('investor_profiles', commitment.investor_id)
  if (profile) {
    await notify({
      event: 'investment.status_changed',
      companyId: profile.company_id,
      title: `Your commitment to ${offering.name} was accepted`,
      body: `${money(commitment.amount)} has been recorded against this offering.`,
      href: `/investor/portfolio`,
      dealId: offering.deal_id,
    })
  }

  await recordAudit({
    actor, action: 'investment.commitment_accepted', entityType: 'offering', entityId: offering.id,
    dealId: offering.deal_id,
    summary: `A commitment of ${money(commitment.amount)} was accepted in ${offering.reference}.`,
  })
  return position
}

export async function withdrawInterest(actor: Actor, offeringId: string): Promise<void> {
  const profile = await requireOwnProfile(actor)
  const store = await db()
  const interest = await store.selectOne('investment_interests', {
    where: { offering_id: offeringId, investor_id: profile.id },
  })
  if (!interest) return
  await store.update('investment_interests', interest.id, {
    stage: 'withdrawn', withdrawn_at: new Date().toISOString(),
  } as Partial<InvestmentInterest>)
  await recordAudit({
    actor, action: 'investment.interest_withdrawn', entityType: 'offering', entityId: offeringId,
    summary: 'An investor withdrew interest in an offering.',
  })
}

/**
 * Hands a commitment to the configured transaction provider.
 *
 * Kept separate and small so the boundary is obvious: everything before this
 * is CareCapital recording intentions, everything after is a regulated firm
 * doing what only it may do.
 */
async function startTransaction(
  actor: Actor,
  commitment: InvestmentCommitment,
): Promise<InvestmentTransaction> {
  const store = await db()
  const service = getTransactionService()
  const request = {
    commitmentId: commitment.id,
    offeringId: commitment.offering_id,
    investorId: commitment.investor_id,
    amount: commitment.amount,
  }
  const eligibility = await service.checkEligibility(request)
  const record = eligibility.eligible
    ? await service.submitCommitment(request)
    : { provider: service.name, providerReference: null, status: 'failed' as const, detail: eligibility.reason }

  const transaction = await store.insert('investment_transactions', {
    commitment_id: commitment.id,
    offering_id: commitment.offering_id,
    investor_id: commitment.investor_id,
    provider: record.provider,
    provider_reference: record.providerReference,
    status: record.status,
    amount: commitment.amount,
    settled_at: record.status === 'settled' ? new Date().toISOString() : null,
    failure_reason: record.status === 'failed' ? record.detail : null,
  } as Omit<InvestmentTransaction, 'id' | 'created_at' | 'updated_at'>)

  await recordAudit({
    actor, action: 'investment.transaction_started', entityType: 'offering', entityId: commitment.offering_id,
    summary: `Commitment handed to ${record.provider}; status ${record.status}.`,
  })
  return transaction
}

/** Moves an engagement forward, never backward. */
async function advanceStage(
  investorId: string,
  offeringId: string,
  stage: InvestmentStage,
): Promise<void> {
  const store = await db()
  const interest = await store.selectOne('investment_interests', {
    where: { offering_id: offeringId, investor_id: investorId },
  })
  if (!interest) return
  const order: InvestmentStage[] = [
    'interested', 'eligibility_check', 'reviewing_documents', 'application',
    'commitment_pending', 'commitment_submitted', 'investment_pending', 'invested',
  ]
  const current = order.indexOf(interest.stage)
  const next = order.indexOf(stage)
  if (current === -1 || next === -1 || next <= current) return
  await store.update('investment_interests', interest.id, { stage } as Partial<InvestmentInterest>)
}

function money(value: number): string {
  return value.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })
}
