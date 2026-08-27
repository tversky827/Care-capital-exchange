import Link from 'next/link'
import type { Metadata } from 'next'
import { Check } from 'lucide-react'
import { Button, Card } from '@/components/ui/primitives'
import { FEE_SCHEDULE } from '@/services/billing'
import { formatCurrency } from '@/lib/utils/format'
import { debtMarketplaceEnabled } from '@/lib/product'

export const metadata: Metadata = { title: 'Pricing' }

/**
 * Pricing reads from the same fee schedule the billing service charges from,
 * so the public page cannot drift from what the product actually bills.
 *
 * There is one number on this page. A pricing table with tiers, seats and
 * monthly minimums would be describing a product this platform does not sell:
 * nothing is charged until capital funds.
 */
export default function PricingPage() {
  const debtMarketplace = debtMarketplaceEnabled()
  const fees = FEE_SCHEDULE.filter((fee) => debtMarketplace || fee.appliesTo !== 'lender')
  const headline = fees.find((fee) => fee.appliesTo === 'sponsor') ?? fees[0]!

  return (
    <div className="mx-auto max-w-4xl px-6 py-16">
      <p className="eyebrow">Pricing</p>
      <h1 className="mt-2 text-[32px] font-semibold leading-tight tracking-[-0.02em] text-ink">
        We are paid when you are.
      </h1>
      <p className="mt-4 max-w-2xl text-[15px] leading-relaxed text-ink-secondary">
        No subscription, no seats, no monthly minimum. One fee, charged to the operator on capital
        that actually funds — and nothing at all if a raise does not close.
      </p>

      <Card className="mt-10 p-8">
        <div className="flex flex-wrap items-baseline gap-3">
          <span className="tnum text-[46px] font-semibold leading-none tracking-[-0.02em] text-ink">
            {(headline.basisPoints / 100).toFixed(headline.basisPoints % 100 === 0 ? 0 : 2)}%
          </span>
          <span className="text-[15px] text-ink-secondary">of {headline.basis}</span>
        </div>
        <p className="mt-4 max-w-2xl text-[14px] leading-relaxed text-ink-secondary">{headline.detail}</p>
        {headline.capUsd !== null ? (
          <p className="mt-2 text-[13px] text-ink-muted">
            Capped at {formatCurrency(headline.capUsd)} per transaction.
          </p>
        ) : null}
      </Card>

      <div className="mt-10 grid gap-px border border-line bg-line sm:grid-cols-3">
        {[
          { title: 'Free for investors', body: 'Browsing, reading, modelling an amount, asking questions and recording a commitment cost nothing. We are never paid by an investor, and no listing is ranked by who is paying.' },
          { title: 'Free until it funds', body: 'Adding a property, building the record, setting terms and publishing a raise are all free. The fee exists only once capital has actually funded.' },
          { title: 'Nothing recurring', body: 'There is no plan to choose, no seat to buy and no renewal date. If you raise nothing in a year, you pay nothing in that year.' },
        ].map((item) => (
          <div key={item.title} className="bg-surface p-5">
            <p className="flex items-center gap-1.5 text-[13px] font-semibold text-ink">
              <Check className="size-3.5 text-accent" /> {item.title}
            </p>
            <p className="mt-1.5 text-[12px] leading-relaxed text-ink-secondary">{item.body}</p>
          </div>
        ))}
      </div>

      {fees.length > 1 ? (
        <Card className="mt-10 p-6">
          <h2 className="text-[16px] font-semibold text-ink">The full schedule</h2>
          <div className="mt-4 divide-y divide-line border-y border-line">
            {fees.map((fee) => (
              <div key={fee.key} className="flex flex-wrap items-baseline justify-between gap-3 py-3">
                <div className="min-w-0">
                  <p className="text-[13px] font-medium text-ink">{fee.label}</p>
                  <p className="mt-0.5 text-[12px] text-ink-muted">{fee.detail}</p>
                </div>
                <p className="tnum shrink-0 text-[14px] font-semibold text-ink">
                  {(fee.basisPoints / 100).toFixed(2)}%
                  {fee.capUsd !== null ? (
                    <span className="ml-1 text-[12px] font-normal text-ink-muted">
                      capped at {formatCurrency(fee.capUsd, { compact: true })}
                    </span>
                  ) : null}
                </p>
              </div>
            ))}
          </div>
        </Card>
      ) : null}

      <p className="mt-8 max-w-2xl text-[12px] leading-relaxed text-ink-muted">
        No money moves through CareCapital Exchange. A fee is invoiced to the operator after a
        raise has closed; it is not deducted from investor capital and it is not a commission on a
        securities transaction.
      </p>

      <div className="mt-10 flex flex-wrap gap-3">
        <Link href="/signup?intent=invest"><Button variant="primary" size="lg">Browse investments</Button></Link>
        <Link href="/signup?intent=find_financing"><Button size="lg">Start a raise</Button></Link>
      </div>
    </div>
  )
}
