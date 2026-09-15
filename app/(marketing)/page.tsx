import Link from 'next/link'
import { ArrowRight } from 'lucide-react'
import { Button, Card } from '@/components/ui/primitives'
import { formatCurrency, formatPercent } from '@/lib/utils/format'

/**
 * Homepage.
 *
 * One idea, one screen: you can put money into a nursing home, and you can
 * look at the whole thing right now without signing up for anything.
 *
 * That second half is the entire pitch and it used to be buried. This page
 * carried ten sections and 961 words — a numbered process, an essay on why a
 * nursing home is an operating business, two audience panels of ticked bullets,
 * a three-part explanation of what the company is not, and five FAQs — before
 * the reader reached anything they could press. Six thousand pixels on a phone.
 *
 * None of that writing was wrong. It was in the wrong place: a landing page
 * has one job, which is to get somebody who is curious into the product, and
 * everything it says beyond that competes with the thing it is trying to do.
 * The detail now lives on `/how-it-works` and `/for-borrowers`, which exist
 * precisely for people who want it.
 *
 * The example listing stays, because showing one is worth more than any
 * paragraph describing what a listing is. Its figures are the ones the demo
 * actually produces, and the caveat travels with the number rather than
 * sitting in the footer.
 */

const EXAMPLE = {
  name: 'Lakeview Skilled Nursing Equity',
  facility: '120-bed skilled nursing facility',
  state: 'Illinois',
  minimum: 50_000,
  targetReturn: 19.5,
  holdYears: 5,
}

export default function HomePage() {
  return (
    <>
      <section className="mx-auto grid max-w-6xl items-center gap-10 px-6 py-16 lg:grid-cols-[minmax(0,1fr)_380px] lg:py-24">
        <div>
          <h1 className="max-w-xl text-[38px] font-semibold leading-[1.05] tracking-[-0.025em] text-ink sm:text-[52px]">
            Invest in the buildings that care for people.
          </h1>

          <p className="mt-5 max-w-lg text-[16px] leading-relaxed text-ink-secondary">
            Private investments in nursing homes, offered by the operators who run them. You see
            what the operator filed — the statements, the projections, the assumptions underneath —
            before you decide anything.
          </p>

          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Link href="/try">
              <Button variant="primary" size="lg" className="gap-2">
                See it now <ArrowRight className="size-4" />
              </Button>
            </Link>
            <Link href="/signup?intent=invest">
              <Button size="lg">Create an account</Button>
            </Link>
          </div>

          <p className="mt-4 text-[13px] text-ink-muted">
            The demo needs no account, no email and no card. You get $250,000 of virtual money and
            the whole platform.
          </p>
        </div>

        {/* Showing one listing beats describing what a listing is. */}
        <Card className="self-start">
          <div className="border-b border-line px-4 py-3">
            <p className="text-[15px] font-semibold text-ink">{EXAMPLE.name}</p>
            <p className="mt-0.5 text-[12px] text-ink-muted">
              {EXAMPLE.state} · {EXAMPLE.facility}
            </p>
          </div>
          <div className="px-4 py-5">
            <p className="tnum text-[40px] font-semibold leading-none tracking-[-0.02em] text-ink">
              {formatPercent(EXAMPLE.targetReturn)}
            </p>
            <p className="mt-1 text-[13px] text-ink-secondary">a year, targeted</p>
            <p className="mt-3 text-[13px] text-ink-muted">
              {formatCurrency(EXAMPLE.minimum, { compact: true })} minimum · about {EXAMPLE.holdYears} years
            </p>
          </div>
          <p className="border-t border-line bg-surface-sunken px-4 py-2.5 text-[11px] leading-relaxed text-ink-muted">
            An example. A targeted return is what the operator&rsquo;s own assumptions produce when
            the model is run — not a forecast, and not a promise.
          </p>
        </Card>
      </section>

      {/* Three lines. The four-box numbered process this replaced explained a
          sequence nobody needs explained before they have seen the product. */}
      <section className="border-y border-line bg-surface">
        <div className="mx-auto grid max-w-6xl gap-8 px-6 py-12 sm:grid-cols-3">
          {[
            ['Browse', 'Every raise that is open, with what it targets and what it takes to join.'],
            ['Read', 'The operator’s own statements and projections — and what could go wrong.'],
            ['Invest', 'From a cash balance you fund once and deploy across as many as you like.'],
          ].map(([title, detail]) => (
            <div key={title}>
              <p className="text-[15px] font-semibold text-ink">{title}</p>
              <p className="mt-1.5 text-[13px] leading-relaxed text-ink-secondary">{detail}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-6 py-12">
        <div className="max-w-2xl">
          <h2 className="text-[20px] font-semibold tracking-[-0.015em] text-ink">
            We do not sell you anything.
          </h2>
          <p className="mt-2 text-[14px] leading-relaxed text-ink-secondary">
            No commissions, no recommended list, no in-house deals. Operators pay us when a raise
            completes; you pay nothing, and nothing is ranked by who is paying.{' '}
            <Link href="/how-it-works" className="text-accent hover:underline">
              How it works
            </Link>{' '}
            ·{' '}
            <Link href="/for-borrowers" className="text-accent hover:underline">
              I run a facility
            </Link>
          </p>
          <p className="mt-5 text-[12px] leading-relaxed text-ink-muted">
            Private investments are illiquid, returns are projected rather than promised, and you
            can lose everything you invest. CareCapital Exchange is not a broker-dealer, investment
            adviser, funding portal or custodian.
          </p>
        </div>
      </section>
    </>
  )
}
