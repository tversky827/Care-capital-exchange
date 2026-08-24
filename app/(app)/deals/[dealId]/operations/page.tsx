import { notFound } from 'next/navigation'
import { requireActor } from '@/lib/auth/session'
import { subjectOf } from '@/lib/access'
import { canEditDeal } from '@/lib/policy'
import { buildSnapshot } from '@/lib/deal/snapshot'
import { Alert, Card, CardBody, Field, Input, Section, Select, Table, Td, Th, Tr } from '@/components/ui/primitives'
import { ActionForm } from '@/components/forms/action-form'
import { BarChart, DonutChart } from '@/components/charts'
import { MetricTile } from '@/components/deal/common'
import { updateFacilityAction } from '../../actions'
import { US_STATES } from '@/lib/deal/display'
import { formatCurrency, formatNumber, formatPercent } from '@/lib/utils/format'

export default async function OperationsPage({ params }: { params: Promise<{ dealId: string }> }) {
  const { dealId } = await params
  const actor = await requireActor()
  const snapshot = await buildSnapshot(dealId)
  if (!snapshot) notFound()

  const { facility, metrics, metricHistory, summary } = snapshot
  const canEdit = canEditDeal(subjectOf(actor), snapshot.deal)

  return (
    <div className="space-y-4">
      <Card>
        <div className="data-grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6">
          <MetricTile label="Occupancy" value={formatPercent(facility?.occupancy_pct ?? metrics?.occupancy_pct ?? summary.occupancyPct)} />
          <MetricTile label="Current census" value={formatNumber(facility?.current_census ?? null)} detail={facility?.operating_beds ? `of ${facility.operating_beds} operating beds` : undefined} />
          <MetricTile label="Revenue / patient day" value={formatCurrency(metrics?.revenue_per_patient_day ?? summary.revenuePerPatientDay, { decimals: 2 })} />
          <MetricTile label="Average daily rate" value={formatCurrency(metrics?.average_daily_rate ?? null, { decimals: 2 })} />
          <MetricTile label="Labor hours / patient day" value={metrics?.labor_hours_per_patient_day ?? '—'} />
          <MetricTile label="Agency % of labor" value={formatPercent(metrics?.agency_labor_pct ?? null)} />
        </div>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        {metricHistory.length > 1 ? (
          <Section title="Occupancy history" description="Census durability is the primary operating screen for skilled nursing.">
            <CardBody>
              <BarChart
                series={metricHistory.map((m) => ({ label: m.period_label, value: m.occupancy_pct }))}
                format={(value) => `${value.toFixed(1)}%`}
                height={130}
              />
            </CardBody>
          </Section>
        ) : null}

        {metrics ? (
          <Section title="Payer mix" description={`Reported for ${metrics.period_label}.`}>
            <CardBody>
              <DonutChart
                segments={[
                  { label: 'Medicare', value: metrics.medicare_pct ?? 0 },
                  { label: 'Medicaid', value: metrics.medicaid_pct ?? 0 },
                  { label: 'Managed care', value: metrics.managed_care_pct ?? 0 },
                  { label: 'Private pay', value: metrics.private_pay_pct ?? 0 },
                  { label: 'Other', value: metrics.other_payer_pct ?? 0 },
                ]}
                centerValue={metrics.medicaid_pct !== null ? `${metrics.medicaid_pct.toFixed(0)}%` : '—'}
                centerLabel="Medicaid"
              />
              {(metrics.medicaid_pct ?? 0) > 70 ? (
                <Alert tone="warning" className="mt-4">
                  Medicaid concentration above 70% narrows the lender pool materially — several
                  institutions cap Medicaid exposure at 65% to 70% as a stated criterion.
                </Alert>
              ) : null}
            </CardBody>
          </Section>
        ) : null}
      </div>

      {metricHistory.length ? (
        <Section title="Operating history" description="Every period recorded for this facility.">
          <Table>
            <thead>
              <tr>
                <Th>Period</Th>
                <Th numeric>Occupancy</Th>
                <Th numeric>Average census</Th>
                <Th numeric>Medicare</Th>
                <Th numeric>Medicaid</Th>
                <Th numeric>Managed care</Th>
                <Th numeric>Private pay</Th>
                <Th numeric>Revenue / day</Th>
                <Th numeric>Agency % labor</Th>
              </tr>
            </thead>
            <tbody>
              {[...metricHistory].reverse().map((metric) => (
                <Tr key={metric.id}>
                  <Td className="font-medium text-ink">{metric.period_label}</Td>
                  <Td numeric>{formatPercent(metric.occupancy_pct)}</Td>
                  <Td numeric>{formatNumber(metric.average_census)}</Td>
                  <Td numeric>{formatPercent(metric.medicare_pct)}</Td>
                  <Td numeric>{formatPercent(metric.medicaid_pct)}</Td>
                  <Td numeric>{formatPercent(metric.managed_care_pct)}</Td>
                  <Td numeric>{formatPercent(metric.private_pay_pct)}</Td>
                  <Td numeric>{formatCurrency(metric.revenue_per_patient_day, { decimals: 2 })}</Td>
                  <Td numeric>{formatPercent(metric.agency_labor_pct)}</Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        </Section>
      ) : null}

      <Section title="Facility details" description="These fields drive bed counts, occupancy and the per-bed metrics lenders screen on.">
        <CardBody>
          {canEdit ? (
            <ActionForm action={updateFacilityAction} submitLabel="Save facility details">
              <input type="hidden" name="dealId" value={dealId} />
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Facility name" htmlFor="name" className="sm:col-span-2">
                  <Input id="name" name="name" defaultValue={facility?.name ?? ''} required />
                </Field>
                <Field label="Street address" htmlFor="address_line1">
                  <Input id="address_line1" name="address_line1" defaultValue={facility?.address_line1 ?? ''} />
                </Field>
                <Field label="City" htmlFor="city"><Input id="city" name="city" defaultValue={facility?.city ?? ''} /></Field>
                <Field label="State" htmlFor="state">
                  <Select id="state" name="state" defaultValue={facility?.state ?? ''}>
                    <option value="">Select</option>
                    {US_STATES.map((option) => <option key={option.code} value={option.code}>{option.code} — {option.name}</option>)}
                  </Select>
                </Field>
                <Field label="ZIP" htmlFor="zip"><Input id="zip" name="zip" defaultValue={facility?.zip ?? ''} /></Field>
                <Field label="County" htmlFor="county"><Input id="county" name="county" defaultValue={facility?.county ?? ''} /></Field>
                <Field label="Property type" htmlFor="property_type">
                  <Input id="property_type" name="property_type" defaultValue={facility?.property_type ?? ''} />
                </Field>
              </div>

              <div className="mt-4 grid gap-4 sm:grid-cols-4">
                <Field label="Licensed beds" htmlFor="licensed_beds"><Input id="licensed_beds" name="licensed_beds" defaultValue={facility?.licensed_beds ?? ''} /></Field>
                <Field label="Certified beds" htmlFor="certified_beds"><Input id="certified_beds" name="certified_beds" defaultValue={facility?.certified_beds ?? ''} /></Field>
                <Field label="Operating beds" htmlFor="operating_beds"><Input id="operating_beds" name="operating_beds" defaultValue={facility?.operating_beds ?? ''} /></Field>
                <Field label="Current census" htmlFor="current_census"><Input id="current_census" name="current_census" defaultValue={facility?.current_census ?? ''} /></Field>
              </div>

              <div className="mt-4 grid gap-4 sm:grid-cols-4">
                <Field label="Occupancy %" htmlFor="occupancy_pct"><Input id="occupancy_pct" name="occupancy_pct" defaultValue={facility?.occupancy_pct ?? ''} /></Field>
                <Field label="Year built" htmlFor="year_built"><Input id="year_built" name="year_built" defaultValue={facility?.year_built ?? ''} /></Field>
                <Field label="Last renovation" htmlFor="last_renovation_year"><Input id="last_renovation_year" name="last_renovation_year" defaultValue={facility?.last_renovation_year ?? ''} /></Field>
                <Field label="CMS star rating" htmlFor="cms_star_rating"><Input id="cms_star_rating" name="cms_star_rating" defaultValue={facility?.cms_star_rating ?? ''} /></Field>
              </div>

              <div className="mt-4 grid gap-4 sm:grid-cols-3">
                <Field label="Real estate included" htmlFor="real_estate_included">
                  <Select id="real_estate_included" name="real_estate_included" defaultValue={facility?.real_estate_included ? 'yes' : 'no'}>
                    <option value="yes">Yes — property and operations</option>
                    <option value="no">No — operations only</option>
                  </Select>
                </Field>
                <Field label="Operating company" htmlFor="operating_company">
                  <Input id="operating_company" name="operating_company" defaultValue={facility?.operating_company ?? ''} />
                </Field>
                <Field label="Management company" htmlFor="management_company">
                  <Input id="management_company" name="management_company" defaultValue={facility?.management_company ?? ''} />
                </Field>
              </div>

              <Field className="mt-4" label="Ownership structure" htmlFor="ownership_structure">
                <Input id="ownership_structure" name="ownership_structure" defaultValue={facility?.ownership_structure ?? ''} />
              </Field>
            </ActionForm>
          ) : (
            <Alert tone="neutral">This deal is read-only for your role.</Alert>
          )}
        </CardBody>
      </Section>
    </div>
  )
}

export const dynamic = 'force-dynamic'
