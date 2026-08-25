import Link from 'next/link'
import { db } from '@/db'
import { requireAdmin } from '@/lib/auth/session'
import { flagSnapshot } from '@/lib/flags'
import { formatCurrency, formatDate, titleize } from '@/lib/utils/format'
import {
  Badge, Card, CardBody, CardHeader, CardTitle, PageHeader, Section, Stat, Table, Td, Th, Tr,
} from '@/components/ui/primitives'
import { OfferingControls } from '@/app/(app)/deals/[dealId]/equity/controls'
import { transactionsAreLive } from '@/services/equity/providers'

export const dynamic = 'force-dynamic'

/**
 * The administrator's view of the equity marketplace.
 *
 * Publication runs through here, so this page shows what a reviewer needs to
 * decide: what the automated check found, where each offering stands, and what
 * the deployment is actually configured to do.
 */
export default async function AdminEquityPage() {
  await requireAdmin()
  const store = await db()

  const [offerings, investors, commitments, positions, reviews] = await Promise.all([
    store.select('offerings', { orderBy: { field: 'created_at', dir: 'desc' } }),
    store.select('investor_profiles'),
    store.select('investment_commitments'),
    store.select('investment_positions'),
    store.select('compliance_reviews'),
  ])

  const offered = offerings.reduce((sum, o) => sum + (o.target_raise ?? 0), 0)
  const committed = commitments
    .filter((c) => ['accepted', 'funded'].includes(c.status))
    .reduce((sum, c) => sum + c.amount, 0)
  const funded = positions.reduce((sum, p) => sum + p.invested_amount, 0)
  const averageInvestment = positions.length > 0 ? funded / positions.length : null

  const awaiting = offerings.filter((o) => ['compliance_review', 'ready'].includes(o.status))

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Administration"
        title="Equity marketplace"
        description="Offerings, investors and the capabilities this deployment is configured to permit."
      />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <Stat label="Offerings" value={String(offerings.length)} hint={`${offerings.filter((o) => o.status === 'live').length} live`} />
        <Stat label="Capital offered" value={formatCurrency(offered, { compact: true })} />
        <Stat label="Capital committed" value={formatCurrency(committed, { compact: true })} />
        <Stat label="Investors" value={String(investors.length)} />
        <Stat label="Average investment" value={formatCurrency(averageInvestment, { compact: true })} />
      </div>

      <Section
        title="Deployment configuration"
        description="What this environment is permitted to do. Changing these is a deployment decision, not a product one."
      >
        <CardBody>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {flagSnapshot().map((flag) => (
              <div key={flag.flag} className="flex items-center justify-between gap-2 rounded border border-line px-2.5 py-1.5">
                <span className="truncate text-[11px] text-ink-secondary">{flag.flag.replace(/_/g, ' ').toLowerCase()}</span>
                <Badge tone={flag.available ? 'positive' : 'neutral'}>
                  {flag.available ? 'on' : 'off'}{flag.overridden ? ' · env' : ''}
                </Badge>
              </div>
            ))}
          </div>
          <p className="mt-3 text-[12px] leading-relaxed text-ink-muted">
            Securities transactions are{' '}
            <strong className="text-ink">{transactionsAreLive() ? 'live' : 'not live'}</strong> in this
            deployment. {transactionsAreLive()
              ? 'Commitments are handed to the configured provider.'
              : 'Commitments are recorded and stop there; no securities transaction is created and no money moves.'}
          </p>
        </CardBody>
      </Section>

      {awaiting.length > 0 ? (
        <Section title="Awaiting review" description="Offerings a sponsor has submitted for compliance review.">
          <CardBody className="space-y-4">
            {awaiting.map((offering) => {
              const review = reviews.filter((r) => r.offering_id === offering.id).at(-1)
              return (
                <div key={offering.id} className="rounded border border-line p-3">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="text-[14px] font-medium text-ink">{offering.name}</div>
                      <div className="text-[12px] text-ink-muted">
                        {offering.reference} · {titleize(offering.offering_type)} ·{' '}
                        {formatCurrency(offering.target_raise)} target
                      </div>
                    </div>
                    {review?.automated_verdict ? (
                      <Badge tone={review.automated_verdict === 'pass' ? 'positive' : review.automated_verdict === 'warnings' ? 'warning' : 'critical'}>
                        {review.automated_verdict}
                      </Badge>
                    ) : null}
                  </div>
                  {review && review.findings.length > 0 ? (
                    <ul className="mt-2 space-y-1 text-[12px] leading-relaxed">
                      {review.findings.map((finding) => (
                        <li key={finding.code}>
                          <span className={finding.severity === 'blocker' ? 'font-medium text-red-700' : 'font-medium text-amber-700'}>
                            {finding.title}.
                          </span>{' '}
                          <span className="text-ink-muted">{finding.detail}</span>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                  <div className="mt-3">
                    <OfferingControls
                      offeringId={offering.id}
                      dealId={offering.deal_id}
                      status={offering.status}
                      isAdmin
                    />
                  </div>
                </div>
              )
            })}
          </CardBody>
        </Section>
      ) : null}

      <Section title="All offerings">
        <CardBody className="overflow-x-auto p-0">
          <Table>
            <thead>
              <Tr>
                <Th>Offering</Th><Th>Type</Th><Th numeric>Target</Th><Th numeric>Committed</Th>
                <Th>Status</Th><Th>Compliance</Th><Th>Created</Th>
              </Tr>
            </thead>
            <tbody>
              {offerings.map((offering) => (
                <Tr key={offering.id}>
                  <Td>
                    <Link href={`/deals/${offering.deal_id}/equity`} className="font-medium text-accent hover:underline">
                      {offering.name}
                    </Link>
                  </Td>
                  <Td>{titleize(offering.offering_type)}</Td>
                  <Td numeric>{formatCurrency(offering.target_raise, { compact: true })}</Td>
                  <Td numeric>{formatCurrency(offering.committed_amount, { compact: true })}</Td>
                  <Td><Badge tone={offering.status === 'live' ? 'positive' : 'neutral'}>{titleize(offering.status)}</Badge></Td>
                  <Td>{titleize(offering.compliance_status)}</Td>
                  <Td>{formatDate(offering.created_at)}</Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        </CardBody>
      </Section>

      <Card>
        <CardHeader><CardTitle>Investors</CardTitle></CardHeader>
        <CardBody className="overflow-x-auto p-0">
          <Table>
            <thead>
              <Tr><Th>Investor</Th><Th>Type</Th><Th>State</Th><Th>Onboarding</Th><Th>Status</Th></Tr>
            </thead>
            <tbody>
              {investors.map((investor) => (
                <Tr key={investor.id}>
                  <Td>{investor.display_name}</Td>
                  <Td>{titleize(investor.investor_type)}</Td>
                  <Td>{investor.state ?? '—'}</Td>
                  <Td>{titleize(investor.onboarding_stage)}</Td>
                  <Td><Badge tone={investor.status === 'active' ? 'positive' : 'neutral'}>{investor.status}</Badge></Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        </CardBody>
      </Card>
    </div>
  )
}
