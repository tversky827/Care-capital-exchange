import type { Metadata } from 'next'
import { requireAdmin } from '@/lib/auth/session'
import { benchmarks, MIN_BENCHMARK_COHORT } from '@/services/analytics'
import { Alert, Card, EmptyState, PageHeader, Section, Table, Td, Th, Tr } from '@/components/ui/primitives'
import { formatPercent, formatRatio, titleize } from '@/lib/utils/format'

export const metadata: Metadata = { title: 'Benchmarks' }

/**
 * Anonymous benchmarks.
 *
 * The flywheel: more transactions produce better reference data, which makes
 * matching and underwriting better. Cohorts below the minimum size are
 * suppressed entirely so no single transaction or lender can be inferred.
 */
export default async function BenchmarksPage() {
  await requireAdmin()
  const [byState, byAsset] = await Promise.all([benchmarks('state'), benchmarks('asset_type')])

  const renderTable = (rows: Awaited<ReturnType<typeof benchmarks>>) => (
    <Table>
      <thead>
        <tr>
          <Th>Cohort</Th><Th numeric>Sample</Th><Th numeric>Median LTV</Th><Th numeric>Median DSCR</Th>
          <Th numeric>Median debt yield</Th><Th numeric>Median occupancy</Th><Th numeric>Median rate quoted</Th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <Tr key={row.cohort}>
            <Td className="font-medium text-ink">{titleize(row.cohort)}</Td>
            <Td numeric className="text-ink-muted">{row.sampleSize}</Td>
            <Td numeric>{formatPercent(row.medianLtvPct)}</Td>
            <Td numeric>{formatRatio(row.medianDscr)}</Td>
            <Td numeric>{formatPercent(row.medianDebtYieldPct)}</Td>
            <Td numeric>{formatPercent(row.medianOccupancyPct)}</Td>
            <Td numeric>{formatPercent(row.medianRatePct, 2)}</Td>
          </Tr>
        ))}
      </tbody>
    </Table>
  )

  return (
    <div className="space-y-4">
      <PageHeader
        eyebrow="Platform operations"
        title="Benchmarks"
        description="Aggregate reference data derived from transactions on the platform. This is the asset that compounds: more deals produce better matching and better underwriting."
      />

      <Alert tone="neutral" title="Anonymity floor">
        A cohort is only published once it contains at least {MIN_BENCHMARK_COHORT} transactions, so
        no individual deal, borrower or lender can be inferred from a published figure. No
        lender-specific pricing or criteria are ever included.
      </Alert>

      <Section title="By state">
        {byState.length === 0 ? (
          <Card><EmptyState title="Not enough transactions yet" description={`A state needs at least ${MIN_BENCHMARK_COHORT} transactions before its benchmarks are published.`} /></Card>
        ) : (
          renderTable(byState)
        )}
      </Section>

      <Section title="By asset type">
        {byAsset.length === 0 ? (
          <Card><EmptyState title="Not enough transactions yet" /></Card>
        ) : (
          renderTable(byAsset)
        )}
      </Section>
    </div>
  )
}

export const dynamic = 'force-dynamic'
