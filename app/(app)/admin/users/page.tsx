import type { Metadata } from 'next'
import { db } from '@/db'
import { requireAdmin } from '@/lib/auth/session'
import { Badge, PageHeader, Section, Table, Td, Th, Tr } from '@/components/ui/primitives'
import { StatusControl } from './status-control'
import { formatDate, formatRelative, titleize } from '@/lib/utils/format'

export const metadata: Metadata = { title: 'Users & companies' }

export default async function AdminUsersPage() {
  const actor = await requireAdmin()
  const store = await db()

  const [users, companies, members, deals] = await Promise.all([
    store.select('users', { orderBy: { field: 'created_at', dir: 'desc' } }),
    store.select('companies', { orderBy: { field: 'created_at', dir: 'desc' } }),
    store.select('company_members', {}),
    store.select('deals', {}),
  ])

  const companyName = new Map(companies.map((company) => [company.id, company.name]))

  return (
    <div className="space-y-4">
      <PageHeader
        eyebrow="Platform operations"
        title="Users & organisations"
        description="Suspension is reversible and never removes data — an account that transacted stays on the record."
      />

      <Section title={`Organisations (${companies.length})`}>
        <Table>
          <thead>
            <tr><Th>Name</Th><Th>Type</Th><Th numeric>Members</Th><Th numeric>Deals</Th><Th>Created</Th><Th>Status</Th><Th className="w-48" /></tr>
          </thead>
          <tbody>
            {companies.map((company) => (
              <Tr key={company.id}>
                <Td className="font-medium text-ink">{company.name}</Td>
                <Td><Badge tone={company.type === 'lender' ? 'accent' : company.type === 'admin' ? 'neutral' : 'positive'}>{titleize(company.type)}</Badge></Td>
                <Td numeric>{members.filter((member) => member.company_id === company.id).length}</Td>
                <Td numeric>{deals.filter((deal) => deal.company_id === company.id).length || '—'}</Td>
                <Td className="whitespace-nowrap text-ink-muted">{formatDate(company.created_at)}</Td>
                <Td><Badge tone={company.status === 'active' ? 'positive' : 'critical'}>{titleize(company.status)}</Badge></Td>
                <Td>
                  {company.id === actor.company.id ? (
                    <span className="text-[11px] text-ink-muted">Your organisation</span>
                  ) : (
                    <StatusControl kind="company" id={company.id} name={company.name} status={company.status} />
                  )}
                </Td>
              </Tr>
            ))}
          </tbody>
        </Table>
      </Section>

      <Section title={`Users (${users.length})`}>
        <Table>
          <thead>
            <tr><Th>Name</Th><Th>Email</Th><Th>Role</Th><Th>Organisation</Th><Th>MFA</Th><Th>Last sign-in</Th><Th>Status</Th><Th className="w-48" /></tr>
          </thead>
          <tbody>
            {users.map((user) => {
              const membership = members.find((member) => member.user_id === user.id)
              return (
                <Tr key={user.id}>
                  <Td className="font-medium text-ink">
                    {user.full_name}
                    {user.title ? <span className="block text-[11px] text-ink-muted">{user.title}</span> : null}
                  </Td>
                  <Td className="text-ink-secondary">{user.email}</Td>
                  <Td><Badge tone="neutral">{titleize(user.role)}</Badge></Td>
                  <Td className="text-ink-secondary">{membership ? companyName.get(membership.company_id) : '—'}</Td>
                  <Td>
                    <Badge tone={user.mfa_enabled ? 'positive' : user.mfa_required ? 'warning' : 'neutral'}>
                      {user.mfa_enabled ? 'On' : user.mfa_required ? 'Required' : 'Off'}
                    </Badge>
                  </Td>
                  <Td className="whitespace-nowrap text-ink-muted">
                    {user.last_login_at ? formatRelative(user.last_login_at) : 'Never'}
                  </Td>
                  <Td><Badge tone={user.status === 'active' ? 'positive' : 'critical'}>{titleize(user.status)}</Badge></Td>
                  <Td>
                    {user.id === actor.user.id ? (
                      <span className="text-[11px] text-ink-muted">You</span>
                    ) : (
                      <StatusControl kind="user" id={user.id} name={user.full_name} status={user.status} />
                    )}
                  </Td>
                </Tr>
              )
            })}
          </tbody>
        </Table>
      </Section>
    </div>
  )
}

export const dynamic = 'force-dynamic'
