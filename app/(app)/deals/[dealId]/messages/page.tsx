import { notFound } from 'next/navigation'
import { db } from '@/db'
import { requireActor } from '@/lib/auth/session'
import { requireDealAccess } from '@/lib/deal-access'

import { threadsForDeal } from '@/services/messages'
import { Badge, Card, CardBody, EmptyState, Section } from '@/components/ui/primitives'
import { MessageComposer, NewThread } from './composer'
import { formatRelative, initials, titleize } from '@/lib/utils/format'

/**
 * Deal Q&A.
 *
 * Threads are scoped to their participants: a lender question is visible to the
 * borrower and that lender only. Contact details are never exchanged — the
 * thread is the channel.
 */
export default async function MessagesPage({ params }: { params: Promise<{ dealId: string }> }) {
  const { dealId } = await params
  // Authorizes and produces a 404 the framework reports correctly.
  await requireDealAccess(dealId)
  const actor = await requireActor()

  const store = await db()
  const deal = await store.findById('deals', dealId)
  if (!deal) notFound()

  const [threads, users, companies, lenders] = await Promise.all([
    threadsForDeal(actor, dealId),
    store.select('users', {}),
    store.select('companies', {}),
    store.select('lenders', {}),
  ])

  const userName = new Map(users.map((user) => [user.id, user.full_name]))
  const companyName = new Map(
    companies.map((company) => {
      const lender = lenders.find((entry) => entry.company_id === company.id)
      return [company.id, lender?.institution_name ?? company.name]
    }),
  )

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-[17px] font-semibold text-ink">Deal Q&amp;A</h2>
          <p className="mt-0.5 max-w-3xl text-[12px] leading-relaxed text-ink-secondary">
            Each thread is visible only to its participants — a question from one lender is never
            visible to another. Contact details are not exchanged; the platform carries the
            conversation.
          </p>
        </div>
        <NewThread dealId={dealId} />
      </div>

      {threads.length === 0 ? (
        <Card>
          <EmptyState
            title="No questions yet"
            description="When a lender reviewing this deal needs something — agency labour detail, a staffing plan, an updated census — the question and your answer live here, attached to the deal."
          />
        </Card>
      ) : (
        <div className="space-y-3">
          {threads.map(({ thread, messages }) => (
            <Section
              key={thread.id}
              title={thread.subject}
              description={
                <>
                  <Badge tone={thread.status === 'open' ? 'warning' : 'positive'}>{titleize(thread.status)}</Badge>
                  <span className="ml-2">{titleize(thread.kind)}</span>
                  <span className="ml-2 text-ink-muted">
                    {thread.participant_company_ids.map((id) => companyName.get(id) ?? 'Unknown').join(' · ')}
                  </span>
                </>
              }
            >
              <ul className="divide-y divide-line">
                {messages.map((message) => {
                  const mine = message.author_company_id === actor.company.id
                  return (
                    <li key={message.id} className="flex gap-3 px-4 py-3">
                      <span
                        className={`flex size-7 shrink-0 items-center justify-center text-[10px] font-semibold rounded-[2px] ${
                          mine ? 'bg-accent text-white' : 'bg-surface-sunken text-ink-secondary'
                        }`}
                      >
                        {initials(userName.get(message.author_id) ?? '??')}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-[12px]">
                          <span className="font-medium text-ink">{userName.get(message.author_id) ?? 'Unknown'}</span>
                          <span className="ml-1.5 text-ink-muted">
                            {companyName.get(message.author_company_id) ?? ''} · {formatRelative(message.created_at)}
                          </span>
                        </p>
                        <p className="mt-1 whitespace-pre-wrap text-[13px] leading-relaxed text-ink-secondary">
                          {message.body}
                        </p>
                      </div>
                    </li>
                  )
                })}
              </ul>
              <CardBody className="border-t border-line bg-surface-sunken/50">
                <MessageComposer dealId={dealId} threadId={thread.id} />
              </CardBody>
            </Section>
          ))}
        </div>
      )}
    </div>
  )
}

export const dynamic = 'force-dynamic'
