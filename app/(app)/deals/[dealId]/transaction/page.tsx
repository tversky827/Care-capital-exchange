import { notFound } from 'next/navigation'
import { requireActor } from '@/lib/auth/session'
import { requireDealAccess } from '@/lib/deal-access'
import { subjectOf } from '@/lib/access'
import { canEditDeal } from '@/lib/policy'
import { buildSnapshot } from '@/lib/deal/snapshot'
import { financingCost } from '@/lib/finance/calculations'
import { Alert, Card, CardBody, Field, Input, Section, Select, Table, Td, Th, Tr } from '@/components/ui/primitives'
import { ActionForm } from '@/components/forms/action-form'
import { MetricTile } from '@/components/deal/common'
import { updateDealSettingsAction, updateTermsAction } from '../../actions'
import { formatCurrency, formatPercent, formatRatio } from '@/lib/utils/format'

export default async function TransactionPage({ params }: { params: Promise<{ dealId: string }> }) {
  const { dealId } = await params
  // Authorizes and produces a 404 the framework reports correctly.
  await requireDealAccess(dealId)
  const actor = await requireActor()
  const snapshot = await buildSnapshot(dealId)
  if (!snapshot) notFound()

  const { deal, terms, summary, assumedTerms } = snapshot
  const canEdit = canEditDeal(subjectOf(actor), deal)
  const involvesPurchase = ['acquisition', 'acquisition_refinance'].includes(deal.transaction_type)

  const cost = financingCost({
    loanAmount: summary.loanAmount,
    allInRatePct: assumedTerms.ratePct,
    termMonths: assumedTerms.termMonths,
    amortizationMonths: assumedTerms.amortizationMonths,
    interestOnlyMonths: terms?.requested_io_months ?? 0,
  })

  return (
    <div className="space-y-4">
      <Card>
        <div className="data-grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6">
          <MetricTile label="Total uses" value={formatCurrency(summary.sourcesAndUses.totalUses, { compact: true })} />
          <MetricTile label="Total sources" value={formatCurrency(summary.sourcesAndUses.totalSources, { compact: true })} />
          <MetricTile label="Equity required" value={formatCurrency(summary.equityRequirement, { compact: true })} />
          <MetricTile label="Loan-to-cost" value={formatPercent(summary.loanToCost)} />
          <MetricTile label="LTV" value={formatPercent(summary.ltv)} />
          <MetricTile
            label="Balance"
            value={summary.sourcesAndUses.balanced ? 'Balanced' : formatCurrency(summary.sourcesAndUses.gap, { compact: true })}
            tone={summary.sourcesAndUses.balanced ? 'positive' : 'critical'}
          />
        </div>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Section title="Uses">
          <Table>
            <thead><tr><Th>Item</Th><Th numeric>%</Th><Th numeric>Amount</Th></tr></thead>
            <tbody>
              {summary.sourcesAndUses.uses.map((line) => (
                <Tr key={line.label}>
                  <Td className="text-ink-secondary">{line.label}</Td>
                  <Td numeric className="text-ink-muted">{formatPercent(line.pct)}</Td>
                  <Td numeric className="font-medium">{formatCurrency(line.amount)}</Td>
                </Tr>
              ))}
              <Tr>
                <Td className="font-semibold text-ink">Total uses</Td>
                <Td numeric />
                <Td numeric className="font-semibold">{formatCurrency(summary.sourcesAndUses.totalUses)}</Td>
              </Tr>
            </tbody>
          </Table>
        </Section>

        <Section title="Sources">
          <Table>
            <thead><tr><Th>Item</Th><Th numeric>%</Th><Th numeric>Amount</Th></tr></thead>
            <tbody>
              {summary.sourcesAndUses.sources.map((line) => (
                <Tr key={line.label}>
                  <Td className="text-ink-secondary">{line.label}</Td>
                  <Td numeric className="text-ink-muted">{formatPercent(line.pct)}</Td>
                  <Td numeric className="font-medium">{formatCurrency(line.amount)}</Td>
                </Tr>
              ))}
              <Tr>
                <Td className="font-semibold text-ink">Total sources</Td>
                <Td numeric />
                <Td numeric className="font-semibold">{formatCurrency(summary.sourcesAndUses.totalSources)}</Td>
              </Tr>
            </tbody>
          </Table>
        </Section>
      </div>

      <Section
        title="Debt service analysis"
        description={
          assumedTerms.assumed
            ? `No terms have been requested, so coverage is computed on a stated platform assumption of ${formatPercent(assumedTerms.ratePct)} over a ${assumedTerms.amortizationMonths / 12}-year amortization. Enter requested terms below to model your own.`
            : `Computed on the terms requested below.`
        }
      >
        <div className="data-grid grid-cols-2 border-t border-line sm:grid-cols-4">
          <MetricTile label="Monthly payment" value={formatCurrency(cost.monthlyPaymentAmortizing, { decimals: 2 })} />
          <MetricTile label="Interest-only payment" value={formatCurrency(cost.monthlyPaymentInterestOnly, { decimals: 2 })} />
          <MetricTile label="Annual debt service" value={formatCurrency(cost.annualDebtService)} />
          <MetricTile label="Year one debt service" value={formatCurrency(cost.yearOneDebtService)} />
          <MetricTile label="DSCR" value={formatRatio(summary.dscr)} />
          <MetricTile label="DSCR, year one" value={formatRatio(summary.dscrYearOne)} />
          <MetricTile label="Balloon at maturity" value={formatCurrency(cost.balloonBalance, { compact: true })} />
          <MetricTile label="Total interest over term" value={formatCurrency(cost.totalInterest, { compact: true })} />
        </div>
      </Section>

      <Section title="Transaction terms">
        <CardBody>
          {canEdit ? (
            <ActionForm action={updateTermsAction} submitLabel="Save transaction terms">
              <input type="hidden" name="dealId" value={dealId} />
              <div className="grid gap-4 sm:grid-cols-3">
                {involvesPurchase ? (
                  <Field label="Purchase price" htmlFor="purchase_price">
                    <Input id="purchase_price" name="purchase_price" defaultValue={terms?.purchase_price ?? ''} />
                  </Field>
                ) : null}
                <Field label="Requested financing" htmlFor="requested_financing">
                  <Input id="requested_financing" name="requested_financing" defaultValue={terms?.requested_financing ?? ''} />
                </Field>
                <Field label="Appraised value" htmlFor="appraised_value">
                  <Input id="appraised_value" name="appraised_value" defaultValue={terms?.appraised_value ?? ''} />
                </Field>
                <Field label="Existing debt to retire" htmlFor="existing_debt">
                  <Input id="existing_debt" name="existing_debt" defaultValue={terms?.existing_debt ?? ''} />
                </Field>
                <Field label="Seller financing" htmlFor="seller_financing">
                  <Input id="seller_financing" name="seller_financing" defaultValue={terms?.seller_financing ?? ''} />
                </Field>
                <Field label="Sponsor cash equity" htmlFor="cash_equity" hint="Blank derives it from the stack.">
                  <Input id="cash_equity" name="cash_equity" defaultValue={terms?.cash_equity ?? ''} />
                </Field>
                <Field label="Estimated closing costs" htmlFor="estimated_closing_costs">
                  <Input id="estimated_closing_costs" name="estimated_closing_costs" defaultValue={terms?.estimated_closing_costs ?? ''} />
                </Field>
                <Field label="CapEx requirement" htmlFor="capex_requirement">
                  <Input id="capex_requirement" name="capex_requirement" defaultValue={terms?.capex_requirement ?? ''} />
                </Field>
                <Field label="Working capital requirement" htmlFor="working_capital_requirement">
                  <Input id="working_capital_requirement" name="working_capital_requirement" defaultValue={terms?.working_capital_requirement ?? ''} />
                </Field>
              </div>

              <div className="mt-4 grid gap-4 sm:grid-cols-3">
                <Field label="Target closing date" htmlFor="target_close_date">
                  <Input id="target_close_date" name="target_close_date" type="date" defaultValue={terms?.target_close_date?.slice(0, 10) ?? ''} />
                </Field>
                <Field label="Purchase agreement status" htmlFor="purchase_agreement_status">
                  <Input id="purchase_agreement_status" name="purchase_agreement_status" defaultValue={terms?.purchase_agreement_status ?? ''} />
                </Field>
                <Field label="LOI status" htmlFor="loi_status">
                  <Input id="loi_status" name="loi_status" defaultValue={terms?.loi_status ?? ''} />
                </Field>
              </div>

              <fieldset className="mt-5">
                <legend className="text-[12px] font-medium text-ink-secondary">Requested terms</legend>
                <div className="mt-2 grid gap-4 sm:grid-cols-4">
                  <Field label="Rate %" htmlFor="requested_rate_pct">
                    <Input id="requested_rate_pct" name="requested_rate_pct" defaultValue={terms?.requested_rate_pct ?? ''} />
                  </Field>
                  <Field label="Term (months)" htmlFor="requested_term_months">
                    <Input id="requested_term_months" name="requested_term_months" defaultValue={terms?.requested_term_months ?? ''} />
                  </Field>
                  <Field label="Amortization (months)" htmlFor="requested_amortization_months">
                    <Input id="requested_amortization_months" name="requested_amortization_months" defaultValue={terms?.requested_amortization_months ?? ''} />
                  </Field>
                  <Field label="Interest-only (months)" htmlFor="requested_io_months">
                    <Input id="requested_io_months" name="requested_io_months" defaultValue={terms?.requested_io_months ?? ''} />
                  </Field>
                </div>
              </fieldset>
            </ActionForm>
          ) : (
            <Alert tone="neutral">This deal is read-only for your role.</Alert>
          )}
        </CardBody>
      </Section>

      <Section title="Deal settings" description="Confidentiality and how financing indications are ranked for you.">
        <CardBody>
          {canEdit ? (
            <ActionForm action={updateDealSettingsAction} submitLabel="Save settings">
              <input type="hidden" name="dealId" value={dealId} />
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Deal name" htmlFor="name"><Input id="name" name="name" defaultValue={deal.name} /></Field>
                <Field
                  label="What matters most in this financing?"
                  htmlFor="borrower_priority"
                  hint="Offer comparison ranks against this."
                >
                  <Select id="borrower_priority" name="borrower_priority" defaultValue={deal.borrower_priority}>
                    <option value="lowest_rate">Lowest financing cost</option>
                    <option value="highest_leverage">Highest proceeds</option>
                    <option value="longest_term">Longest term</option>
                    <option value="maximum_io">Maximum interest-only</option>
                    <option value="lowest_fees">Lowest fees</option>
                    <option value="non_recourse">Non-recourse</option>
                    <option value="fastest_closing">Fastest closing</option>
                    <option value="most_certainty">Greatest certainty of close</option>
                  </Select>
                </Field>
                <Field
                  label="Marketplace confidentiality"
                  htmlFor="anonymize_in_marketplace"
                  className="sm:col-span-2"
                  hint="When anonymised, lenders browsing the marketplace see the asset type, size and state — never the facility name — until you distribute the deal to them."
                >
                  <Select id="anonymize_in_marketplace" name="anonymize_in_marketplace" defaultValue={deal.anonymize_in_marketplace ? 'yes' : 'no'}>
                    <option value="yes">Anonymise on the marketplace</option>
                    <option value="no">Show the facility name</option>
                  </Select>
                </Field>
              </div>
              <Field className="mt-4" label="Transaction narrative" htmlFor="narrative">
                <textarea
                  id="narrative"
                  name="narrative"
                  rows={4}
                  defaultValue={deal.narrative ?? ''}
                  className="w-full border border-line-strong bg-surface px-2.5 py-1.5 text-[13px] leading-relaxed text-ink rounded-[3px] focus:border-accent"
                />
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
