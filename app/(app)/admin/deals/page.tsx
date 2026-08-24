import Link from 'next/link'
import type { Metadata } from 'next'
import { db } from '@/db'
import { requireAdmin } from '@/lib/auth/session'
import { buildSnapshot } from '@/lib/deal/snapshot'
import { readinessFor } from '@/services/underwriting'
import { Badge, PageHeader, Progress, Section, Table, Td, Th, Tr } from '@/components/ui/primitives'
import { DealStatusBadge } from '@/components/deal/common'
import { formatCurrency, formatPercent, formatRatio, formatRelative } from '@/lib/utils/format'

export const metadata: Metadata = { title: 'All deals' }

export default async function AdminDealsPage() {
  await requireAdmin()
  const store = await db()

  const [deals, companies] = await Promise.all([
    store.select('deals', { orderBy: { field: 'updated_at', dir: 'desc' } }),
    store.select('companies', {}),
  ])
  const companyName = new Map(companies.map((company) => [company.id, company.name]))

  const rows = await Promise.all(
    deals.map(async (deal) => ({
      deal,
      snapshot: await buildSnapshot(deal.id),
      readiness: await readinessFor(deal.id),
      matches: await store.count('matches', { where: { deal_id: deal.id, hard_fail: false } }),
      distributions: await store.count('deal_distributions', { where: { deal_id: deal.id, status: { neq: 'revoked' } } }),
      indications: await store.count('indications', { where: { deal_id: deal.id } }),
      issues: await store.count('discrepancies', { where: { deal_id: deal.id, status: 'open' } }),
    })),
  )

  return (
    <div className="space-y-4">
      <PageHeader
        eyebrow="Platform operations"
        title="All deals"
        description={`${deals.length} financing opportunities across every organisation.`}
      />

      <Section title="Deals">
        <Table>
          <thead>
            <tr>
              <Th>Reference</Th><Th>Facility</Th><Th>Borrower</Th><Th>Status</Th>
              <Th numeric>Request</Th><Th numeric>LTV</Th><Th numeric>DSCR</Th>
              <Th className="w-28">Readiness</Th><Th numeric>Matches</Th><Th numeric>Sent</Th>
              <Th numeric>Offers</Th><Th numeric>Issues</Th><Th numeric>Updated</Th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ deal, snapshot, readiness, matches, distributions, indications, issues }) => (
              <Tr key={deal.id}>
                <Td>
                  <Link href={`/deals/${deal.id}`} className="font-medium text-accent hover:underline">
                    {deal.reference}
                  </Link>
                  {deal.is_demo ? <Badge tone="warning" className="ml-1.5">Demo</Badge> : null}
                </Td>
                <Td className="max-w-56 truncate text-ink">{snapshot?.facility?.name ?? deal.name}</Td>
                <Td className="max-w-48 truncate text-ink-secondary">{companyName.get(deal.company_id)}</Td>
                <Td><DealStatusBadge status={deal.status} /></Td>
                <Td numeric>{formatCurrency(snapshot?.summary.loanAmount ?? null, { compact: true })}</Td>
                <Td numeric>{formatPercent(snapshot?.summary.ltv ?? null)}</Td>
                <Td numeric>{formatRatio(snapshot?.summary.dscr ?? null)}</Td>
                <Td>
                  <Progress
                    value={readiness?.overall ?? 0}
                    tone={readiness?.canDistribute ? 'positive' : (readiness?.overall ?? 0) >= 60 ? 'warning' : 'critical'}
                    showLabel
                  />
                </Td>
                <Td numeric>{matches || '—'}</Td>
                <Td numeric>{distributions || '—'}</Td>
                <Td numeric>{indications || '—'}</Td>
                <Td numeric className={issues ? 'font-medium text-warning' : 'text-ink-muted'}>{issues || '—'}</Td>
                <Td numeric className="whitespace-nowrap text-ink-muted">{formatRelative(deal.updated_at)}</Td>
              </Tr>
            ))}
          </tbody>
        </Table>
      </Section>
    </div>
  )
}

export const dynamic = 'force-dynamic'
