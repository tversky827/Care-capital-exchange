import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { ArrowRight, FlaskConical, Presentation } from 'lucide-react'
import { requireActor } from '@/lib/auth/session'
import { isAvailable } from '@/lib/flags'
import { cents, format } from '@/lib/money'
import { currentEnvironment } from '@/lib/environment'
import { OPENING_BALANCE_CENTS } from '@/types/practice'
import { Button, Card, CardBody } from '@/components/ui/primitives'
import { enterSandboxAction } from './actions'

export const metadata: Metadata = { title: 'Sandbox' }
export const dynamic = 'force-dynamic'

/**
 * The way in.
 *
 * Two doors, and the difference between them stated plainly enough that nobody
 * walks through the wrong one. The demonstration world is fictional and exists
 * to be shown to someone; practice is the real catalogue with virtual money
 * and exists to be used alone.
 *
 * Both say what is not real, once, in the place where it matters. Neither
 * repeats it in red — a page that shouts about risk on every line stops being
 * read, and the guarantee here is structural rather than something a warning
 * has to hold up.
 */
export default async function SandboxPage() {
  const actor = await requireActor()
  if (!isAvailable('SANDBOX_ENABLED')) notFound()

  const environment = await currentEnvironment(actor.user.id)
  const demo = isAvailable('DEMO_MODE_ENABLED')
  const practice = isAvailable('PRACTICE_MODE_ENABLED')
  if (!demo && !practice) notFound()

  return (
    <div className="mx-auto max-w-4xl space-y-6 py-4">
      <div className="text-center">
        <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-accent">
          CareCapital Sandbox
        </p>
        <h1 className="mt-2 text-[28px] font-semibold leading-tight text-ink">
          Explore healthcare investing with nothing at stake
        </h1>
        <p className="mx-auto mt-2 max-w-xl text-[14px] leading-relaxed text-ink-secondary">
          Two ways in. One shows the product using a world that does not exist. The other hands you
          the actual product with money that does not exist.
        </p>
      </div>

      {environment !== 'live' ? (
        <Card className="border-accent-line bg-accent-soft">
          <CardBody className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-[13px] text-ink">
              You are already in <strong>{environment === 'demo' ? 'demonstration' : 'practice'}</strong> mode.
            </p>
            <a href="/sandbox/home" className="text-[13px] font-medium text-accent hover:underline">
              Back to it
            </a>
          </CardBody>
        </Card>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2">
        {demo ? (
          <Door
            mode="demo"
            icon={<Presentation className="size-5 text-accent" />}
            eyebrow="Demonstration"
            title="Show CareCapital"
            body="A complete, fictional healthcare investment platform: properties, sponsors, financials, documents, investors and a portfolio with history behind it. Everything in it is invented."
            facts={['Entirely fictional data', `${format(cents(OPENING_BALANCE_CENTS.demo))} of virtual cash`, 'Resets to a clean state']}
            action="Enter demonstration"
            note="For showing the product to someone. Nothing in this world corresponds to a real property, a real operator or a real raise."
          />
        ) : null}

        {practice ? (
          <Door
            mode="practice"
            icon={<FlaskConical className="size-5 text-accent" />}
            eyebrow="Practice"
            title="Practise investing"
            body="The actual CareCapital marketplace — the same raises, the same financials, the same documents, the same analysis — with virtual money. Build a portfolio, simulate distributions, and see how the decisions would have played out."
            facts={['Real opportunities', `${format(cents(OPENING_BALANCE_CENTS.practice))} of virtual cash`, 'No obligation of any kind']}
            action="Start practising"
            note="Nothing you do here creates an investment, a commitment or a financial obligation. No sponsor is told, no raise is affected, and no money can move."
            primary
          />
        ) : null}
      </div>

      <p className="mx-auto max-w-2xl text-center text-[11px] leading-relaxed text-ink-muted">
        Investment opportunities shown in practice mode may be based on real offerings. All
        transactions in the sandbox use virtual money and create no financial obligation. Any
        performance shown is hypothetical, is derived from assumptions a sponsor has stated, and
        does not represent actual or guaranteed results. CareCapital Exchange is not your broker or
        adviser and does not recommend any investment.
      </p>
    </div>
  )
}

function Door({
  mode, icon, eyebrow, title, body, facts, action, note, primary,
}: {
  mode: 'demo' | 'practice'
  icon: React.ReactNode
  eyebrow: string
  title: string
  body: string
  facts: string[]
  action: string
  note: string
  primary?: boolean
}) {
  const enter = enterSandboxAction.bind(null, mode)
  return (
    <Card className={primary ? 'border-accent-line' : undefined}>
      <CardBody className="flex h-full flex-col gap-4 p-5">
        <div>
          <div className="flex items-center gap-2">
            {icon}
            <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-muted">
              {eyebrow}
            </span>
          </div>
          <h2 className="mt-2 text-[18px] font-semibold text-ink">{title}</h2>
          <p className="mt-1.5 text-[13px] leading-relaxed text-ink-secondary">{body}</p>
        </div>

        <ul className="space-y-1">
          {facts.map((fact) => (
            <li key={fact} className="flex items-start gap-1.5 text-[12px] text-ink-secondary">
              <span className="mt-1.5 size-1 shrink-0 rounded-full bg-accent" />
              {fact}
            </li>
          ))}
        </ul>

        <div className="mt-auto space-y-2">
          <form action={enter}>
            <Button type="submit" variant={primary ? 'primary' : 'secondary'} className="w-full">
              {action}
              <ArrowRight className="size-3.5" />
            </Button>
          </form>
          <p className="text-[11px] leading-relaxed text-ink-muted">{note}</p>
        </div>
      </CardBody>
    </Card>
  )
}
