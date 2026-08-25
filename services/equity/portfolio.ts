import 'server-only'
import { db } from '@/db'
import { subjectOf } from '@/lib/access'
import { authorize, canAnswerQuestion, canViewQuestion } from '@/lib/policy'
import { equityMultiple, irr, type CashFlow } from '@/lib/equity/returns'
import { round } from '@/lib/finance/calculations'
import { recordAudit } from '../audit'
import { notify } from '../notifications'
import { requireOffering } from './offerings'
import { requireOwnProfile } from './investors'
import type { Actor } from '@/lib/auth/session'
import type { Deal, Facility } from '@/types'
import type {
  InvestmentDistribution, InvestmentPosition, InvestorAnswer, InvestorQuestion, Offering,
} from '@/types/equity'

/**
 * An investor's holdings.
 *
 * Two kinds of number appear here and the difference is load-bearing.
 * Contributed capital and distributions received are facts — they are what
 * happened. Estimated value is the sponsor's opinion of what a position is
 * worth today, and portfolio return computed from it is an estimate resting on
 * that opinion. Every function below keeps the two apart, and the screens are
 * required to label them differently.
 */

export interface PortfolioPosition {
  position: InvestmentPosition
  offering: Offering
  deal: Deal
  facility: Facility | null
  distributions: InvestmentDistribution[]
  /** Distributions actually received. A fact. */
  distributionsReceived: number
  /** Realised multiple on cash received. A fact. */
  realizedMultiple: number | null
  /** Multiple including the sponsor's current estimate of value. An estimate. */
  estimatedMultiple: number | null
}

export interface PortfolioSummary {
  positions: PortfolioPosition[]
  capitalInvested: number
  capitalCommitted: number
  distributionsReceived: number
  estimatedValue: number
  activeCount: number
  pendingCount: number
  /**
   * Return computed from actual contribution and distribution dates, with the
   * current estimated value as a terminal flow. Null when there is not enough
   * history to solve one.
   */
  estimatedIrrPct: number | null
  realizedMultiple: number | null
  /** Concentration, for the allocation charts. */
  byAssetType: { label: string; amount: number }[]
  byState: { label: string; amount: number }[]
  bySponsor: { label: string; amount: number }[]
}

export async function portfolioFor(actor: Actor): Promise<PortfolioSummary> {
  const profile = await requireOwnProfile(actor)
  const store = await db()

  const [positions, commitments] = await Promise.all([
    store.select('investment_positions', { where: { investor_id: profile.id } }),
    store.select('investment_commitments', { where: { investor_id: profile.id } }),
  ])

  const rows: PortfolioPosition[] = []
  const flows: CashFlow[] = []
  let capitalInvested = 0
  let distributionsReceived = 0
  let estimatedValue = 0

  const byAsset = new Map<string, number>()
  const byState = new Map<string, number>()
  const bySponsor = new Map<string, number>()

  for (const position of positions) {
    const [offering, deal, distributions] = await Promise.all([
      store.findById('offerings', position.offering_id),
      store.findById('deals', position.deal_id),
      store.select('investment_distributions', {
        where: { position_id: position.id, status: 'processed' },
      }),
    ])
    if (!offering || !deal) continue
    const facility = await store.selectOne('facilities', { where: { deal_id: deal.id } })

    const received = round(distributions.reduce((sum, d) => sum + d.amount, 0), 2)
    capitalInvested = round(capitalInvested + position.invested_amount, 2)
    distributionsReceived = round(distributionsReceived + received, 2)
    estimatedValue = round(estimatedValue + (position.estimated_value ?? position.invested_amount), 2)

    // Flows are dated by year from acquisition, which is enough resolution for
    // a portfolio-level estimate and avoids implying daily precision.
    const acquiredYear = new Date(position.acquired_at).getFullYear()
    flows.push({ period: 0, amount: -position.invested_amount })
    for (const distribution of distributions) {
      const year = new Date(distribution.processed_at ?? distribution.created_at).getFullYear()
      flows.push({ period: Math.max(1, year - acquiredYear), amount: distribution.amount })
    }

    const asset = deal.asset_type
    byAsset.set(asset, round((byAsset.get(asset) ?? 0) + position.invested_amount, 2))
    if (facility?.state) {
      byState.set(facility.state, round((byState.get(facility.state) ?? 0) + position.invested_amount, 2))
    }
    const sponsorCompany = await store.findById('companies', offering.company_id)
    if (sponsorCompany) {
      bySponsor.set(sponsorCompany.name, round((bySponsor.get(sponsorCompany.name) ?? 0) + position.invested_amount, 2))
    }

    rows.push({
      position,
      offering,
      deal,
      facility,
      distributions,
      distributionsReceived: received,
      realizedMultiple: equityMultiple(position.invested_amount, received),
      estimatedMultiple: equityMultiple(
        position.invested_amount,
        received + (position.estimated_value ?? 0),
      ),
    })
  }

  // The terminal flow is an estimate, so the rate it produces is too.
  if (flows.length > 0 && estimatedValue > 0) {
    const horizon = Math.max(1, ...flows.map((f) => f.period))
    flows.push({ period: horizon, amount: estimatedValue })
  }

  const committed = commitments
    .filter((c) => ['submitted', 'accepted'].includes(c.status))
    .reduce((sum, c) => sum + c.amount, 0)

  return {
    positions: rows,
    capitalInvested,
    capitalCommitted: round(committed, 2),
    distributionsReceived,
    estimatedValue,
    activeCount: rows.filter((r) => r.position.status === 'active').length,
    pendingCount: commitments.filter((c) => c.status === 'submitted').length,
    estimatedIrrPct: flows.length > 1 ? irr(flows) : null,
    realizedMultiple: equityMultiple(capitalInvested, distributionsReceived),
    byAssetType: [...byAsset.entries()].map(([label, amount]) => ({ label, amount })),
    byState: [...byState.entries()].map(([label, amount]) => ({ label, amount })),
    bySponsor: [...bySponsor.entries()].map(([label, amount]) => ({ label, amount })),
  }
}

// ---------------------------------------------------------------------------
// Questions
// ---------------------------------------------------------------------------

export async function askQuestion(
  actor: Actor,
  offeringId: string,
  body: string,
  visibility: 'private' | 'shared' = 'private',
): Promise<InvestorQuestion> {
  const profile = await requireOwnProfile(actor)
  const store = await db()
  const offering = await requireOffering(offeringId)

  const question = await store.insert('investor_questions', {
    offering_id: offeringId,
    investor_id: profile.id,
    body,
    visibility,
    status: 'open',
  } as Omit<InvestorQuestion, 'id' | 'created_at' | 'updated_at'>)

  await notify({
    event: 'message.received',
    companyId: offering.company_id,
    title: `Investor question on ${offering.name}`,
    body: body.slice(0, 160),
    href: `/deals/${offering.deal_id}/equity`,
    dealId: offering.deal_id,
  })
  await recordAudit({
    actor, action: 'investment.question_asked', entityType: 'offering', entityId: offeringId,
    dealId: offering.deal_id, summary: 'An investor asked a question about this offering.',
  })
  return question
}

export async function answerQuestion(
  actor: Actor,
  questionId: string,
  body: string,
): Promise<InvestorAnswer> {
  const store = await db()
  const question = await store.findById('investor_questions', questionId)
  if (!question) throw new Error('Question not found.')
  const offering = await requireOffering(question.offering_id)
  authorize(canAnswerQuestion(subjectOf(actor), offering), 'You cannot answer questions on this offering.')

  const answer = await store.insert('investor_answers', {
    question_id: questionId,
    offering_id: question.offering_id,
    body,
    answered_by: actor.user.id,
    author_role: actor.isAdmin ? 'admin' : 'sponsor',
  } as Omit<InvestorAnswer, 'id' | 'created_at' | 'updated_at'>)

  await store.update('investor_questions', questionId, { status: 'answered' } as Partial<InvestorQuestion>)

  const profile = await store.findById('investor_profiles', question.investor_id)
  if (profile) {
    await notify({
      event: 'message.received',
      companyId: profile.company_id,
      title: `Answer on ${offering.name}`,
      body: body.slice(0, 160),
      href: `/investments/${offering.id}`,
      dealId: offering.deal_id,
    })
  }
  return answer
}

/** Questions on an offering that this actor is entitled to see. */
export async function questionsFor(
  actor: Actor,
  offeringId: string,
): Promise<{ question: InvestorQuestion; answers: InvestorAnswer[] }[]> {
  const store = await db()
  const offering = await requireOffering(offeringId)
  const questions = await store.select('investor_questions', {
    where: { offering_id: offeringId }, orderBy: { field: 'created_at', dir: 'desc' },
  })

  const subject = subjectOf(actor)
  const rows: { question: InvestorQuestion; answers: InvestorAnswer[] }[] = []
  for (const question of questions) {
    if (!canViewQuestion(subject, question, offering)) continue
    const answers = await store.select('investor_answers', {
      where: { question_id: question.id }, orderBy: { field: 'created_at' },
    })
    rows.push({ question, answers })
  }
  return rows
}
