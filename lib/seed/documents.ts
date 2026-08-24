import type { DocumentType } from '@/types'
import type { DealFixture, PeriodFixture } from './fixtures'
import { DEMO_BANNER } from './fixtures'

/**
 * Demo document generation.
 *
 * These are genuine files — CSV statements and text reports — written to the
 * storage driver and processed by the real extraction pipeline on first boot.
 * Nothing about the demo data path is mocked: the figures shown on a demo deal
 * were parsed out of these files by the same code that handles a real upload.
 */

export interface GeneratedDocument {
  filename: string
  displayName: string
  mimeType: string
  docType: DocumentType
  content: string
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

function money(value: number): string {
  return `"$${value.toLocaleString('en-US')}"`
}

function csv(rows: string[][]): string {
  return rows.map((row) => row.join(',')).join('\n')
}

export function operatingStatement(deal: DealFixture, ttm: PeriodFixture): GeneratedDocument {
  const periods = [...deal.periods, ttm]
  const header = ['Line Item', ...periods.map((p) => (p === ttm ? `TTM ${ttm.year}` : String(p.year)))]
  const row = (label: string, pick: (p: PeriodFixture) => number) => [label, ...periods.map((p) => money(pick(p)))]

  return {
    filename: `${deal.slug}-operating-statements.csv`,
    displayName: 'Operating Statements — 3 Year plus TTM',
    mimeType: 'text/csv',
    docType: 'profit_and_loss',
    content: csv([
      [`${deal.name} — Statement of Operations`],
      [DEMO_BANNER],
      [],
      header,
      row('Total Revenue', (p) => p.revenue),
      row('Total Salaries & Benefits', (p) => p.labor_expense),
      row('Agency Labor', (p) => p.agency_labor),
      row('Utilities', (p) => p.utilities),
      row('Insurance', (p) => p.insurance),
      row('Real Estate Taxes', (p) => p.taxes),
      row('Management Fee', (p) => p.management_fee),
      row('Rent', (p) => p.rent),
      row('Total Operating Expenses', (p) => p.total_operating_expense),
      row('EBITDA', (p) => p.ebitda),
      row('Net Income', (p) => p.net_income),
      row('Capital Expenditures', (p) => p.capex),
      [],
      ['Occupancy', ...periods.map((p) => `${p.occupancy_pct}%`)],
      ['Average Census', ...periods.map((p) => String(p.average_census))],
    ]),
  }
}

export function balanceSheet(deal: DealFixture, ttm: PeriodFixture): GeneratedDocument {
  const currentAssets = Math.round(ttm.revenue * 0.16)
  const netPpe = Math.round((deal.appraisedValue ?? deal.purchasePrice ?? 12_000_000) * 0.82)
  const debt = deal.existingDebt ?? 0
  return {
    filename: `${deal.slug}-balance-sheet.csv`,
    displayName: `Balance Sheet — ${ttm.year}`,
    mimeType: 'text/csv',
    docType: 'balance_sheet',
    content: csv([
      [`${deal.name} — Balance Sheet`],
      [DEMO_BANNER],
      [],
      ['Line Item', String(ttm.year)],
      ['Cash and Equivalents', money(Math.round(ttm.revenue * 0.041))],
      ['Accounts Receivable, net', money(Math.round(ttm.revenue * 0.098))],
      ['Total Current Assets', money(currentAssets)],
      ['Property, Plant & Equipment, net', money(netPpe)],
      ['Total Assets', money(currentAssets + netPpe)],
      ['Accounts Payable', money(Math.round(ttm.revenue * 0.037))],
      ['Accrued Payroll', money(Math.round(ttm.labor_expense * 0.061))],
      ['Unpaid Principal Balance', money(debt)],
      ['Total Liabilities', money(debt + Math.round(ttm.revenue * 0.098))],
    ]),
  }
}

export function censusReport(deal: DealFixture, ttm: PeriodFixture): GeneratedDocument {
  const rows = MONTHS.map((month, index) => {
    // A gentle seasonal shape around the annual average.
    const seasonal = Math.sin((index / 12) * Math.PI * 2) * 1.8
    const occupancy = Math.round((ttm.occupancy_pct + seasonal) * 10) / 10
    const census = Math.round((occupancy / 100) * deal.operatingBeds)
    return [`${month} ${ttm.year}`, String(census), `${occupancy}%`, String(census * 30)]
  })

  return {
    filename: `${deal.slug}-census-detail.csv`,
    displayName: `Monthly Census Detail — TTM ${ttm.year}`,
    mimeType: 'text/csv',
    docType: 'census',
    content: csv([
      [`${deal.name} — Monthly Census`],
      [DEMO_BANNER],
      [`Licensed Beds`, String(deal.licensedBeds)],
      [`Certified Beds`, String(deal.certifiedBeds)],
      [`Operating Beds`, String(deal.operatingBeds)],
      [],
      ['Month', 'Average Census', 'Occupancy', 'Patient Days'],
      ...rows,
      [],
      ['Average Census', String(ttm.average_census)],
      ['Occupancy', `${ttm.occupancy_pct}%`],
    ]),
  }
}

export function payerMixReport(deal: DealFixture, ttm: PeriodFixture): GeneratedDocument {
  const { payer } = deal
  const line = (label: string, pct: number) => [
    label,
    `${pct}%`,
    money(Math.round((ttm.revenue * pct) / 100)),
    String(Math.round((ttm.average_census * pct) / 100)),
  ]
  return {
    filename: `${deal.slug}-payer-mix.csv`,
    displayName: `Payer Mix — TTM ${ttm.year}`,
    mimeType: 'text/csv',
    docType: 'payer_mix',
    content: csv([
      [`${deal.name} — Revenue and Census by Payer`],
      [DEMO_BANNER],
      [],
      ['Payer', 'Mix', 'Revenue', 'Average Census'],
      line('Medicare', payer.medicare),
      line('Medicaid', payer.medicaid),
      line('Managed Care', payer.managedCare),
      line('Private Pay', payer.privatePay),
      line('Other', payer.other),
      [],
      ['Revenue Per Patient Day', money(Math.round(ttm.revenue / (ttm.average_census * 365)))],
    ]),
  }
}

export function taxReturn(deal: DealFixture, latestAnnual: PeriodFixture): GeneratedDocument {
  // Where a fixture sets an override, the tax return disagrees with the P&L —
  // which is exactly the conflict the reconciliation engine exists to catch.
  const revenue = deal.taxReturnRevenueOverride ?? latestAnnual.revenue
  return {
    filename: `${deal.slug}-tax-return-${latestAnnual.year}.txt`,
    displayName: `Business Tax Return — ${latestAnnual.year}`,
    mimeType: 'text/plain',
    docType: 'tax_return',
    content: [
      `${deal.operatingCompany}`,
      `U.S. Return of Partnership Income — Tax Year ${latestAnnual.year}`,
      DEMO_BANNER,
      '',
      `FY${latestAnnual.year}`,
      '',
      `Total Revenue ................. $${revenue.toLocaleString('en-US')}`,
      `Total Salaries & Benefits ..... $${latestAnnual.labor_expense.toLocaleString('en-US')}`,
      `Depreciation .................. $${Math.round(latestAnnual.revenue * 0.043).toLocaleString('en-US')}`,
      `Interest Expense .............. $${Math.round((deal.existingDebt ?? 0) * 0.068).toLocaleString('en-US')}`,
      `Net Income .................... $${latestAnnual.net_income.toLocaleString('en-US')}`,
      '',
      'This return has been prepared from the books and records of the partnership.',
    ].join('\n'),
  }
}

export function debtSchedule(deal: DealFixture): GeneratedDocument | null {
  if (!deal.existingDebt) return null
  return {
    filename: `${deal.slug}-debt-schedule.csv`,
    displayName: 'Current Debt Schedule',
    mimeType: 'text/csv',
    docType: 'existing_debt',
    content: csv([
      [`${deal.name} — Debt Schedule`],
      [DEMO_BANNER],
      [],
      ['Lender', 'Original Amount', 'Unpaid Principal Balance', 'Rate', 'Maturity'],
      [
        'Regional bank (existing)',
        money(Math.round(deal.existingDebt * 1.18)),
        money(deal.existingDebt),
        '6.35%',
        `${new Date().getUTCFullYear() + 1}-03-31`,
      ],
      [],
      ['Unpaid Principal Balance', money(deal.existingDebt)],
    ]),
  }
}

export function purchaseAgreement(deal: DealFixture): GeneratedDocument | null {
  if (!deal.purchasePrice) return null
  const close = new Date(Date.now() + deal.targetCloseInDays * 86_400_000).toISOString().slice(0, 10)
  return {
    filename: `${deal.slug}-purchase-agreement-summary.txt`,
    displayName: 'Purchase Agreement — Summary of Terms',
    mimeType: 'text/plain',
    docType: 'purchase_agreement',
    content: [
      'ASSET PURCHASE AGREEMENT — SUMMARY OF PRINCIPAL TERMS',
      DEMO_BANNER,
      '',
      `Facility: ${deal.name}, ${deal.city}, ${deal.state}`,
      `Licensed Beds: ${deal.licensedBeds}`,
      '',
      `Purchase Price ................ $${deal.purchasePrice.toLocaleString('en-US')}`,
      `Earnest Money ................. $${Math.round(deal.purchasePrice * 0.02).toLocaleString('en-US')}`,
      deal.sellerFinancing
        ? `Seller Financing .............. $${deal.sellerFinancing.toLocaleString('en-US')}`
        : 'Seller Financing .............. None',
      `Target Closing Date: ${close}`,
      '',
      'Real estate and the operating business transfer together. Closing is conditioned on',
      'licensure transfer, lender approval, and customary title and survey conditions.',
      '',
      'This is a fictional summary prepared for demonstration purposes and is not a legal document.',
    ].join('\n'),
  }
}

export function appraisal(deal: DealFixture): GeneratedDocument | null {
  if (!deal.appraisedValue) return null
  return {
    filename: `${deal.slug}-appraisal-summary.txt`,
    displayName: 'Appraisal — Summary of Value Conclusions',
    mimeType: 'text/plain',
    docType: 'appraisal',
    content: [
      'SUMMARY APPRAISAL REPORT — VALUE CONCLUSIONS',
      DEMO_BANNER,
      '',
      `Subject: ${deal.name}, ${deal.city}, ${deal.state}`,
      `Beds: ${deal.licensedBeds} licensed`,
      `Year Built: ${deal.yearBuilt}${deal.lastRenovation ? `, renovated ${deal.lastRenovation}` : ''}`,
      '',
      `Appraised Value ............... $${deal.appraisedValue.toLocaleString('en-US')}`,
      `Value Per Bed ................. $${Math.round(deal.appraisedValue / deal.licensedBeds).toLocaleString('en-US')}`,
      '',
      'The value conclusion reflects the income approach as the primary methodology, with the',
      'sales comparison approach applied as a reasonableness check.',
      '',
      'Fictional report prepared for demonstration purposes only.',
    ].join('\n'),
  }
}

export function licenseDocument(deal: DealFixture): GeneratedDocument {
  return {
    filename: `${deal.slug}-license.txt`,
    displayName: 'Facility License',
    mimeType: 'text/plain',
    docType: 'license',
    content: [
      `STATE OF ${deal.state} — SKILLED NURSING FACILITY LICENSE`,
      DEMO_BANNER,
      '',
      `Facility: ${deal.name}`,
      `Address: ${deal.city}, ${deal.state} ${deal.zip}`,
      `Licensee: ${deal.operatingCompany}`,
      '',
      `Licensed Beds ................. ${deal.licensedBeds}`,
      `Certified Beds ................ ${deal.certifiedBeds}`,
      `Expiration: ${new Date().getUTCFullYear() + 1}-06-30`,
      '',
      'Fictional document generated for demonstration purposes.',
    ].join('\n'),
  }
}

export function arAging(deal: DealFixture, ttm: PeriodFixture): GeneratedDocument {
  const receivable = Math.round(ttm.revenue * 0.098)
  const bucket = (share: number) => money(Math.round(receivable * share))
  return {
    filename: `${deal.slug}-ar-aging.csv`,
    displayName: 'Accounts Receivable Aging',
    mimeType: 'text/csv',
    docType: 'ar_aging',
    content: csv([
      [`${deal.name} — AR Aging by Payer`],
      [DEMO_BANNER],
      [],
      ['Payer', '0-30', '31-60', '61-90', '91-120', '120+'],
      ['Medicare', bucket(0.09), bucket(0.03), bucket(0.01), bucket(0.005), bucket(0.002)],
      ['Medicaid', bucket(0.21), bucket(0.14), bucket(0.08), bucket(0.04), bucket(0.03)],
      ['Managed Care', bucket(0.07), bucket(0.05), bucket(0.03), bucket(0.02), bucket(0.011)],
      ['Private Pay', bucket(0.06), bucket(0.02), bucket(0.008), bucket(0.004), bucket(0.001)],
    ]),
  }
}

export function documentsFor(deal: DealFixture, ttm: PeriodFixture): GeneratedDocument[] {
  const latestAnnual = deal.periods[deal.periods.length - 1]!
  return [
    operatingStatement(deal, ttm),
    balanceSheet(deal, ttm),
    censusReport(deal, ttm),
    payerMixReport(deal, ttm),
    taxReturn(deal, latestAnnual),
    arAging(deal, ttm),
    licenseDocument(deal),
    debtSchedule(deal),
    purchaseAgreement(deal),
    appraisal(deal),
  ].filter((doc): doc is GeneratedDocument => doc !== null)
}
