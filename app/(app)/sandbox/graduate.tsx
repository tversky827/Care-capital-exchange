import Link from 'next/link'
import { ArrowRight } from 'lucide-react'
import { Card, CardBody } from '@/components/ui/primitives'

/**
 * From practice to the real thing.
 *
 * A link into the ordinary regulated onboarding, and nothing more. What it
 * deliberately does not offer is a button that converts the practice portfolio
 * into a real one — that would need eligibility, verification, funding and a
 * decision about each holding taken again with real money at stake, and
 * presenting it as one press would misrepresent all four.
 *
 * The wording is careful about who decides: the sandbox does not qualify
 * anybody for anything, and nothing done here shortens the process on the
 * other side.
 */
export function Graduate({ holdings }: { holdings: number }) {
  return (
    <Card className="border-accent-line">
      <CardBody className="space-y-3">
        <p className="text-[13px] font-semibold text-ink">Ready to invest for real?</p>
        <p className="text-[12px] leading-relaxed text-ink-secondary">
          {holdings > 0
            ? `You have built a practice portfolio of ${holdings} holding${holdings === 1 ? '' : 's'}. `
            : ''}
          Investing actual money runs through the platform&rsquo;s own onboarding: eligibility,
          identity and accreditation checks, and funding an account. Nothing you did in the sandbox
          shortens it or counts towards it.
        </p>
        <p className="text-[12px] leading-relaxed text-ink-muted">
          Your practice holdings stay here. They are not converted into real positions — each one
          would be a decision taken again, with real money, against terms that may have moved.
        </p>
        {/* Straight to the live investor home, which sends anyone without an
            account to onboarding on its own. Checking here would mean a
            sandbox page importing the production account service, and the
            boundary is worth more than one saved redirect. */}
        <Link
          href="/investor"
          className="inline-flex items-center gap-1.5 text-[13px] font-medium text-accent hover:underline"
        >
          Open an investment account
          <ArrowRight className="size-3.5" />
        </Link>
      </CardBody>
    </Card>
  )
}
