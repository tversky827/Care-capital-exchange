import 'server-only'
import { db } from '@/db'
import type { BillingEvent } from '@/types'

/**
 * Billing.
 *
 * The platform charges on outcomes only: a fee when capital actually funds,
 * and nothing otherwise. There is no subscription, no seat count and no
 * monthly minimum — an operator can put a raise up and take it all the way to
 * a commitment without being charged, and an investor is never charged at all.
 *
 * Fees are configuration, not code. No pricing is hard-coded into any business
 * logic; everything reads `FEE_SCHEDULE`, so the rate can change without a
 * schema change or a deployment that touches logic.
 *
 * The provider interface is Stripe-shaped, with a development implementation
 * that records the same events locally so the rest of the product is
 * exercisable without payment credentials.
 */

/** Who a fee falls on. Investors are never charged. */
export type FeePayer = 'sponsor' | 'lender'

export interface FeeRule {
  key: string
  label: string
  /** What the fee is taken against, in plain words. */
  basis: string
  /** Basis points of the funded amount. 100 bp = 1%. */
  basisPoints: number
  appliesTo: FeePayer
  capUsd: number | null
  detail: string
}

export const FEE_SCHEDULE: FeeRule[] = [
  {
    key: 'sponsor_success_fee',
    label: 'Success fee on capital raised',
    basis: 'equity that actually funds',
    basisPoints: 200,
    appliesTo: 'sponsor',
    capUsd: null,
    detail:
      'Charged to the operator when a raise closes, on the capital that funded. Nothing is charged on a raise that does not close, and nothing is charged while it is open.',
  },
  {
    // Kept for the debt marketplace, which is off by default. It is listed
    // here rather than deleted so turning that product back on does not
    // require rediscovering what it charged.
    key: 'lender_transaction_fee',
    label: 'Lender transaction fee on funded debt',
    basis: 'debt that actually funds',
    basisPoints: 25,
    appliesTo: 'lender',
    capUsd: 50_000,
    detail: 'Applies only where the debt marketplace is switched on.',
  },
]

export function computeFee(ruleKey: string, fundedAmount: number): number {
  const rule = FEE_SCHEDULE.find((r) => r.key === ruleKey)
  if (!rule) return 0
  const raw = (fundedAmount * rule.basisPoints) / 10_000
  return Math.round((rule.capUsd === null ? raw : Math.min(raw, rule.capUsd)) * 100) / 100
}

export interface BillingProvider {
  readonly name: string
  /** Raises an invoice for a fee that has already been earned. */
  invoice(companyId: string, amountUsd: number, description: string): Promise<{ externalId: string }>
}

/** Development provider: records the fee without taking payment. */
class LocalBillingProvider implements BillingProvider {
  readonly name = 'local'
  async invoice(companyId: string): Promise<{ externalId: string }> {
    return { externalId: `local_${companyId}` }
  }
}

let provider: BillingProvider = new LocalBillingProvider()

export function setBillingProvider(next: BillingProvider): void {
  provider = next
}

export function getBillingProvider(): BillingProvider {
  return provider
}

/**
 * Records the fee due when a raise closes.
 *
 * Called once, when an offering moves to closed, against the capital that
 * actually funded — not the target, and not what was committed but never
 * accepted. Recording it is all this does: charging is the provider's job, and
 * on a raise that funded nothing there is nothing to record.
 */
export async function recordRaiseFee(
  offeringId: string,
  companyId: string,
  dealId: string,
  fundedAmount: number,
): Promise<BillingEvent | null> {
  const fee = computeFee('sponsor_success_fee', fundedAmount)
  if (fee <= 0) return null

  const store = await db()
  // A raise closes once. A second event for the same offering would be a
  // second invoice for the same capital.
  const existing = await store.select('billing_events', { where: { company_id: companyId } })
  if (existing.some((event) => event.metadata?.offeringId === offeringId)) return null

  return store.insert('billing_events', {
    company_id: companyId,
    deal_id: dealId,
    kind: 'success_fee',
    amount_usd: fee,
    description: `Success fee on ${formatMillions(fundedAmount)} of equity raised.`,
    external_id: null,
    metadata: { offeringId, fundedAmount, ruleKey: 'sponsor_success_fee' },
  } as Omit<BillingEvent, 'id' | 'created_at'>)
}

function formatMillions(amount: number): string {
  return amount >= 1_000_000
    ? `$${(amount / 1_000_000).toFixed(2)}M`
    : `$${Math.round(amount / 1_000).toLocaleString('en-US')}K`
}

export async function billingHistory(companyId: string): Promise<BillingEvent[]> {
  const store = await db()
  return store.select('billing_events', {
    where: { company_id: companyId },
    orderBy: { field: 'created_at', dir: 'desc' },
  })
}
