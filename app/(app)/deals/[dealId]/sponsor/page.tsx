import { notFound } from 'next/navigation'
import { requireActor } from '@/lib/auth/session'
import { subjectOf } from '@/lib/access'
import { canEditDeal } from '@/lib/policy'
import { buildSnapshot } from '@/lib/deal/snapshot'
import { Alert, Card, CardBody, Field, Input, Section, Select, Textarea } from '@/components/ui/primitives'
import { ActionForm } from '@/components/forms/action-form'
import { MetricTile } from '@/components/deal/common'
import { updateSponsorAction } from '../../actions'
import { formatCurrency, formatNumber } from '@/lib/utils/format'

export default async function SponsorPage({ params }: { params: Promise<{ dealId: string }> }) {
  const { dealId } = await params
  const actor = await requireActor()
  const snapshot = await buildSnapshot(dealId)
  if (!snapshot) notFound()

  const { sponsor, summary } = snapshot
  const canEdit = canEditDeal(subjectOf(actor), snapshot.deal)
  const liquidityCovers =
    sponsor?.liquidity != null && summary.equityRequirement
      ? sponsor.liquidity >= summary.equityRequirement
      : null

  return (
    <div className="space-y-4">
      <Card>
        <div className="data-grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6">
          <MetricTile label="Years in healthcare" value={sponsor?.years_in_healthcare ?? '—'} />
          <MetricTile label="Years in asset type" value={sponsor?.years_operating_asset_type ?? '—'} />
          <MetricTile label="Facilities operated" value={sponsor?.facilities_operated ?? '—'} />
          <MetricTile label="Beds under management" value={formatNumber(sponsor?.beds_operated ?? null)} />
          <MetricTile label="Acquisitions" value={sponsor?.historical_acquisitions ?? '—'} detail={sponsor?.previous_exits ? `${sponsor.previous_exits} exits` : undefined} />
          <MetricTile
            label="Liquidity"
            value={formatCurrency(sponsor?.liquidity ?? null, { compact: true })}
            tone={liquidityCovers === false ? 'critical' : liquidityCovers ? 'positive' : undefined}
            detail={
              summary.equityRequirement
                ? `against ${formatCurrency(summary.equityRequirement, { compact: true })} equity required`
                : undefined
            }
          />
        </div>
      </Card>

      {sponsor?.prior_defaults ? (
        <Alert tone="warning" title="Prior default disclosed">
          A prior default requires explanation before a credit committee will engage. Disclosing it in
          the package is materially better than having it surface in diligence.
        </Alert>
      ) : null}

      {liquidityCovers === false ? (
        <Alert tone="warning" title="Stated liquidity is below the equity required at closing">
          Lenders will want the source of the remaining equity identified before issuing an
          indication. Co-investment, a capital partner or seller financing each close the gap.
        </Alert>
      ) : null}

      <Section title="Sponsor profile" description="Operator experience is a stated criterion in most lending boxes.">
        <CardBody>
          {canEdit ? (
            <ActionForm action={updateSponsorAction} submitLabel="Save sponsor information">
              <input type="hidden" name="dealId" value={dealId} />
              <Field label="Borrowing entity" htmlFor="legal_entity">
                <Input id="legal_entity" name="legal_entity" defaultValue={sponsor?.legal_entity ?? ''} />
              </Field>

              <div className="mt-4 grid gap-4 sm:grid-cols-4">
                <Field label="Years in healthcare" htmlFor="years_in_healthcare">
                  <Input id="years_in_healthcare" name="years_in_healthcare" defaultValue={sponsor?.years_in_healthcare ?? ''} />
                </Field>
                <Field label="Years in this asset type" htmlFor="years_operating_asset_type">
                  <Input id="years_operating_asset_type" name="years_operating_asset_type" defaultValue={sponsor?.years_operating_asset_type ?? ''} />
                </Field>
                <Field label="Facilities operated" htmlFor="facilities_operated">
                  <Input id="facilities_operated" name="facilities_operated" defaultValue={sponsor?.facilities_operated ?? ''} />
                </Field>
                <Field label="Beds under management" htmlFor="beds_operated">
                  <Input id="beds_operated" name="beds_operated" defaultValue={sponsor?.beds_operated ?? ''} />
                </Field>
              </div>

              <div className="mt-4 grid gap-4 sm:grid-cols-3">
                <Field label="States operated" htmlFor="states_operated" hint="Comma separated.">
                  <Input id="states_operated" name="states_operated" defaultValue={sponsor?.states_operated.join(', ') ?? ''} />
                </Field>
                <Field label="Historical acquisitions" htmlFor="historical_acquisitions">
                  <Input id="historical_acquisitions" name="historical_acquisitions" defaultValue={sponsor?.historical_acquisitions ?? ''} />
                </Field>
                <Field label="Previous exits" htmlFor="previous_exits">
                  <Input id="previous_exits" name="previous_exits" defaultValue={sponsor?.previous_exits ?? ''} />
                </Field>
              </div>

              <div className="mt-4 grid gap-4 sm:grid-cols-4">
                <Field label="Prior defaults" htmlFor="prior_defaults">
                  <Select id="prior_defaults" name="prior_defaults" defaultValue={sponsor?.prior_defaults ? 'yes' : 'no'}>
                    <option value="no">No</option>
                    <option value="yes">Yes</option>
                  </Select>
                </Field>
                <Field label="Bankruptcy history" htmlFor="bankruptcy_history">
                  <Select id="bankruptcy_history" name="bankruptcy_history" defaultValue={sponsor?.bankruptcy_history ? 'yes' : 'no'}>
                    <option value="no">No</option>
                    <option value="yes">Yes</option>
                  </Select>
                </Field>
                <Field label="Net worth" htmlFor="net_worth" hint="Optional.">
                  <Input id="net_worth" name="net_worth" defaultValue={sponsor?.net_worth ?? ''} />
                </Field>
                <Field label="Liquidity" htmlFor="liquidity" hint="Optional.">
                  <Input id="liquidity" name="liquidity" defaultValue={sponsor?.liquidity ?? ''} />
                </Field>
              </div>

              <Field className="mt-4" label="Management team" htmlFor="management_team">
                <Textarea id="management_team" name="management_team" rows={4} defaultValue={sponsor?.management_team ?? ''} />
              </Field>
              <Field className="mt-4" label="Key executives" htmlFor="key_executives">
                <Textarea id="key_executives" name="key_executives" rows={3} defaultValue={sponsor?.key_executives ?? ''} />
              </Field>
              <Field className="mt-4" label="Relevant operating experience" htmlFor="relevant_experience">
                <Textarea id="relevant_experience" name="relevant_experience" rows={4} defaultValue={sponsor?.relevant_experience ?? ''} />
              </Field>

              <p className="mt-3 text-[11px] leading-relaxed text-ink-muted">
                Personal financial detail is optional. Provide it only where a lender you intend to
                approach requires it.
              </p>
            </ActionForm>
          ) : (
            <div className="space-y-4 text-[13px] leading-relaxed text-ink-secondary">
              <p>{sponsor?.management_team}</p>
              <p>{sponsor?.relevant_experience}</p>
            </div>
          )}
        </CardBody>
      </Section>
    </div>
  )
}

export const dynamic = 'force-dynamic'
