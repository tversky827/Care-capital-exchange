import Link from 'next/link'
import type { Metadata } from 'next'
import { Check } from 'lucide-react'
import { Badge, Button, Card } from '@/components/ui/primitives'
import { FEE_SCHEDULE, PLAN_CATALOG } from '@/services/billing'
import { formatCurrency } from '@/lib/utils/format'
import { debtMarketplaceEnabled } from '@/lib/product'

export const metadata: Metadata = { title: 'Pricing' }

/**
 * Pricing reads from the same plan catalogue the billing service uses, so the
 * public page cannot drift from what the product actually charges.
 */
export default function PricingPage() {
  const operatorPlans = PLAN_CATALOG.filter((plan) => plan.audience === 'borrower')
  // Lender subscriptions belong to the debt marketplace. Pricing a product this
  // deployment does not sell would be the one page that contradicts the rest.
  const lenderPlans = debtMarketplaceEnabled()
    ? PLAN_CATALOG.filter((plan) => plan.audience === 'lender')
    : []

  return (
    <div className="mx-auto max-w-6xl px-6 py-16">
      <p className="eyebrow">Pricing</p>
      <h1 className="mt-2 text-[32px] font-semibold leading-tight tracking-[-0.02em] text-ink">
        Priced so that putting up a raise is never the obstacle.
      </h1>
      <p className="mt-4 max-w-2xl text-[15px] leading-relaxed text-ink-secondary">
        It costs an investor nothing to browse, read and commit. Operators can build a complete
        raise at no cost, and revenue comes from capital that actually funds.
      </p>

      <section className="mt-12">
        <h2 className="text-[15px] font-semibold uppercase tracking-[0.05em] text-ink-muted">Operators</h2>
        <div className="mt-4 grid gap-5 md:grid-cols-2">
          {operatorPlans.map((plan) => <PlanCard key={plan.key} plan={plan} />)}
        </div>
      </section>

      {lenderPlans.length > 0 ? (
        <section className="mt-12">
          <h2 className="text-[15px] font-semibold uppercase tracking-[0.05em] text-ink-muted">Lenders</h2>
          <div className="mt-4 grid gap-5 md:grid-cols-2">
            {lenderPlans.map((plan) => <PlanCard key={plan.key} plan={plan} />)}
          </div>
        </section>
      ) : null}

      <Card className="mt-12 p-6">
        <h2 className="text-[16px] font-semibold text-ink">Transaction fees</h2>
        <p className="mt-1.5 max-w-2xl text-[13px] leading-relaxed text-ink-secondary">
          Charged only on capital that actually funds. Nothing is charged on a raise that does not
          close.
        </p>
        <div className="mt-4 divide-y divide-line border-y border-line">
          {FEE_SCHEDULE.map((fee) => (
            <div key={fee.key} className="flex flex-wrap items-baseline justify-between gap-3 py-3">
              <span className="text-[13px] text-ink">{fee.label}</span>
              <span className="tnum text-[13px] font-medium text-ink">
                {(fee.basisPoints / 100).toFixed(2)}% of funded amount
                {fee.capUsd ? <span className="text-ink-muted"> · capped at {formatCurrency(fee.capUsd)}</span> : null}
              </span>
            </div>
          ))}
        </div>
      </Card>

      <p className="mt-8 max-w-3xl text-[12px] leading-relaxed text-ink-muted">
        Pricing shown is the configuration of this demonstration environment. Plans, seats and fee
        rules are configuration rather than code, so they can be changed without a schema or
        application change.
      </p>
    </div>
  )
}

function PlanCard({ plan }: { plan: (typeof PLAN_CATALOG)[number] }) {
  const price =
    plan.monthlyUsd === null ? 'Contact us'
    : plan.monthlyUsd === 0 ? 'No charge'
    : `${formatCurrency(plan.monthlyUsd)}/mo`

  return (
    <Card className={plan.highlight ? 'border-accent-line p-6' : 'p-6'}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[15px] font-semibold text-ink">{plan.name}</p>
          <p className="tnum mt-1 text-[22px] font-semibold text-ink">{price}</p>
          {plan.annualUsd ? (
            <p className="mt-0.5 text-[11px] text-ink-muted">
              {formatCurrency(plan.annualUsd)} billed annually · {plan.seats} seats
            </p>
          ) : (
            <p className="mt-0.5 text-[11px] text-ink-muted">Up to {plan.seats} seats</p>
          )}
        </div>
        {plan.highlight ? <Badge tone="accent">Most chosen</Badge> : null}
      </div>
      <ul className="mt-5 space-y-2">
        {plan.features.map((feature) => (
          <li key={feature} className="flex gap-2 text-[13px] leading-relaxed text-ink-secondary">
            <Check className="mt-0.5 size-3.5 shrink-0 text-accent" />
            {feature}
          </li>
        ))}
      </ul>
      <Link href={plan.audience === 'lender' ? '/signup?intent=provide_financing' : '/signup?intent=find_financing'} className="mt-6 block">
        <Button variant={plan.highlight ? 'primary' : 'secondary'} className="w-full">
          {plan.monthlyUsd === null ? 'Talk to us' : 'Get started'}
        </Button>
      </Link>
    </Card>
  )
}
