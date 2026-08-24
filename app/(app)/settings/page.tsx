import type { Metadata } from 'next'
import { db } from '@/db'
import { requireActor } from '@/lib/auth/session'
import { subjectOf } from '@/lib/access'
import { canManageCompany } from '@/lib/policy'
import { billingHistory, PLAN_CATALOG, subscriptionFor } from '@/services/billing'
import { Alert, Badge, CardBody, PageHeader, Section, Table, Td, Th, Tr } from '@/components/ui/primitives'
import { CompanyForm, NotificationForm, PasswordForm, ProfileForm } from './forms'
import { formatCurrency, formatDate, titleize } from '@/lib/utils/format'

export const metadata: Metadata = { title: 'Settings' }

export default async function SettingsPage() {
  const actor = await requireActor()
  const store = await db()

  const [members, users, subscription, billing] = await Promise.all([
    store.select('company_members', { where: { company_id: actor.company.id } }),
    store.select('users', {}),
    subscriptionFor(actor.company.id),
    billingHistory(actor.company.id),
  ])

  const canManage = canManageCompany(subjectOf(actor), actor.company.id)
  const plan = subscription ? PLAN_CATALOG.find((entry) => entry.key === subscription.plan_key) : null

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <PageHeader eyebrow={actor.company.name} title="Settings" />

      <Section title="Your profile" className="scroll-mt-20" >
        <CardBody>
          <div id="profile" />
          <ProfileForm
            user={{ full_name: actor.user.full_name, title: actor.user.title, phone: actor.user.phone, email: actor.user.email }}
          />
        </CardBody>
      </Section>

      <Section title="Password">
        <CardBody><PasswordForm /></CardBody>
      </Section>

      <Section
        title="Multi-factor authentication"
        description="Required for lender and administrator accounts."
      >
        <CardBody>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-[13px] text-ink">
                Status: <Badge tone={actor.user.mfa_enabled ? 'positive' : actor.user.mfa_required ? 'warning' : 'neutral'}>
                  {actor.user.mfa_enabled ? 'Enabled' : actor.user.mfa_required ? 'Required, not enabled' : 'Not enabled'}
                </Badge>
              </p>
            </div>
          </div>
          <Alert tone="neutral" className="mt-3">
            Multi-factor enrolment is modelled on the account but no authenticator is wired up in this
            environment. Saying it is on when it is not would be worse than saying so plainly. See the
            known limitations in the README.
          </Alert>
        </CardBody>
      </Section>

      <Section title="Notification preferences">
        <CardBody>
          <NotificationForm
            preferences={actor.user.notification_preferences}
          />
        </CardBody>
      </Section>

      <Section title="Organisation">
        <CardBody>
          {canManage ? (
            <CompanyForm
              company={{
                name: actor.company.name,
                website: actor.company.website,
                description: actor.company.description,
                address_line1: actor.company.address_line1,
                city: actor.company.city,
                state: actor.company.state,
                zip: actor.company.zip,
              }}
            />
          ) : (
            <Alert tone="neutral">Only an owner or organisation administrator can edit these details.</Alert>
          )}
        </CardBody>
      </Section>

      <Section title="Team" description={`${members.length} member${members.length === 1 ? '' : 's'}.`}>
        <Table>
          <thead><tr><Th>Name</Th><Th>Email</Th><Th>Role</Th><Th>Status</Th></tr></thead>
          <tbody>
            {members.map((member) => {
              const user = users.find((entry) => entry.id === member.user_id)
              return (
                <Tr key={member.id}>
                  <Td className="font-medium text-ink">{user?.full_name ?? 'Unknown'}</Td>
                  <Td className="text-ink-secondary">{user?.email}</Td>
                  <Td><Badge tone={member.role === 'owner' ? 'accent' : 'neutral'}>{titleize(member.role)}</Badge></Td>
                  <Td><Badge tone={user?.status === 'active' ? 'positive' : 'critical'}>{titleize(user?.status ?? 'unknown')}</Badge></Td>
                </Tr>
              )
            })}
          </tbody>
        </Table>
      </Section>

      <Section title="Plan and billing">
        <CardBody>
          {plan ? (
            <div className="flex flex-wrap items-baseline justify-between gap-3 border-b border-line pb-3">
              <div>
                <p className="text-[14px] font-semibold text-ink">{plan.name}</p>
                <p className="text-[12px] text-ink-muted">
                  {subscription?.seats} seats ·{' '}
                  {subscription?.current_period_end ? `renews ${formatDate(subscription.current_period_end)}` : 'no renewal date'}
                </p>
              </div>
              <Badge tone={subscription?.status === 'active' ? 'positive' : 'warning'}>
                {titleize(subscription?.status ?? 'none')}
              </Badge>
            </div>
          ) : (
            <p className="text-[13px] text-ink-secondary">No subscription on this organisation.</p>
          )}

          {billing.length > 0 ? (
            <Table className="mt-3">
              <thead><tr><Th>Date</Th><Th>Description</Th><Th>Type</Th><Th numeric>Amount</Th></tr></thead>
              <tbody>
                {billing.map((event) => (
                  <Tr key={event.id}>
                    <Td className="whitespace-nowrap text-ink-muted">{formatDate(event.created_at)}</Td>
                    <Td className="text-ink-secondary">{event.description}</Td>
                    <Td><Badge tone="neutral">{titleize(event.kind)}</Badge></Td>
                    <Td numeric>{formatCurrency(event.amount_usd, { decimals: 2 })}</Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
          ) : null}

          <Alert tone="neutral" className="mt-3">
            No payment provider is configured in this environment, so subscriptions and fees are
            recorded locally rather than charged. The billing interface is Stripe-shaped; wiring a
            provider does not change any other part of the product.
          </Alert>
        </CardBody>
      </Section>
    </div>
  )
}

export const dynamic = 'force-dynamic'
