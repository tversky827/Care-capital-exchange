import 'server-only'
import { db } from '@/db'
import { subjectOf } from '@/lib/access'
import { canViewDeal, canViewDealIdentity, canViewDocument, canViewThread } from '@/lib/policy'
import { anonymizedLabel } from '@/lib/deal/display'
import { titleize } from '@/lib/utils/format'
import type { Actor } from '@/lib/auth/session'

/**
 * Permission-aware global search.
 *
 * Results are filtered through the same policy functions that gate the pages
 * themselves. A search must never be a side channel that confirms the existence
 * of a deal, document or thread the user cannot open — so filtering happens
 * after loading and before anything is returned, and anonymized deals are
 * returned under their anonymized label.
 */

export type SearchKind = 'deal' | 'facility' | 'company' | 'document' | 'lender' | 'message'

export interface SearchResult {
  kind: SearchKind
  id: string
  title: string
  subtitle: string
  href: string
}

export async function globalSearch(actor: Actor, query: string, limit = 20): Promise<SearchResult[]> {
  const term = query.trim().toLowerCase()
  if (term.length < 2) return []

  const store = await db()
  const subject = subjectOf(actor)
  const results: SearchResult[] = []
  const matches = (value: string | null | undefined) => Boolean(value?.toLowerCase().includes(term))

  const [deals, facilities, distributions] = await Promise.all([
    store.select('deals', {}),
    store.select('facilities', {}),
    actor.lender
      ? store.select('deal_distributions', { where: { lender_id: actor.lender.id } })
      : Promise.resolve([]),
  ])
  const distributionByDeal = new Map(distributions.map((d) => [d.deal_id, d]))

  const visibleDeals = deals.filter((deal) =>
    canViewDeal(subject, deal, { distribution: distributionByDeal.get(deal.id) ?? null }),
  )

  for (const deal of visibleDeals) {
    const facility = facilities.find((f) => f.deal_id === deal.id) ?? null
    const canSeeIdentity = canViewDealIdentity(subject, deal, {
      distribution: distributionByDeal.get(deal.id) ?? null,
    })
    const label = canSeeIdentity ? facility?.name ?? deal.name : anonymizedLabel(deal, facility)
    // Only search identifying text the actor is entitled to see.
    const haystack = canSeeIdentity
      ? [deal.name, deal.reference, facility?.name, facility?.city, facility?.state]
      : [deal.reference, facility?.state, titleize(deal.asset_type)]

    if (haystack.some(matches)) {
      results.push({
        kind: 'deal',
        id: deal.id,
        title: label,
        subtitle: `${deal.reference} · ${titleize(deal.transaction_type)} · ${titleize(deal.status)}`,
        href: actor.isLender && deal.company_id !== actor.company.id ? `/lender/deals/${deal.id}` : `/deals/${deal.id}`,
      })
    }
    if (canSeeIdentity && facility && (matches(facility.city) || matches(facility.name))) {
      results.push({
        kind: 'facility',
        id: facility.id,
        title: facility.name,
        subtitle: [facility.city, facility.state].filter(Boolean).join(', '),
        href: `/deals/${deal.id}/overview`,
      })
    }
  }

  const visibleDealIds = new Set(visibleDeals.map((d) => d.id))

  const documents = await store.select('documents', { where: { deleted_at: { isNull: true } } })
  for (const document of documents) {
    if (!visibleDealIds.has(document.deal_id)) continue
    if (!matches(document.display_name) && !matches(document.filename)) continue
    const deal = visibleDeals.find((d) => d.id === document.deal_id)!
    const allowed = canViewDocument(subject, document, deal, {
      distribution: distributionByDeal.get(deal.id) ?? null,
    })
    if (!allowed) continue
    results.push({
      kind: 'document',
      id: document.id,
      title: document.display_name,
      subtitle: `${titleize(document.doc_type)} · ${titleize(document.category)}`,
      href: actor.isLender && deal.company_id !== actor.company.id
        ? `/lender/deals/${deal.id}/documents`
        : `/deals/${deal.id}/documents`,
    })
  }

  const threads = await store.select('message_threads', {})
  for (const thread of threads) {
    if (!visibleDealIds.has(thread.deal_id)) continue
    if (!matches(thread.subject)) continue
    const deal = visibleDeals.find((d) => d.id === thread.deal_id)!
    if (!canViewThread(subject, thread, deal)) continue
    results.push({
      kind: 'message',
      id: thread.id,
      title: thread.subject,
      subtitle: `Q&A thread · ${titleize(thread.status)}`,
      href: actor.isLender && deal.company_id !== actor.company.id
        ? `/lender/deals/${deal.id}`
        : `/deals/${deal.id}/messages`,
    })
  }

  // Lender directory is visible to borrowers and admins, not to rival lenders.
  if (!actor.isLender || actor.isAdmin) {
    const lenders = await store.select('lenders', { where: { verification_status: 'verified' } })
    for (const lender of lenders) {
      if (!matches(lender.institution_name) && !matches(lender.description)) continue
      results.push({
        kind: 'lender',
        id: lender.id,
        title: lender.institution_name,
        subtitle: titleize(lender.institution_type),
        href: `/lenders/${lender.id}`,
      })
    }
  }

  if (actor.isAdmin) {
    const companies = await store.select('companies', {})
    for (const company of companies) {
      if (!matches(company.name)) continue
      results.push({
        kind: 'company',
        id: company.id,
        title: company.name,
        subtitle: `${titleize(company.type)} organisation`,
        href: `/admin/companies`,
      })
    }
  }

  // Deduplicate by kind+id, then prefer earlier (more relevant) kinds.
  const seen = new Set<string>()
  return results
    .filter((result) => {
      const key = `${result.kind}:${result.id}`
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
    .slice(0, limit)
}
