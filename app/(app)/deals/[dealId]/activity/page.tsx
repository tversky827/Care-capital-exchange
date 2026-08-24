import { notFound } from 'next/navigation'
import { db } from '@/db'
import { requireActor } from '@/lib/auth/session'
import { auditForDeal } from '@/services/audit'
import { Badge, Card, EmptyState, Section, Table, Td, Th, Tr } from '@/components/ui/primitives'
import { formatBytes, formatDateTime, titleize } from '@/lib/utils/format'

/**
 * Activity.
 *
 * The audit trail for the deal, plus the document access log — who opened which
 * document, when, and from where. Both are append-only.
 */
export default async function ActivityPage({ params }: { params: Promise<{ dealId: string }> }) {
  const { dealId } = await params
  await requireActor()

  const store = await db()
  const deal = await store.findById('deals', dealId)
  if (!deal) notFound()

  const [logs, accessLogs, users, companies, documents, lenders] = await Promise.all([
    auditForDeal(dealId, 300),
    store.select('document_access_logs', {
      where: { deal_id: dealId },
      orderBy: { field: 'created_at', dir: 'desc' },
      limit: 100,
    }),
    store.select('users', {}),
    store.select('companies', {}),
    store.select('documents', { where: { deal_id: dealId } }),
    store.select('lenders', {}),
  ])

  const userName = new Map(users.map((user) => [user.id, user.full_name]))
  const companyName = new Map(
    companies.map((company) => {
      const lender = lenders.find((entry) => entry.company_id === company.id)
      return [company.id, lender?.institution_name ?? company.name]
    }),
  )
  const documentName = new Map(documents.map((document) => [document.id, document.display_name]))

  return (
    <div className="space-y-4">
      <Section
        title="Deal activity"
        description="Every material event on this deal, in order. Audit records cannot be edited or removed."
      >
        {logs.length === 0 ? (
          <EmptyState title="No activity recorded yet" />
        ) : (
          <Table>
            <thead>
              <tr><Th>When</Th><Th>Actor</Th><Th>Action</Th><Th>Detail</Th></tr>
            </thead>
            <tbody>
              {logs.map((log) => (
                <Tr key={log.id}>
                  <Td className="whitespace-nowrap text-ink-muted">{formatDateTime(log.created_at)}</Td>
                  <Td className="whitespace-nowrap">
                    <span className="text-ink">{log.actor_id ? userName.get(log.actor_id) ?? 'Unknown' : 'Platform'}</span>
                    {log.actor_company_id ? (
                      <span className="block text-[11px] text-ink-muted">{companyName.get(log.actor_company_id)}</span>
                    ) : null}
                  </Td>
                  <Td><Badge tone="neutral">{log.action}</Badge></Td>
                  <Td className="text-[12px] text-ink-secondary">{log.summary}</Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        )}
      </Section>

      <Section
        title="Document access log"
        description="Every view, download and denied attempt on a document in this data room."
      >
        {accessLogs.length === 0 ? (
          <Card><EmptyState title="No document access recorded yet" /></Card>
        ) : (
          <Table>
            <thead>
              <tr><Th>When</Th><Th>Document</Th><Th>Who</Th><Th>Organisation</Th><Th>Action</Th><Th>Address</Th></tr>
            </thead>
            <tbody>
              {accessLogs.map((log) => (
                <Tr key={log.id}>
                  <Td className="whitespace-nowrap text-ink-muted">{formatDateTime(log.created_at)}</Td>
                  <Td className="max-w-64 truncate text-ink">{documentName.get(log.document_id) ?? 'Removed document'}</Td>
                  <Td className="whitespace-nowrap text-ink-secondary">{userName.get(log.user_id) ?? 'Unknown'}</Td>
                  <Td className="whitespace-nowrap text-ink-secondary">{companyName.get(log.company_id) ?? 'Unknown'}</Td>
                  <Td>
                    <Badge tone={log.action === 'denied' ? 'critical' : log.action === 'download' ? 'accent' : 'neutral'}>
                      {titleize(log.action)}
                    </Badge>
                  </Td>
                  <Td className="font-mono text-[11px] text-ink-muted">{log.ip ?? '—'}</Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        )}
      </Section>
    </div>
  )
}

export const dynamic = 'force-dynamic'
