import { requireActor } from '@/lib/auth/session'
import { currentEnvironment } from '@/lib/environment'
import { catalogueFor } from '@/lib/catalogue'
import { isAvailable } from '@/lib/flags'
import { OfferingRow } from '@/components/equity/offering-row'
import { Alert, Card, EmptyState, PageHeader } from '@/components/ui/primitives'
import { searchOfferings, type OfferingSearch } from '@/services/equity/matching'
import { db } from '@/db'
import { CURRENT_NDA } from '@/lib/equity/nda'
import { MarketplaceFilters } from './filters'

export const dynamic = 'force-dynamic'

function numberOrNull(value: string | undefined): number | null {
  if (!value) return null
  const parsed = Number(value.replace(/[^0-9.]/g, ''))
  return Number.isFinite(parsed) ? parsed : null
}

/**
 * The investment marketplace.
 *
 * Institutional by intent: dense figures, no urgency devices, no countdowns,
 * no social proof. Someone deciding where to put six figures is served by
 * information, not persuasion.
 *
 * Filtering happens on the server from the URL, so a filtered view is
 * shareable and a listing never carries an offering the viewer should not see.
 */
export default async function InvestmentsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const actor = await requireActor()
  // Which catalogue this reader sees, decided by the signed environment
  // cookie. A fictional raise must never appear in the real marketplace.
  const catalogue = catalogueFor(await currentEnvironment(actor.user.id))
  if (!isAvailable('EQUITY_MARKETPLACE_ENABLED')) {
    return (
      <Alert tone="neutral" title="The equity marketplace is not enabled">
        This deployment is configured for debt financing only.
      </Alert>
    )
  }

  const params = await searchParams
  const one = (key: string) => {
    const value = params[key]
    return Array.isArray(value) ? value[0] : value
  }

  const search: OfferingSearch = {
    assetTypes: one('asset') ? [one('asset')!] : undefined,
    states: one('state') ? [one('state')!.toUpperCase()] : undefined,
    capitalPositions: one('position') ? [one('position')!] : undefined,
    maxMinimum: numberOrNull(one('maxMin')),
    maxHoldMonths: numberOrNull(one('maxHold')) === null ? null : numberOrNull(one('maxHold'))! * 12,
    minTargetReturnPct: numberOrNull(one('minReturn')),
    status: one('status') === 'all' ? 'all' : 'live',
    query: one('q') ?? null,
  }

  const investorId = actor.investor?.id ?? null
  const [rows, unfiltered] = await Promise.all([
    searchOfferings(investorId, search, catalogue),
    searchOfferings(investorId, { status: search.status }, catalogue),
  ])

  // Ordered by fit where the viewer is an investor with preferences set, and by
  // recency otherwise. Never by size of raise, and never by who is paying.
  const sorted = [...rows].sort((a, b) => (b.match?.score ?? -1) - (a.match?.score ?? -1))

  // Which of these this viewer has already signed for. One query rather than
  // one per card: an anonymized listing keeps its descriptor in the list until
  // the agreement is signed, and takes its real name afterwards.
  const store = await db()
  const signed = new Set(
    (await store.select('nda_acceptances', {
      where: { company_id: actor.company.id, nda_version: CURRENT_NDA.version },
    })).map((row) => row.offering_id),
  )

  return (
    <div className="space-y-5">
      <PageHeader title="Invest" />

      <MarketplaceFilters total={unfiltered.length} showing={sorted.length} />

      {sorted.length === 0 ? (
        <EmptyState
          title="Nothing matches those filters"
          description="Clearing them shows everything currently open."
        />
      ) : (
        <Card className="overflow-hidden">
          {sorted.map((row) => (
            <OfferingRow
              key={row.offering.id}
              offering={row.offering}
              terms={row.terms}
              deal={row.deal}
              facility={row.facility}
              revealIdentity={
                signed.has(row.offering.id)
                || row.deal.company_id === actor.company.id
                || actor.isAdmin
              }
            />
          ))}
        </Card>
      )}

      {/* One line, at the end, where it belongs. A five-line warning above the
          list was read once and skipped forever after; the detail page states
          the risk for the specific investment, and the ticket asks for an
          acknowledgement at the moment it means something. */}
      <p className="text-[12px] leading-relaxed text-ink-muted">
        Private investments: your money is committed for years, there is no market to sell your
        stake in, and you can lose all of it. CareCapital Exchange is not a broker-dealer,
        investment adviser or funding portal, and nothing here is a recommendation.
      </p>

    </div>
  )
}
