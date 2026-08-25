import Link from 'next/link'
import { requireActor } from '@/lib/auth/session'
import { assetNoun, stateName } from '@/lib/deal/display'
import { formatCurrency, formatPercent, formatRatio, titleize } from '@/lib/utils/format'
import { Alert, CardBody, EmptyState, PageHeader, Section, Table, Td, Th, Tr } from '@/components/ui/primitives'
import { searchOfferings } from '@/services/equity/matching'
import { projectOffering } from '@/services/equity/analysis'
import { db } from '@/db'

export const dynamic = 'force-dynamic'

/**
 * Compares up to four offerings.
 *
 * The rows are deliberately not sorted or highlighted. A higher projected
 * return is not automatically better — it usually means more leverage, a
 * longer hold, or a less stabilised asset — and a table that ranked them would
 * be making that judgement on the reader's behalf.
 */
export default async function ComparePage({
  searchParams,
}: {
  searchParams: Promise<{ ids?: string }>
}) {
  const actor = await requireActor()
  const { ids } = await searchParams
  const wanted = (ids ?? '').split(',').filter(Boolean).slice(0, 4)

  if (wanted.length < 2) {
    return (
      <EmptyState
        title="Choose offerings to compare"
        description="Select between two and four offerings from the marketplace."
        action={<Link href="/investments" className="text-[13px] font-medium text-accent hover:underline">Back to the marketplace</Link>}
      />
    )
  }

  const store = await db()
  const all = await searchOfferings(actor.investor?.id ?? null, { status: 'all' })
  const rows = wanted
    .map((id) => all.find((row) => row.offering.id === id))
    .filter((row): row is NonNullable<typeof row> => Boolean(row))

  const projections = await Promise.all(rows.map((row) => projectOffering(row.offering.id)))
  const risks = await Promise.all(rows.map(async (row) => {
    const assessments = await store.select('risk_assessments', {
      where: { offering_id: row.offering.id },
      orderBy: { field: 'created_at', dir: 'desc' },
    })
    return assessments[0] ?? null
  }))

  const line = (label: string, values: (string | null)[], hint?: string) => ({ label, values, hint })

  const comparison = [
    line('Asset', rows.map((row) => assetNoun(row.deal.asset_type))),
    line('Location', rows.map((row) => (row.facility?.state ? stateName(row.facility.state) : '—'))),
    line('Structure', rows.map((row) => (row.terms ? titleize(row.terms.capital_position) : '—'))),
    line('Minimum investment', rows.map((row) => formatCurrency(row.offering.minimum_investment))),
    line('Target raise', rows.map((row) => formatCurrency(row.offering.target_raise))),
    line('Committed', rows.map((row) => formatCurrency(row.offering.committed_amount))),
    line('Target hold', rows.map((row) => (row.terms?.target_hold_months ? `${Math.round(row.terms.target_hold_months / 12)} years` : '—'))),
    line('Preferred return', rows.map((row) => (row.terms?.preferred_return_pct ? formatPercent(row.terms.preferred_return_pct * 100) : '—')), 'Target'),
    line('Projected IRR', projections.map((p) => (p?.irrPct != null ? formatPercent(p.irrPct) : '—')), 'Projected from stated assumptions'),
    line('Projected multiple', projections.map((p) => (p?.equityMultiple != null ? formatRatio(p.equityMultiple) : '—')), 'Projected from stated assumptions'),
    line('Projected exit value', projections.map((p) => formatCurrency(p?.exitValue ?? null)), 'Projected'),
    line('Risk score', risks.map((r) => (r ? `${r.overall_score} (${r.overall_band})` : '—')), 'Higher is riskier'),
    line('Risk coverage', risks.map((r) => (r ? formatPercent(r.coverage * 100) : '—')), 'Share of expected inputs available'),
    line('Status', rows.map((row) => titleize(row.offering.status))),
  ]

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Comparison"
        title={`Comparing ${rows.length} offerings`}
        description="Side by side on the figures each sponsor has supplied. Nothing here is ranked."
      />

      <Section title="Comparison">
        <CardBody className="overflow-x-auto p-0">
          <Table>
            <thead>
              <Tr>
                <Th />
                {rows.map((row) => (
                  <Th key={row.offering.id}>
                    <Link href={`/investments/${row.offering.id}`} className="text-accent hover:underline">
                      {row.offering.name}
                    </Link>
                  </Th>
                ))}
              </Tr>
            </thead>
            <tbody>
              {comparison.map((row) => (
                <Tr key={row.label}>
                  <Td>
                    <span className="text-ink">{row.label}</span>
                    {row.hint ? <span className="block text-[11px] text-ink-muted">{row.hint}</span> : null}
                  </Td>
                  {row.values.map((value, index) => (
                    <Td key={`${row.label}-${index}`} numeric>{value ?? '—'}</Td>
                  ))}
                </Tr>
              ))}
            </tbody>
          </Table>
        </CardBody>
      </Section>

      <Alert tone="neutral">
        A higher projected return is not automatically better. It usually reflects more leverage, a
        longer hold, or a less stabilised asset — that is, more risk. Read each offering&rsquo;s
        risks and assumptions before comparing its returns with another&rsquo;s.
      </Alert>
    </div>
  )
}
