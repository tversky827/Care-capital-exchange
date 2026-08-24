import 'server-only'
import { db } from '@/db'
import { recordAudit } from './audit'
import type { Actor } from '@/lib/auth/session'
import type { BillingEvent, Subscription } from '@/types'

/**
 * Billing.
 *
 * Plans and fees are configuration, not code: the platform can run a
 * subscription model, a transaction-fee model, a success-fee model, or a
 * combination, without a schema change. No pricing is hard-coded into any
 * business logic — everything reads `PLAN_CATALOG` and `FEE_SCHEDULE`.
 *
 * The provider interface is Stripe-shaped, with a development implementation
 * that records the same events locally so the rest of the product is
 * exercisable without payment credentials.
 */

export type PlanAudience = 'borrower' | 'lender'

export interface Plan {
  key: string
  name: string
  audience: PlanAudience
  monthlyUsd: number | null
  annualUsd: number | null
  seats: number
  features: string[]
  highlight?: boolean
}

export const PLAN_CATALOG: Plan[] = [
  {
    key: 'borrower_standard',
    name: 'Borrower',
    audience: 'borrower',
    monthlyUsd: 0,
    annualUsd: 0,
    seats: 3,
    features: [
      'Unlimited deal submissions',
      'AI document extraction and reconciliation',
      'Deterministic underwriting metrics',
      'Lender matching and distribution',
      'Financing indication comparison',
      'Secure data room',
    ],
  },
  {
    key: 'borrower_pro',
    name: 'Borrower Pro',
    audience: 'borrower',
    monthlyUsd: 750,
    annualUsd: 7_500,
    seats: 10,
    highlight: true,
    features: [
      'Everything in Borrower',
      'Priority underwriting review',
      'Institutional credit memo with source citations',
      'Custom lender targeting',
      'Portfolio analytics across facilities',
      'Named transaction support',
    ],
  },
  {
    key: 'lender_professional',
    name: 'Lender Professional',
    audience: 'lender',
    monthlyUsd: 1_200,
    annualUsd: 12_000,
    seats: 5,
    features: [
      'Matched opportunity flow inside your lending box',
      'Full marketplace access',
      'Standardised financing packages and credit memos',
      'Pipeline management and internal notes',
      'Deal alerts and saved searches',
    ],
  },
  {
    key: 'lender_enterprise',
    name: 'Lender Enterprise',
    audience: 'lender',
    monthlyUsd: null,
    annualUsd: null,
    seats: 50,
    features: [
      'Everything in Lender Professional',
      'Multiple lending boxes by team or region',
      'API access for pipeline and indications',
      'SSO and advanced access controls',
      'Custom reporting and benchmarking',
    ],
  },
]

export interface FeeRule {
  key: string
  label: string
  /** Basis points of the funded loan amount. */
  basisPoints: number
  appliesTo: PlanAudience
  capUsd: number | null
}

export const FEE_SCHEDULE: FeeRule[] = [
  { key: 'borrower_success_fee', label: 'Borrower success fee on funded capital', basisPoints: 50, appliesTo: 'borrower', capUsd: 75_000 },
  { key: 'lender_transaction_fee', label: 'Lender transaction fee on funded capital', basisPoints: 25, appliesTo: 'lender', capUsd: 50_000 },
]

export function planByKey(key: string): Plan | undefined {
  return PLAN_CATALOG.find((plan) => plan.key === key)
}

export function computeFee(ruleKey: string, fundedAmount: number): number {
  const rule = FEE_SCHEDULE.find((r) => r.key === ruleKey)
  if (!rule) return 0
  const raw = (fundedAmount * rule.basisPoints) / 10_000
  return Math.round((rule.capUsd === null ? raw : Math.min(raw, rule.capUsd)) * 100) / 100
}

export interface CheckoutSession {
  url: string | null
  externalId: string
  provider: string
}

export interface BillingProvider {
  readonly name: string
  createCheckout(companyId: string, planKey: string, seats: number): Promise<CheckoutSession>
  cancel(subscriptionId: string): Promise<void>
}

/** Development provider: records the subscription without taking payment. */
class LocalBillingProvider implements BillingProvider {
  readonly name = 'local'
  async createCheckout(companyId: string, planKey: string): Promise<CheckoutSession> {
    return { url: null, externalId: `local_${companyId}_${planKey}`, provider: this.name }
  }
  async cancel(): Promise<void> {}
}

let provider: BillingProvider = new LocalBillingProvider()

export function setBillingProvider(next: BillingProvider): void {
  provider = next
}

export function getBillingProvider(): BillingProvider {
  return provider
}

export async function startSubscription(actor: Actor, planKey: string, seats?: number): Promise<Subscription> {
  const plan = planByKey(planKey)
  if (!plan) throw new Error(`Unknown plan: ${planKey}`)

  const store = await db()
  const checkout = await provider.createCheckout(actor.company.id, planKey, seats ?? plan.seats)
  const existing = await store.selectOne('subscriptions', { where: { company_id: actor.company.id } })

  const periodEnd = new Date()
  periodEnd.setUTCMonth(periodEnd.getUTCMonth() + 1)

  const payload = {
    plan_key: planKey,
    status: 'active' as const,
    seats: seats ?? plan.seats,
    current_period_end: periodEnd.toISOString(),
    external_id: checkout.externalId,
  }

  const subscription = existing
    ? await store.update('subscriptions', existing.id, payload)
    : await store.insert('subscriptions', { company_id: actor.company.id, ...payload } as Omit<Subscription, 'id' | 'created_at' | 'updated_at'>)

  await store.insert('billing_events', {
    company_id: actor.company.id,
    deal_id: null,
    kind: 'subscription_created',
    amount_usd: plan.monthlyUsd ?? 0,
    description: `${plan.name} subscription started (${payload.seats} seats).`,
    external_id: checkout.externalId,
    metadata: { planKey, provider: checkout.provider },
  } as Omit<BillingEvent, 'id' | 'created_at'>)

  await recordAudit({
    actor,
    action: 'billing.subscription_started',
    entityType: 'subscription',
    entityId: subscription.id,
    summary: `${actor.company.name} started the ${plan.name} plan.`,
    metadata: { planKey, seats: payload.seats, provider: checkout.provider },
  })

  return subscription
}

/** Records the fee due when a deal funds. Charging is the provider's job. */
export async function recordFundingFees(dealId: string, fundedAmount: number): Promise<BillingEvent[]> {
  const store = await db()
  const deal = await store.findById('deals', dealId)
  if (!deal) return []

  const events: BillingEvent[] = []
  const borrowerFee = computeFee('borrower_success_fee', fundedAmount)
  if (borrowerFee > 0) {
    events.push(
      await store.insert('billing_events', {
        company_id: deal.company_id,
        deal_id: dealId,
        kind: 'success_fee',
        amount_usd: borrowerFee,
        description: `Success fee on ${(fundedAmount / 1_000_000).toFixed(2)}M of funded capital.`,
        external_id: null,
        metadata: { fundedAmount, ruleKey: 'borrower_success_fee' },
      } as Omit<BillingEvent, 'id' | 'created_at'>),
    )
  }

  const selected = await store.selectOne('indications', { where: { deal_id: dealId, status: 'selected' } })
  if (selected) {
    const lender = await store.findById('lenders', selected.lender_id)
    const lenderFee = computeFee('lender_transaction_fee', fundedAmount)
    if (lender && lenderFee > 0) {
      events.push(
        await store.insert('billing_events', {
          company_id: lender.company_id,
          deal_id: dealId,
          kind: 'transaction_fee',
          amount_usd: lenderFee,
          description: `Transaction fee on ${(fundedAmount / 1_000_000).toFixed(2)}M funded.`,
          external_id: null,
          metadata: { fundedAmount, ruleKey: 'lender_transaction_fee' },
        } as Omit<BillingEvent, 'id' | 'created_at'>),
      )
    }
  }
  return events
}

export async function subscriptionFor(companyId: string): Promise<Subscription | null> {
  const store = await db()
  return store.selectOne('subscriptions', { where: { company_id: companyId } })
}

export async function billingHistory(companyId: string): Promise<BillingEvent[]> {
  const store = await db()
  return store.select('billing_events', {
    where: { company_id: companyId },
    orderBy: { field: 'created_at', dir: 'desc' },
  })
}
