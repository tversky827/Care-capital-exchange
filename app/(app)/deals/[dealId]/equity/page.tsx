import Link from 'next/link'
import { db } from '@/db'
import { requireDealAccess } from '@/lib/deal-access'
import { requireActor } from '@/lib/auth/session'
import { formatCurrency, formatDate, formatPercent, titleize } from '@/lib/utils/format'
import {
  Alert, Badge, Button, Card, CardBody, EmptyState, Section, Stat,
  Table, Td, Th, Tr,
} from '@/components/ui/primitives'
import { capitalRequirement } from '@/services/equity/capital-stack'
import { matchCountsForOffering } from '@/services/equity/matching'
import { questionsFor } from '@/services/equity/portfolio'
import { OfferingControls, QuestionReply } from './controls'
import { UpdatesPanel } from './updates'
import { updatesForOffering } from '@/services/equity/updates'

export const dynamic = 'force-dynamic'

/**
 * The sponsor's view of its own raise.
 *
 * Shows progress, who has engaged and what they have asked. Investor
 * identities appear here — they are this sponsor's own investors — but nothing
 * about their dealings elsewhere does.
 */
export default async function EquityPage({
  params,
}: {
  params: Promise<{ dealId: string }>
}) {
  const { dealId } = await params
  await requireDealAccess(dealId)
  const actor = await requireActor()
  const store = await db()

  const [offerings, requirement] = await Promise.all([
    store.select('offerings', { where: { deal_id: dealId }, orderBy: { field: 'created_at' } }),
    capitalRequirement(dealId),
  ])

  if (offerings.length === 0) {
    return (
      <div className="space-y-4">
        <EmptyState
          title="No equity offering on this deal"
          description={
            requirement.equityRequired
              ? `This deal needs ${formatCurrency(requirement.equityRequired)} of equity beyond its debt. An offering lets you raise it from investors on the platform.`
              : 'Create an offering to raise equity from investors on the platform.'
          }
          action={
            <Link href={`/deals/${dealId}/equity/new`}>
              <Button variant="primary">Create an equity offering</Button>
            </Link>
          }
        />
      </div>
    )
  }

  const rows = await Promise.all(offerings.map(async (offering) => {
    const [terms, counts, commitments, interests, questions, updates] = await Promise.all([
      store.selectOne('offering_terms', { where: { offering_id: offering.id } }),
      matchCountsForOffering(offering.id),
      store.select('investment_commitments', { where: { offering_id: offering.id } }),
      store.select('investment_interests', { where: { offering_id: offering.id } }),
      questionsFor(actor, offering.id),
      updatesForOffering(actor, offering.id),
    ])

    const investors = await Promise.all(commitments.map(async (commitment) => ({
      commitment,
      profile: await store.findById('investor_profiles', commitment.investor_id),
    })))

    return { offering, terms, counts, commitments, interests, questions, investors, updates }
  }))

  return (
    <div className="space-y-5">
      {rows.map(({ offering, terms, counts, commitments, interests, questions, investors, updates }) => {
        const progress = offering.target_raise && offering.target_raise > 0
          ? offering.committed_amount / offering.target_raise
          : null
        const accepted = commitments.filter((c) => ['accepted', 'funded'].includes(c.status))
        const pending = commitments.filter((c) => c.status === 'submitted')
        const average = accepted.length > 0
          ? accepted.reduce((sum, c) => sum + c.amount, 0) / accepted.length
          : null
        const largest = accepted.length > 0 ? Math.max(...accepted.map((c) => c.amount)) : null

        return (
          <div key={offering.id} className="space-y-4">
            <Card className="p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-[16px] font-semibold text-ink">{offering.name}</h2>
                    <Badge tone={offering.status === 'live' ? 'positive' : offering.status === 'draft' ? 'neutral' : 'warning'}>
                      {titleize(offering.status)}
                    </Badge>
                  </div>
                  <p className="mt-0.5 text-[12px] text-ink-muted">
                    {offering.reference} · {titleize(offering.offering_type)} ·{' '}
                    {terms?.capital_position ? titleize(terms.capital_position) : 'Common equity'}
                  </p>
                </div>
                <OfferingControls
                  offeringId={offering.id}
                  dealId={dealId}
                  status={offering.status}
                  isAdmin={actor.isAdmin}
                />
              </div>

              <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-5">
                <Stat label="Target raise" value={formatCurrency(offering.target_raise)} />
                <Stat label="Committed" value={formatCurrency(offering.committed_amount)} />
                <Stat
                  label="Remaining"
                  value={offering.target_raise !== null
                    ? formatCurrency(Math.max(0, offering.target_raise - offering.committed_amount))
                    : '—'}
                />
                <Stat label="Investors" value={String(accepted.length)} hint={`${interests.length} engaged`} />
                <Stat label="Matched" value={String(counts.total)} hint={`${counts.strong} strong`} />
              </div>

              {progress !== null ? (
                <div className="mt-3">
                  <div className="flex items-center justify-between text-[11px] text-ink-muted">
                    <span>Raise progress</span>
                    <span className="tabular-nums">{formatPercent(progress * 100)}</span>
                  </div>
                  <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-surface-sunken">
                    <div className="h-full rounded-full bg-accent" style={{ width: `${Math.min(100, progress * 100)}%` }} />
                  </div>
                </div>
              ) : null}

              {average !== null ? (
                <p className="mt-3 text-[11px] text-ink-muted">
                  Average investment {formatCurrency(average)} · largest {formatCurrency(largest)}
                </p>
              ) : null}
            </Card>

            {pending.length > 0 ? (
              <Section title="Commitments awaiting your decision">
                <CardBody className="overflow-x-auto p-0">
                  <Table>
                    <thead>
                      <Tr><Th>Investor</Th><Th numeric>Amount</Th><Th>Submitted</Th><Th /></Tr>
                    </thead>
                    <tbody>
                      {investors.filter((i) => i.commitment.status === 'submitted').map(({ commitment, profile }) => (
                        <Tr key={commitment.id}>
                          <Td>{profile?.display_name ?? 'Investor'}</Td>
                          <Td numeric>{formatCurrency(commitment.amount)}</Td>
                          <Td>{commitment.submitted_at ? formatDate(commitment.submitted_at) : '—'}</Td>
                          <Td>
                            <OfferingControls
                              commitmentId={commitment.id}
                              dealId={dealId}
                              offeringId={offering.id}
                              status={offering.status}
                              isAdmin={actor.isAdmin}
                              mode="commitment"
                            />
                          </Td>
                        </Tr>
                      ))}
                    </tbody>
                  </Table>
                </CardBody>
              </Section>
            ) : null}

            {accepted.length > 0 ? (
              <Section title="Investors in this offering">
                <CardBody className="overflow-x-auto p-0">
                  <Table>
                    <thead>
                      <Tr><Th>Investor</Th><Th numeric>Committed</Th><Th>Status</Th></Tr>
                    </thead>
                    <tbody>
                      {investors.filter((i) => ['accepted', 'funded'].includes(i.commitment.status)).map(({ commitment, profile }) => (
                        <Tr key={commitment.id}>
                          <Td>{profile?.display_name ?? 'Investor'}</Td>
                          <Td numeric>{formatCurrency(commitment.amount)}</Td>
                          <Td><Badge tone="positive">{titleize(commitment.status)}</Badge></Td>
                        </Tr>
                      ))}
                    </tbody>
                  </Table>
                </CardBody>
              </Section>
            ) : null}

            <UpdatesPanel
              offeringId={offering.id}
              dealId={dealId}
              updates={updates}
              investorCount={accepted.length}
            />

            {questions.length > 0 ? (
              <Section title="Investor questions">
                <CardBody className="space-y-3">
                  {questions.map(({ question, answers }) => (
                    <div key={question.id} className="border-b border-line pb-3 last:border-b-0 last:pb-0">
                      <p className="text-[13px] text-ink">{question.body}</p>
                      {answers.map((answer) => (
                        <p key={answer.id} className="mt-1.5 border-l-2 border-line pl-3 text-[12px] text-ink-secondary">
                          {answer.body}
                        </p>
                      ))}
                      {answers.length === 0 ? (
                        <QuestionReply questionId={question.id} dealId={dealId} />
                      ) : null}
                    </div>
                  ))}
                </CardBody>
              </Section>
            ) : null}
          </div>
        )
      })}

      <Alert tone="neutral">
        An offering becomes visible to investors only after an administrator publishes it. Nothing
        on this page constitutes an offer of securities, and CareCapital Exchange does not act as
        a broker-dealer or funding portal.
      </Alert>

      <Link href={`/deals/${dealId}/equity/new`}>
        <Button>Create another offering</Button>
      </Link>
    </div>
  )
}
