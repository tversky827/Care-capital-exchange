import 'server-only'
import { notFound, redirect } from 'next/navigation'
import { requireActor } from '@/lib/auth/session'
import { loadDealForActor, type DealAccess } from '@/lib/access'
import { ForbiddenError } from '@/lib/policy'

/**
 * Page-level access gate for the borrower deal workspace.
 *
 * `notFound()` produces a 404 when it is thrown from a page but only a 200 when
 * it is thrown from a layout, so the authoritative gate lives here and every
 * deal page calls it first. The deal layout performs the same check separately
 * to decide whether it may render the deal header — neither alone is enough:
 * the layout check prevents any deal data appearing around a not-found
 * boundary, and this one produces the correct HTTP status.
 *
 * It lives in its own module because `next/navigation` must be imported
 * statically for the framework to recognise these control-flow signals, and
 * `lib/access.ts` is also imported outside the request lifecycle.
 */
export async function requireDealAccess(dealId: string): Promise<DealAccess> {
  const actor = await requireActor()
  // A lender belongs in the lender deal room, which shows only what their
  // institution is entitled to see.
  if (actor.isLender) redirect(`/lender/deals/${dealId}`)
  try {
    return await loadDealForActor(actor, dealId)
  } catch (error) {
    if (error instanceof ForbiddenError) notFound()
    throw error
  }
}
