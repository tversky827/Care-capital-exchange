import { assetNoun, stateName } from '@/lib/deal/display'
import type { Deal, Facility } from '@/types'
import type { Offering } from '@/types/equity'

/**
 * How an offering names itself to a particular viewer.
 *
 * An operator can choose to keep the facility's identity back until someone
 * has taken on an obligation about it. Where they have, the listing describes
 * the asset rather than naming it — the same descriptor the marketing site
 * promises: "120-bed skilled nursing facility, Illinois".
 *
 * The offering's own name usually contains the facility's, so it is the name
 * that has to be replaced, not merely the facility field beside it.
 */
export function offeringTitle(
  offering: Offering,
  deal: Deal,
  facility: Facility | null,
  revealIdentity: boolean,
): string {
  if (revealIdentity || !deal.anonymize_in_marketplace) return offering.name
  const beds = facility?.operating_beds ?? facility?.licensed_beds ?? null
  const where = facility?.state ? stateName(facility.state) : null
  return [
    [beds ? `${beds}-bed` : null, assetNoun(deal.asset_type)].filter(Boolean).join(' '),
    where,
  ].filter(Boolean).join(', ')
}

/** Whether a viewer sees the city as well as the state. */
export function offeringLocation(
  deal: Deal,
  facility: Facility | null,
  revealIdentity: boolean,
): string | null {
  if (!facility?.state) return null
  const state = stateName(facility.state)
  if (!revealIdentity && deal.anonymize_in_marketplace) return state
  return facility.city ? `${facility.city}, ${state}` : state
}
