import Link from 'next/link'
import type { Metadata } from 'next'
import { db } from '@/db'
import { requireAdmin } from '@/lib/auth/session'
import { listJobs } from '@/services/jobs'
import { Alert, Badge, Card, PageHeader, Section, Table, Td, Th, Tr, type Tone } from '@/components/ui/primitives'
import { MetricTile } from '@/components/deal/common'
import { RetryControl } from './retry-control'
import { formatDateTime, formatRelative, titleize } from '@/lib/utils/format'

export const metadata: Metadata = { title: 'Background jobs' }

const STATUS_TONE: Record<string, Tone> = {
  queued: 'neutral', running: 'accent', succeeded: 'positive', failed: 'warning', dead: 'critical',
}

/**
 * Job console.
 *
 * A failed background job is a document that never got read or an analysis that
 * never ran, so it needs to be visible and retryable rather than buried in a
 * log. Jobs record their attempt count and last error.
 */
export default async function AdminJobsPage() {
  await requireAdmin()
  const [jobs, store] = await Promise.all([listJobs({}, 200), db()])
  const deals = await store.select('deals', {})
  const dealRef = new Map(deals.map((deal) => [deal.id, deal.reference]))

  const counts = jobs.reduce<Record<string, number>>((acc, job) => {
    acc[job.status] = (acc[job.status] ?? 0) + 1
    return acc
  }, {})
  const dead = jobs.filter((job) => job.status === 'dead')

  return (
    <div className="space-y-4">
      <PageHeader
        eyebrow="Platform operations"
        title="Background jobs"
        description="Document processing, reconciliation, underwriting and matching all run as retryable jobs."
      />

      {dead.length > 0 ? (
        <Alert tone="critical" title={`${dead.length} job${dead.length === 1 ? '' : 's'} exhausted their retries`}>
          Each of these is work that never completed. Retrying resets the attempt counter and runs the
          job again with the same payload.
        </Alert>
      ) : null}

      <Card>
        <div className="data-grid grid-cols-2 md:grid-cols-5">
          <MetricTile label="Queued" value={counts.queued ?? 0} />
          <MetricTile label="Running" value={counts.running ?? 0} />
          <MetricTile label="Succeeded" value={counts.succeeded ?? 0} />
          <MetricTile label="Failed" value={counts.failed ?? 0} tone={counts.failed ? 'warning' : undefined} />
          <MetricTile label="Dead" value={counts.dead ?? 0} tone={counts.dead ? 'critical' : undefined} />
        </div>
      </Card>

      <Section title="Jobs" description={`${jobs.length} most recent.`}>
        <Table>
          <thead>
            <tr>
              <Th>Created</Th><Th>Kind</Th><Th>Deal</Th><Th>Status</Th>
              <Th numeric>Attempts</Th><Th numeric>Duration</Th><Th>Last error</Th><Th className="w-32" />
            </tr>
          </thead>
          <tbody>
            {jobs.map((job) => (
              <Tr key={job.id}>
                <Td className="whitespace-nowrap text-ink-muted" title={formatDateTime(job.created_at)}>
                  {formatRelative(job.created_at)}
                </Td>
                <Td className="font-medium text-ink">{job.kind}</Td>
                <Td>
                  {job.deal_id ? (
                    <Link href={`/deals/${job.deal_id}`} className="text-accent hover:underline">
                      {dealRef.get(job.deal_id) ?? 'Deal'}
                    </Link>
                  ) : (
                    <span className="text-ink-muted">—</span>
                  )}
                </Td>
                <Td><Badge tone={STATUS_TONE[job.status] ?? 'neutral'}>{titleize(job.status)}</Badge></Td>
                <Td numeric className={job.attempts >= job.max_attempts ? 'text-critical' : ''}>
                  {job.attempts}/{job.max_attempts}
                </Td>
                <Td numeric className="text-ink-muted">{job.duration_ms !== null ? `${job.duration_ms}ms` : '—'}</Td>
                <Td className="max-w-80 truncate text-[11px] text-critical" title={job.last_error ?? ''}>
                  {job.last_error ?? ''}
                </Td>
                <Td>
                  {job.status === 'failed' || job.status === 'dead' ? <RetryControl jobId={job.id} /> : null}
                </Td>
              </Tr>
            ))}
          </tbody>
        </Table>
      </Section>
    </div>
  )
}

export const dynamic = 'force-dynamic'
