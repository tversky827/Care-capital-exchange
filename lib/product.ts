import { notFound } from 'next/navigation'
import { isEnabled } from '@/lib/flags'

/**
 * What this deployment presents as the product.
 *
 * The codebase carries two marketplaces. Which of them a person can reach is a
 * deployment decision, not a permission one, so it is answered here rather than
 * in `lib/policy.ts`: policy decides whether *this actor* may see a thing that
 * exists, and this decides whether the thing exists at all.
 *
 * Guarding is per route rather than in one piece of middleware on purpose. A
 * central matcher drifts from the routes it claims to cover — a new debt page
 * is simply missed — whereas a page that asks for its own capability cannot be
 * added without the question being answered.
 */

/** Whether the debt marketplace's own surfaces are part of this product. */
export function debtMarketplaceEnabled(): boolean {
  return isEnabled('DEBT_MARKETPLACE_ENABLED')
}

/**
 * Ends the render with a 404 when the debt marketplace is switched off.
 *
 * A 404 rather than a redirect or an explanation: to a visitor of an
 * investment-only deployment the lender marketplace does not exist, and saying
 * "this is disabled" would advertise a product they cannot buy.
 */
export function requireDebtMarketplace(): void {
  if (!debtMarketplaceEnabled()) notFound()
}
