import 'server-only'
import { db } from '@/db'
import { subjectOf } from '@/lib/access'
import { authorize, canViewOfferingDocument, investorAccessLevel } from '@/lib/policy'
import { recordAudit } from '../audit'
import { requireOffering } from './offerings'
import type { Actor } from '@/lib/auth/session'
import type { DocumentRecord } from '@/types'
import type {
  InvestmentStage, Offering, OfferingAccessLevel, OfferingDocument, OfferingDocumentCategory,
} from '@/types/equity'

/**
 * The offering data room.
 *
 * Documents are not copied into an offering — they are the deal's documents,
 * published at a chosen access level. That keeps one set of bytes, one audit
 * trail, and one download path with authorization already built into it.
 *
 * Access is a ladder. An investor stands on the rung their engagement with
 * *this* offering has earned, and sees everything at or below it. Interest in
 * one offering never opens another's material.
 */

export interface DataRoomEntry {
  entry: OfferingDocument
  document: DocumentRecord
  /** Whether the requesting actor may open it. */
  accessible: boolean
}

/** Publishes a deal document into an offering at an access level. */
export async function publishDocument(
  actor: Actor,
  offeringId: string,
  documentId: string,
  input: {
    category: OfferingDocumentCategory
    accessLevel: OfferingAccessLevel
    displayName?: string
  },
): Promise<OfferingDocument> {
  const store = await db()
  const offering = await requireOffering(offeringId)
  authorize(
    offering.company_id === actor.company.id || actor.isAdmin,
    'Only the sponsor can publish documents to this offering.',
  )
  const document = await store.findById('documents', documentId)
  if (!document) throw new Error('Document not found.')
  authorize(
    document.deal_id === offering.deal_id,
    'A document can only be published to an offering on its own deal.',
  )

  const existing = await store.selectOne('offering_documents', {
    where: { offering_id: offeringId, document_id: documentId },
  })
  if (existing) {
    return store.update('offering_documents', existing.id, {
      category: input.category,
      access_level: input.accessLevel,
      display_name: input.displayName ?? existing.display_name,
    } as Partial<OfferingDocument>)
  }

  const count = await store.count('offering_documents', { where: { offering_id: offeringId } })
  const entry = await store.insert('offering_documents', {
    offering_id: offeringId,
    document_id: documentId,
    category: input.category,
    access_level: input.accessLevel,
    display_name: input.displayName ?? document.display_name,
    sort_order: count,
  } as Omit<OfferingDocument, 'id' | 'created_at' | 'updated_at'>)

  await recordAudit({
    actor, action: 'offering.document_published', entityType: 'offering', entityId: offeringId,
    dealId: offering.deal_id,
    summary: `${entry.display_name} published to ${offering.reference} at ${input.accessLevel}.`,
  })
  return entry
}

export async function removeDocument(actor: Actor, entryId: string): Promise<void> {
  const store = await db()
  const entry = await store.findById('offering_documents', entryId)
  if (!entry) return
  const offering = await requireOffering(entry.offering_id)
  authorize(
    offering.company_id === actor.company.id || actor.isAdmin,
    'Only the sponsor can withdraw a document from this offering.',
  )
  await store.remove('offering_documents', entryId)
  await recordAudit({
    actor, action: 'offering.document_withdrawn', entityType: 'offering', entityId: offering.id,
    dealId: offering.deal_id, summary: `${entry.display_name} was withdrawn from ${offering.reference}.`,
  })
}

/** The stage this actor has reached on an offering, for access decisions. */
export async function stageFor(actor: Actor, offeringId: string): Promise<InvestmentStage | null> {
  if (!actor.investor) return null
  const store = await db()
  const interest = await store.selectOne('investment_interests', {
    where: { offering_id: offeringId, investor_id: actor.investor.id },
  })
  return interest?.stage ?? null
}

/**
 * The data room as this actor may see it.
 *
 * Entries above the actor's access level are omitted entirely rather than
 * listed as locked: the existence of a document can itself be information.
 */
export async function dataRoomFor(actor: Actor, offeringId: string): Promise<DataRoomEntry[]> {
  const store = await db()
  const offering = await requireOffering(offeringId)
  const [entries, stage] = await Promise.all([
    store.select('offering_documents', {
      where: { offering_id: offeringId }, orderBy: { field: 'sort_order' },
    }),
    stageFor(actor, offeringId),
  ])

  const subject = subjectOf(actor)
  const rows: DataRoomEntry[] = []
  for (const entry of entries) {
    const accessible = canViewOfferingDocument(subject, offering, entry.access_level, stage)
    if (!accessible) continue
    const document = await store.findById('documents', entry.document_id)
    if (!document || document.deleted_at) continue
    rows.push({ entry, document, accessible })
  }
  return rows
}

/**
 * What the investor would gain access to by going further.
 *
 * Shown as counts rather than names, so an investor knows there is more to see
 * without learning what it is before they are entitled to.
 */
export async function lockedCounts(
  actor: Actor,
  offeringId: string,
): Promise<{ level: OfferingAccessLevel; count: number }[]> {
  const store = await db()
  const entries = await store.select('offering_documents', { where: { offering_id: offeringId } })
  const stage = await stageFor(actor, offeringId)
  const reached = investorAccessLevel(stage)
  const order: OfferingAccessLevel[] = [
    'public_teaser', 'verified_investor', 'interested_investor', 'committed_investor', 'closing_investor',
  ]
  const reachedIndex = order.indexOf(reached)

  const counts = new Map<OfferingAccessLevel, number>()
  for (const entry of entries) {
    if (entry.access_level === 'admin_only') continue
    const index = order.indexOf(entry.access_level)
    if (index > reachedIndex) {
      counts.set(entry.access_level, (counts.get(entry.access_level) ?? 0) + 1)
    }
  }
  return [...counts.entries()].map(([level, count]) => ({ level, count }))
}

/** Offerings a document has been published to, for the sponsor's document view. */
export async function offeringsForDocument(documentId: string): Promise<Offering[]> {
  const store = await db()
  const entries = await store.select('offering_documents', { where: { document_id: documentId } })
  const offerings: Offering[] = []
  for (const entry of entries) {
    const offering = await store.findById('offerings', entry.offering_id)
    if (offering) offerings.push(offering)
  }
  return offerings
}
