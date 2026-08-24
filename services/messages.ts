import 'server-only'
import { db } from '@/db'
import { subjectOf } from '@/lib/access'
import { authorize, canPostToThread, canViewThread } from '@/lib/policy'
import { recordAudit } from './audit'
import { notify } from './notifications'
import type { Actor } from '@/lib/auth/session'
import type { DataRequest, Message, MessageThread } from '@/types'

/**
 * Deal Q&A.
 *
 * A lender question opens a thread whose participants are exactly the borrower
 * and that one lender — competing lenders never see it, and the participant
 * list is the enforcement point in both this layer and RLS.
 *
 * Contact details are never exchanged: the thread is the channel, which is what
 * keeps both sides' contact information off the other side's screen.
 */

export interface ThreadWithMessages {
  thread: MessageThread
  messages: Message[]
  participants: { id: string; name: string; company: string }[]
}

export async function openThread(
  actor: Actor,
  dealId: string,
  subject: string,
  body: string,
  kind: MessageThread['kind'] = 'lender_question',
): Promise<ThreadWithMessages> {
  const store = await db()
  const deal = await store.findById('deals', dealId)
  if (!deal) throw new Error('Deal not found.')

  const participants = new Set<string>([deal.company_id, actor.company.id])
  const thread = await store.insert('message_threads', {
    deal_id: dealId,
    subject,
    kind,
    participant_company_ids: [...participants],
    lender_id: actor.lender?.id ?? null,
    created_by: actor.user.id,
    status: 'open',
  } as Omit<MessageThread, 'id' | 'created_at' | 'updated_at'>)

  const message = await store.insert('messages', {
    thread_id: thread.id,
    deal_id: dealId,
    author_id: actor.user.id,
    author_company_id: actor.company.id,
    body,
    attachments: [],
  } as Omit<Message, 'id' | 'created_at'>)

  await recordAudit({
    actor,
    action: 'message.thread_opened',
    entityType: 'message_thread',
    entityId: thread.id,
    dealId,
    summary: `${actor.company.name} opened a thread: "${subject}".`,
    metadata: { kind },
  })

  for (const companyId of participants) {
    if (companyId === actor.company.id) continue
    await notify({
      event: actor.isLender ? 'lender.requested_information' : 'message.received',
      companyId,
      dealId,
      title: `${actor.isLender ? actor.lender?.institution_name ?? actor.company.name : actor.company.name}: ${subject}`,
      body: body.slice(0, 240),
      href: actor.isLender ? `/deals/${dealId}/messages` : `/lender/deals/${dealId}`,
    })
  }

  return { thread, messages: [message], participants: [] }
}

export async function postMessage(actor: Actor, threadId: string, body: string): Promise<Message> {
  const store = await db()
  const thread = await store.findById('message_threads', threadId)
  if (!thread) throw new Error('Thread not found.')
  const deal = await store.findById('deals', thread.deal_id)
  if (!deal) throw new Error('Deal not found.')
  authorize(canPostToThread(subjectOf(actor), thread, deal), 'You cannot post to this thread.')

  const message = await store.insert('messages', {
    thread_id: threadId,
    deal_id: thread.deal_id,
    author_id: actor.user.id,
    author_company_id: actor.company.id,
    body,
    attachments: [],
  } as Omit<Message, 'id' | 'created_at'>)

  // A borrower reply answers the question; a lender reply reopens it.
  await store.update('message_threads', threadId, {
    status: actor.company.id === deal.company_id ? 'answered' : 'open',
  })

  for (const companyId of thread.participant_company_ids) {
    if (companyId === actor.company.id) continue
    await notify({
      event: 'message.received',
      companyId,
      dealId: thread.deal_id,
      title: `Reply on "${thread.subject}"`,
      body: body.slice(0, 240),
      href: companyId === deal.company_id ? `/deals/${thread.deal_id}/messages` : `/lender/deals/${thread.deal_id}`,
    })
  }

  return message
}

export async function threadsForDeal(actor: Actor, dealId: string): Promise<ThreadWithMessages[]> {
  const store = await db()
  const deal = await store.findById('deals', dealId)
  if (!deal) return []
  const subject = subjectOf(actor)

  const [threads, messages, users, companies] = await Promise.all([
    store.select('message_threads', { where: { deal_id: dealId }, orderBy: { field: 'updated_at', dir: 'desc' } }),
    store.select('messages', { where: { deal_id: dealId }, orderBy: { field: 'created_at', dir: 'asc' } }),
    store.select('users', {}),
    store.select('companies', {}),
  ])

  return threads
    .filter((thread) => canViewThread(subject, thread, deal))
    .map((thread) => {
      const threadMessages = messages.filter((m) => m.thread_id === thread.id)
      return {
        thread,
        messages: threadMessages,
        participants: [...new Set(threadMessages.map((m) => m.author_id))].map((userId) => {
          const user = users.find((u) => u.id === userId)
          const company = companies.find((c) => c.id === user?.id)
          return {
            id: userId,
            name: user?.full_name ?? 'Unknown',
            company: companies.find((c) => c.id === threadMessages.find((m) => m.author_id === userId)?.author_company_id)?.name ?? company?.name ?? '',
          }
        }),
      }
    })
}

// ---------------------------------------------------------------------------
// Data requests
// ---------------------------------------------------------------------------

export async function createDataRequests(
  actor: Actor,
  dealId: string,
  items: { label: string; detail?: string | null; docType: DataRequest['doc_type']; source?: DataRequest['source'] }[],
  lenderId?: string | null,
): Promise<DataRequest[]> {
  const store = await db()
  const deal = await store.findById('deals', dealId)
  if (!deal) throw new Error('Deal not found.')

  const existing = await store.select('data_requests', { where: { deal_id: dealId, status: 'open' } })
  const fresh = items.filter((item) => !existing.some((e) => e.label === item.label))
  if (!fresh.length) return []

  const created = await store.insertMany(
    'data_requests',
    fresh.map((item) => ({
      deal_id: dealId,
      lender_id: lenderId ?? actor.lender?.id ?? null,
      requested_by: actor.user.id,
      label: item.label,
      detail: item.detail ?? null,
      doc_type: item.docType,
      source: item.source ?? 'manual',
      status: 'open' as const,
      fulfilled_document_id: null,
    })) as Omit<DataRequest, 'id' | 'created_at' | 'updated_at'>[],
  )

  await recordAudit({
    actor,
    action: 'data_request.created',
    entityType: 'deal',
    entityId: dealId,
    dealId,
    summary: `${actor.company.name} requested ${created.length} item${created.length === 1 ? '' : 's'} from the borrower.`,
    metadata: { items: fresh.map((i) => i.label) },
  })

  await notify({
    event: 'lender.requested_information',
    companyId: deal.company_id,
    dealId,
    title: `${created.length} document${created.length === 1 ? '' : 's'} requested`,
    body: fresh.map((i) => i.label).slice(0, 4).join(', '),
    href: `/deals/${dealId}/documents`,
  })

  return created
}

export async function dataRequestsForDeal(dealId: string): Promise<DataRequest[]> {
  const store = await db()
  return store.select('data_requests', {
    where: { deal_id: dealId },
    orderBy: { field: 'created_at', dir: 'desc' },
  })
}

/** Closes any open request that the newly uploaded document satisfies. */
export async function fulfilDataRequests(dealId: string, documentId: string, docType: string): Promise<number> {
  const store = await db()
  const open = await store.select('data_requests', { where: { deal_id: dealId, status: 'open' } })
  const matching = open.filter((request) => request.doc_type === docType)
  for (const request of matching) {
    await store.update('data_requests', request.id, { status: 'fulfilled', fulfilled_document_id: documentId })
  }
  return matching.length
}
