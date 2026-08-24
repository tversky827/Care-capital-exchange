import Link from 'next/link'
import type { Metadata } from 'next'
import { db } from '@/db'
import { requireAdmin } from '@/lib/auth/session'
import { Alert, Badge, PageHeader, Section, Table, Td, Th, Tr } from '@/components/ui/primitives'
import { formatDateTime } from '@/lib/utils/format'

export const metadata: Metadata = { title: 'Audit log' }

export default async function AdminAuditPage({
  searchParams,
}: {
  searchParams: Promise<{ action?: string; actor?: string }>
}) {
  await requireAdmin()
  const params = await searchParams
  const store = await db()

  const [logs, users, companies, deals] = await Promise.all([
    store.select('audit_logs', { orderBy: { field: 'created_at', dir: 'desc' }, limit: 500 }),
    store.select('users', {}),
    store.select('companies', {}),
    store.select('deals', {}),
  ])

  const userName = new Map(users.map((user) => [user.id, user.full_name]))
  const companyName = new Map(companies.map((company) => [company.id, company.name]))
  const dealRef = new Map(deals.map((deal) => [deal.id, deal.reference]))

  const filtered = logs.filter((log) => {
    if (params.action && log.action !== params.action) return false
    if (params.actor && log.actor_id !== params.actor) return false
    return true
  })

  const actions = [...new Set(logs.map((log) => log.action))].sort()

  return (
    <div className="space-y-4">
      <PageHeader
        eyebrow="Platform operations"
        title="Audit log"
        description="Every material event on the platform. Append-only — records cannot be edited or deleted by any role."
      />

      <Alert tone="neutral">
        Under the Supabase driver, <code className="font-mono">audit_logs</code> has no UPDATE or
        DELETE policy for any role, so history is immutable even to a client talking to PostgREST
        directly. The local driver enforces the same rule at the store layer.
      </Alert>

      <div className="flex flex-wrap gap-1.5">
        <Link
          href="/admin/audit"
          className={`border px-2.5 py-1 text-[12px] rounded-[3px] ${!params.action ? 'border-accent bg-accent-soft text-accent' : 'border-line bg-surface text-ink-secondary hover:bg-surface-sunken'}`}
        >
          All actions
        </Link>
        {actions.slice(0, 24).map((action) => (
          <Link
            key={action}
            href={`/admin/audit?action=${encodeURIComponent(action)}`}
            className={`border px-2.5 py-1 text-[12px] rounded-[3px] ${params.action === action ? 'border-accent bg-accent-soft text-accent' : 'border-line bg-surface text-ink-secondary hover:bg-surface-sunken'}`}
          >
            {action}
          </Link>
        ))}
      </div>

      <Section title={`Events (${filtered.length})`}>
        <Table>
          <thead>
            <tr><Th>When</Th><Th>Actor</Th><Th>Organisation</Th><Th>Action</Th><Th>Deal</Th><Th>Summary</Th><Th>Address</Th></tr>
          </thead>
          <tbody>
            {filtered.slice(0, 300).map((log) => (
              <Tr key={log.id}>
                <Td className="whitespace-nowrap text-ink-muted">{formatDateTime(log.created_at)}</Td>
                <Td className="whitespace-nowrap text-ink-secondary">
                  {log.actor_id ? userName.get(log.actor_id) ?? 'Unknown' : 'Platform'}
                </Td>
                <Td className="max-w-48 truncate text-ink-secondary">
                  {log.actor_company_id ? companyName.get(log.actor_company_id) ?? '—' : '—'}
                </Td>
                <Td><Badge tone="neutral">{log.action}</Badge></Td>
                <Td>
                  {log.deal_id ? (
                    <Link href={`/deals/${log.deal_id}`} className="text-accent hover:underline">
                      {dealRef.get(log.deal_id) ?? '—'}
                    </Link>
                  ) : (
                    <span className="text-ink-muted">—</span>
                  )}
                </Td>
                <Td className="max-w-96 text-[12px] text-ink-secondary">{log.summary}</Td>
                <Td className="font-mono text-[11px] text-ink-muted">{log.ip ?? '—'}</Td>
              </Tr>
            ))}
          </tbody>
        </Table>
      </Section>
    </div>
  )
}

export const dynamic = 'force-dynamic'
