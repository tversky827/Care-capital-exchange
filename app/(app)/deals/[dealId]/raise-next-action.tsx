import { NextAction } from '@/components/deal/common'
import type { DealReadiness } from '@/lib/underwriting/readiness'
import type { Discrepancy, Offering } from '@/types'

/**
 * The one thing to do next on a property.
 *
 * The debt version of this banner names a lender pipeline — indications to
 * compare, a package to distribute, items outstanding "before lender
 * distribution". None of those exist here, and each of them linked to a page
 * that now returns a 404.
 *
 * The order is what actually blocks a raise: contradictions in the record
 * first, because a raise built on figures that disagree will be found out;
 * then the raise itself, wherever it has stopped.
 */
export function RaiseNextAction({
  dealId, offerings, discrepancies, readiness,
}: {
  dealId: string
  offerings: Offering[]
  discrepancies: Discrepancy[]
  readiness: DealReadiness | null
}) {
  const live = offerings.find((o) => o.status === 'live')
  const draft = offerings.find((o) => o.status === 'draft')
  const inReview = offerings.find((o) => o.status === 'under_review' || o.status === 'compliance_review')
  const ready = offerings.find((o) => o.status === 'ready')

  if (discrepancies.length > 0) {
    return (
      <NextAction
        tone="warning"
        headline={`${discrepancies.length} item${discrepancies.length === 1 ? '' : 's'} need attention`}
        detail="These are places your own documents disagree with each other. An investor doing diligence will find them, so it is better to settle them now."
        items={discrepancies.slice(0, 4).map((item) => ({ label: item.title, href: `/deals/${dealId}/issues` }))}
        action={{ href: `/deals/${dealId}/issues`, label: 'Review issues' }}
      />
    )
  }

  if (live) {
    const target = live.target_raise
    const pct = target && target > 0 ? Math.round((live.committed_amount / target) * 100) : null
    return (
      <NextAction
        tone="positive"
        headline={pct === null ? 'Your raise is open to investors' : `Your raise is ${pct}% committed`}
        detail="Investors can see it and commit. You decide which commitments to accept."
        action={{ href: `/deals/${dealId}/equity`, label: 'See investors' }}
      />
    )
  }

  if (ready) {
    return (
      <NextAction
        tone="positive"
        headline="Your raise has been reviewed and can go live"
        detail="Publishing opens it to investors whose stated preferences match it."
        action={{ href: `/deals/${dealId}/equity`, label: 'Open the raise' }}
      />
    )
  }

  if (inReview) {
    return (
      <NextAction
        headline="Your raise is with an administrator"
        detail="They are checking that the disclosure package is complete. You will be told as soon as it can go live."
        action={{ href: `/deals/${dealId}/equity`, label: 'See where it is' }}
      />
    )
  }

  if (draft) {
    return (
      <NextAction
        headline="Your raise is still a draft"
        detail="Nobody outside your company can see it. Finish the terms and submit it for review."
        action={{ href: `/deals/${dealId}/equity`, label: 'Finish the draft' }}
      />
    )
  }

  const outstanding = readiness?.requiredOutstanding ?? []
  if (outstanding.length > 0) {
    return (
      <NextAction
        headline={`${outstanding.length} thing${outstanding.length === 1 ? '' : 's'} to add before you can raise`}
        detail={readiness?.blockingReason ?? undefined}
        items={outstanding.slice(0, 5).map((item) => ({ label: item.label, href: item.href }))}
        action={{ href: `/deals/${dealId}/documents`, label: 'Upload documents' }}
      />
    )
  }

  return (
    <NextAction
      tone="positive"
      headline="This property is ready to raise against"
      detail="Set your terms — how much, the minimum cheque, the preferred return and the hold — and investors can start reviewing it."
      action={{ href: `/deals/${dealId}/equity/new`, label: 'Start a raise' }}
    />
  )
}
