import Link from 'next/link'
import { requireDealAccess } from '@/lib/deal-access'
import { requireActor } from '@/lib/auth/session'
import { formatCurrency, formatPercent } from '@/lib/utils/format'
import {
  Alert, Button, Card, CardBody, CardHeader, CardTitle, Section, Stat,
} from '@/components/ui/primitives'
import { CapitalStackChart } from '@/components/equity/capital-stack-chart'
import { capitalMarketsView } from '@/services/equity/capital-stack'
import { CreateStackButton } from './create-stack'

export const dynamic = 'force-dynamic'

/**
 * The unified capital markets screen.
 *
 * One deal, both sides of its capital. Debt progress comes from indications
 * lenders have actually made; equity progress from commitments investors have
 * actually made. Neither is estimated on the sponsor's behalf.
 */
export default async function CapitalPage({
  params,
}: {
  params: Promise<{ dealId: string }>
}) {
  const { dealId } = await params
  const { deal } = await requireDealAccess(dealId)
  const actor = await requireActor()
  const view = await capitalMarketsView(actor, dealId)
  const { requirement, stack, debt, equity } = view

  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Total capitalisation" value={formatCurrency(requirement.totalCost)} />
        <Stat label="Debt required" value={formatCurrency(requirement.debtRequired)} />
        <Stat label="Equity required" value={formatCurrency(requirement.equityRequired)} />
        <Stat
          label="Capitalised"
          value={requirement.overallProgress !== null ? formatPercent(requirement.overallProgress * 100) : '—'}
          hint="Indicated debt plus committed equity"
        />
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <Section title="Debt" description="From the lender marketplace.">
          <CardBody className="space-y-3">
            <div className="grid grid-cols-3 gap-3">
              <Stat label="Lender matches" value={String(debt.lenderMatches)} />
              <Stat label="Indications" value={String(debt.indications)} />
              <Stat label="Best indication" value={formatCurrency(debt.bestIndication, { compact: true })} />
            </div>
            <Progress
              label="Debt raised against requirement"
              value={requirement.debtProgress}
            />
            <div className="flex gap-2">
              <Link href={`/deals/${dealId}/matches`}>
                <Button size="sm">View lender matches</Button>
              </Link>
              <Link href={`/deals/${dealId}/indications`}>
                <Button size="sm">Compare indications</Button>
              </Link>
            </div>
          </CardBody>
        </Section>

        <Section title="Equity" description="From the investment marketplace.">
          <CardBody className="space-y-3">
            <div className="grid grid-cols-3 gap-3">
              <Stat label="Offerings" value={String(equity.offerings)} />
              <Stat label="Investor matches" value={String(equity.investorMatches)} />
              <Stat label="Interested" value={String(equity.interested)} />
            </div>
            <Progress
              label="Equity committed against requirement"
              value={requirement.equityProgress}
            />
            <div className="flex gap-2">
              <Link href={`/deals/${dealId}/equity`}>
                <Button size="sm">Manage the raise</Button>
              </Link>
              {equity.offerings === 0 ? (
                <Link href={`/deals/${dealId}/equity/new`}>
                  <Button size="sm" variant="primary">Create an offering</Button>
                </Link>
              ) : null}
            </div>
          </CardBody>
        </Section>
      </div>

      <Section
        title="Capital structure"
        description="Layers in order of repayment priority."
      >
        <CardBody className="space-y-4">
          {stack ? (
            <>
              <CapitalStackChart sources={stack.sources} total={stack.total} />
              {stack.costOfCapital !== null ? (
                <div className="flex items-center justify-between border-t border-line pt-3 text-[12px]">
                  <span className="text-ink-muted">Blended cost of capital</span>
                  <span className="font-medium tabular-nums text-ink">{formatPercent(stack.costOfCapital * 100)}</span>
                </div>
              ) : (
                <p className="text-[11px] text-ink-muted">
                  A blended cost is shown only when every layer has a stated cost.
                </p>
              )}
              {stack.imbalance !== null ? (
                <Alert tone="warning">
                  The layers total {formatCurrency(stack.total)}, which differs from the stated
                  capitalisation by {formatCurrency(Math.abs(stack.imbalance))}.
                </Alert>
              ) : null}
            </>
          ) : (
            <div className="space-y-3">
              <p className="text-[13px] text-ink-muted">
                No capital structure has been set. One can be drafted from this deal&rsquo;s own
                underwritten debt and the gap that remains.
              </p>
              <CreateStackButton dealId={dealId} disabled={!actor.canWrite || !deal} />
            </div>
          )}
        </CardBody>
      </Section>

      <Card>
        <CardHeader><CardTitle>How these figures are produced</CardTitle></CardHeader>
        <CardBody>
          <ul className="space-y-1.5 text-[12px] leading-relaxed text-ink-muted">
            <li>· Debt required is this deal&rsquo;s underwritten loan amount, not a target.</li>
            <li>· Equity required is total capitalisation less that debt.</li>
            <li>· Debt indicated is the largest live indication a lender has actually submitted.</li>
            <li>· Equity committed is the sum of commitments a sponsor has accepted.</li>
            <li>· Nothing on this page is a forecast, and none of it is a commitment by any party.</li>
          </ul>
        </CardBody>
      </Card>
    </div>
  )
}

function Progress({ label, value }: { label: string; value: number | null }) {
  return (
    <div>
      <div className="flex items-center justify-between text-[11px] text-ink-muted">
        <span>{label}</span>
        <span className="tabular-nums">{value !== null ? formatPercent(value * 100) : 'Not computable'}</span>
      </div>
      <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-surface-sunken">
        <div className="h-full rounded-full bg-accent" style={{ width: `${(value ?? 0) * 100}%` }} />
      </div>
    </div>
  )
}
