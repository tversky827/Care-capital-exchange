import type { CreditAnalysisPayload } from '@/lib/ai/schemas'
import { assetNoun, stateName } from '@/lib/deal/display'
import type { DealSnapshot } from '@/lib/deal/snapshot'
import type { DealScore } from '@/lib/underwriting/score'
import { formatCurrency, formatPercent, formatRatio, titleize } from '@/lib/utils/format'

/**
 * Deterministic credit analysis.
 *
 * This is the analyst that runs when no model provider is configured, and it is
 * a real analysis rather than a placeholder: every strength, risk, question and
 * mitigant below is derived from the deal's actual computed metrics, and each
 * one is a point a healthcare credit officer would genuinely raise.
 *
 * It deliberately produces no approval language. The output is the same shape a
 * model returns, so the two paths are interchangeable and equally validated.
 */

interface Finding {
  title: string
  severity: 'critical' | 'high' | 'medium' | 'low' | 'info'
  detail: string
  category: string
  mitigant?: string
  question?: string
}

export function analyzeDeal(snapshot: DealSnapshot, score: DealScore): CreditAnalysisPayload {
  const { summary, facility, sponsor, metrics, latest, prior, deal, terms } = snapshot
  const strengths: string[] = []
  const findings: Finding[] = []
  const questions: string[] = []
  const missing: string[] = []
  const considerations: string[] = []

  const assetLabel = titleize(deal.asset_type)
  const beds = facility?.operating_beds ?? facility?.licensed_beds ?? null

  // --- Coverage and leverage ---------------------------------------------
  if (summary.dscr !== null) {
    if (summary.dscr >= 1.45) {
      strengths.push(
        `Debt service coverage of ${formatRatio(summary.dscr)} on the requested ${formatCurrency(summary.loanAmount, { compact: true })} provides meaningful cushion above the 1.25x–1.35x floor most healthcare lenders underwrite to.`,
      )
    } else if (summary.dscr >= 1.25) {
      findings.push({
        title: 'Debt service coverage is adequate but not comfortable',
        severity: 'medium',
        category: 'Cash flow',
        detail: `Coverage of ${formatRatio(summary.dscr)} clears a typical 1.25x floor with limited room. A 10% decline in EBITDA would bring coverage to roughly ${formatRatio(summary.dscr * 0.9)}.`,
        mitigant: 'A lower loan amount, a longer amortization, or an interest-only period would each widen coverage at closing.',
        question: 'Would the sponsor consider a modestly lower loan amount if it materially improved pricing?',
      })
    } else {
      findings.push({
        title: 'Debt service coverage is below conventional minimums',
        severity: summary.dscr < 1.1 ? 'critical' : 'high',
        category: 'Cash flow',
        detail: `Coverage computes to ${formatRatio(summary.dscr)} against the requested ${formatCurrency(summary.loanAmount, { compact: true })}. Most balance-sheet lenders require 1.25x or better on stabilised skilled nursing cash flow.`,
        mitigant: 'Sizing to a coverage-constrained loan amount, or structuring an interest-only period while operations stabilise, would bring the request inside conventional parameters.',
        question: 'Is the sponsor able to reduce the loan request to a coverage-constrained amount, or contribute additional equity?',
      })
    }
  } else {
    missing.push('Debt service coverage cannot be computed — operating cash flow or loan terms are incomplete.')
  }

  if (summary.ltv !== null) {
    if (summary.ltv <= 70) {
      strengths.push(`Leverage of ${formatPercent(summary.ltv)} LTV sits comfortably inside the 75%–80% ceiling typical for this asset class.`)
    } else if (summary.ltv > 80) {
      findings.push({
        title: `Requested leverage of ${formatPercent(summary.ltv)} exceeds conventional maximums`,
        severity: summary.ltv > 85 ? 'high' : 'medium',
        category: 'Leverage',
        detail: `Most healthcare lenders cap ${assetLabel.toLowerCase()} financing at 75%–80% of the lesser of cost and value. This request is ${formatPercent(summary.ltv)}.`,
        mitigant: 'Seller financing, a preferred equity tranche, or an SBA/HUD-style structure can bridge the gap above conventional senior leverage.',
        question: 'Is seller financing or additional sponsor equity available to bring senior leverage to 75%?',
      })
    }
  } else {
    missing.push('LTV cannot be computed — either the loan request or the value basis is missing.')
  }

  if (summary.debtYield !== null) {
    if (summary.debtYield >= 12) {
      strengths.push(`Debt yield of ${formatPercent(summary.debtYield)} means the loan is supported by cash flow independent of any valuation assumption.`)
    } else if (summary.debtYield < 10) {
      findings.push({
        title: `Debt yield of ${formatPercent(summary.debtYield)} is thin`,
        severity: 'medium',
        category: 'Leverage',
        detail: 'Debt yield is the metric that survives a cap-rate move. Below 10%, lenders are relying on the valuation rather than the cash flow to support proceeds.',
        mitigant: 'Proceeds sized to a 10%–12% debt yield would leave the loan supportable on cash flow alone.',
      })
    }
  }

  // --- Operating performance ---------------------------------------------
  const occupancy = facility?.occupancy_pct ?? metrics?.occupancy_pct ?? summary.occupancyPct
  if (occupancy != null) {
    if (occupancy >= 88) {
      strengths.push(`Occupancy of ${formatPercent(occupancy)} is strong for skilled nursing and indicates durable referral relationships.`)
    } else if (occupancy < 80) {
      findings.push({
        title: `Occupancy of ${formatPercent(occupancy)} is below stabilised levels`,
        severity: occupancy < 70 ? 'high' : 'medium',
        category: 'Operations',
        detail: `At ${formatPercent(occupancy)}${beds ? ` across ${beds} operating beds` : ''}, there is meaningful unabsorbed fixed cost. Lenders will underwrite the current census rather than a projected recovery.`,
        mitigant: 'A documented census ramp with referral-source detail, or an interest-only period covering the ramp, addresses the timing risk.',
        question: 'What is the census trend over the last six months, and what specifically is driving it?',
      })
    }
  } else {
    missing.push('Current occupancy has not been provided.')
  }

  if (metrics?.medicaid_pct != null) {
    if (metrics.medicaid_pct > 70) {
      findings.push({
        title: `Medicaid concentration of ${formatPercent(metrics.medicaid_pct)} narrows the lender pool`,
        severity: metrics.medicaid_pct > 80 ? 'high' : 'medium',
        category: 'Revenue quality',
        detail: 'Medicaid rates are set by the state and revised on a legislative cycle, so a heavily Medicaid-weighted facility carries reimbursement risk the operator cannot price around. Several lenders on the platform cap Medicaid exposure at 65%–70%.',
        mitigant: 'Evidence of a favourable state rate environment, a supplemental payment programme, or a documented plan to grow Medicare and managed-care census materially changes how this reads.',
        question: 'What is the outlook for the state Medicaid rate over the next two rate years, and does the facility participate in any supplemental payment programme?',
      })
    } else if (metrics.medicaid_pct < 55 && (metrics.private_pay_pct ?? 0) + (metrics.medicare_pct ?? 0) > 35) {
      strengths.push(
        `Payer mix is comparatively strong at ${formatPercent(metrics.medicaid_pct)} Medicaid, with ${formatPercent((metrics.medicare_pct ?? 0) + (metrics.private_pay_pct ?? 0))} in Medicare and private pay.`,
      )
    }
  } else {
    missing.push('Payer mix has not been provided; Medicaid concentration is the single most common lender screen.')
  }

  if (latest?.items.agency_labor != null && latest.items.labor_expense) {
    const agencyShare = (latest.items.agency_labor / latest.items.labor_expense) * 100
    if (agencyShare > 8) {
      findings.push({
        title: `Agency labor is ${formatPercent(agencyShare)} of total labor cost`,
        severity: agencyShare > 15 ? 'high' : 'medium',
        category: 'Operations',
        detail: `Agency staffing at this level costs roughly 1.5x to 2x permanent labor and signals a recruitment or retention problem that will persist into the loan term.`,
        mitigant: 'A staffing plan with hiring pipeline detail, and evidence of a declining agency trend, is what lenders look for here.',
        question: 'What is the agency labor trend by month, and what is the plan to convert agency hours to permanent staff?',
      })
    } else if (agencyShare < 3 && prior?.items.agency_labor != null && latest.items.agency_labor < prior.items.agency_labor) {
      strengths.push(
        `Agency labor has been reduced to ${formatPercent(agencyShare)} of total labor, down from ${formatCurrency(prior.items.agency_labor, { compact: true })} in the prior period — a genuine operating improvement.`,
      )
    }
  }

  // --- Trend --------------------------------------------------------------
  if (summary.revenueGrowthPct !== null && summary.ebitdaGrowthPct !== null && prior && latest) {
    if (summary.ebitdaGrowthPct > 5 && summary.revenueGrowthPct > 0) {
      strengths.push(
        `EBITDA grew ${formatPercent(summary.ebitdaGrowthPct)} on ${formatPercent(summary.revenueGrowthPct)} revenue growth between ${prior.period.label} and ${latest.period.label}, indicating operating leverage rather than rate-driven growth alone.`,
      )
    }
    if (summary.ebitdaGrowthPct < 0 && summary.revenueGrowthPct > 0) {
      findings.push({
        title: 'Margin compressed despite revenue growth',
        severity: 'medium',
        category: 'Cash flow',
        detail: `Revenue rose ${formatPercent(summary.revenueGrowthPct)} while EBITDA fell ${formatPercent(Math.abs(summary.ebitdaGrowthPct))}. Cost growth is outpacing rate.`,
        mitigant: 'Expense detail showing which lines drove the compression, and what has been done since, addresses this directly.',
        question: 'Which expense categories drove the margin compression, and are those costs structural or one-time?',
      })
    }
  } else if (!prior) {
    missing.push('Only one historical period is on file; lenders need at least two to underwrite a trend.')
  }

  if (summary.ebitdaMargin !== null && summary.ebitdaMargin < 8 && summary.ebitdaMargin > 0) {
    findings.push({
      title: `EBITDA margin of ${formatPercent(summary.ebitdaMargin)} is below the operating range for the asset class`,
      severity: 'medium',
      category: 'Cash flow',
      detail: 'Skilled nursing operations generally run 8%–20% EBITDA margins. A thinner margin leaves less absorption capacity for a rate or census shock.',
      question: 'What margin does the sponsor expect at stabilisation, and what gets it there?',
    })
  }

  // --- Sponsor ------------------------------------------------------------
  if (sponsor) {
    if ((sponsor.years_in_healthcare ?? 0) >= 10 && (sponsor.facilities_operated ?? 0) >= 3) {
      strengths.push(
        `Sponsor brings ${sponsor.years_in_healthcare} years of healthcare operating experience across ${sponsor.facilities_operated} facilities${sponsor.states_operated.length ? ` in ${sponsor.states_operated.length} states` : ''}.`,
      )
    } else if ((sponsor.years_in_healthcare ?? 0) < 5) {
      findings.push({
        title: 'Limited sponsor operating history in the asset class',
        severity: 'medium',
        category: 'Sponsor',
        detail: `The sponsor reports ${sponsor.years_in_healthcare ?? 0} years of healthcare operating experience. Several lenders set a five-year minimum for skilled nursing.`,
        mitigant: 'An experienced third-party manager under contract, or a key operating executive with a longer track record, satisfies most lenders that set this test.',
        question: 'Who will operate the facility day to day, and what is that team\'s skilled nursing track record?',
      })
    }
    if (sponsor.prior_defaults) {
      findings.push({
        title: 'Prior default disclosed',
        severity: 'high',
        category: 'Sponsor',
        detail: 'A prior default requires explanation before a credit committee will engage, and disclosing it up front is materially better than having it surface in diligence.',
        question: 'Please describe the circumstances of the prior default and how it was resolved.',
      })
    }
    if (sponsor.liquidity != null && summary.equityRequirement != null && sponsor.liquidity < summary.equityRequirement) {
      findings.push({
        title: 'Stated liquidity is below the equity required to close',
        severity: 'high',
        category: 'Sponsor',
        detail: `The transaction requires roughly ${formatCurrency(summary.equityRequirement)} of equity against ${formatCurrency(sponsor.liquidity)} of stated liquidity.`,
        mitigant: 'Co-investment, a capital partner, or seller financing closes the gap; lenders will want the source identified before an indication.',
        question: 'What is the source of the equity required at closing?',
      })
    }
  } else {
    missing.push('Sponsor profile has not been completed.')
  }

  // --- Structure ----------------------------------------------------------
  if (terms?.appraised_value && terms.purchase_price && terms.appraised_value < terms.purchase_price) {
    findings.push({
      title: 'Appraised value is below the contract price',
      severity: 'high',
      category: 'Collateral',
      detail: `The appraisal of ${formatCurrency(terms.appraised_value)} is below the ${formatCurrency(terms.purchase_price)} purchase price, and lenders will size to the lesser of the two.`,
      mitigant: 'Additional equity, a price renegotiation, or a supportable second appraisal each resolve the constraint.',
      question: 'How is the gap between appraised value and purchase price being addressed?',
    })
  }

  if (!summary.sourcesAndUses.balanced && summary.sourcesAndUses.totalUses > 0) {
    findings.push({
      title: 'Sources and uses do not balance',
      severity: 'high',
      category: 'Structure',
      detail: `Sources total ${formatCurrency(summary.sourcesAndUses.totalSources)} against ${formatCurrency(summary.sourcesAndUses.totalUses)} of uses.`,
      question: 'How is the remaining capital requirement being funded?',
    })
  }

  // --- Open discrepancies fold into the risk list -------------------------
  for (const discrepancy of snapshot.openDiscrepancies.filter((d) => d.severity === 'critical' || d.severity === 'high')) {
    findings.push({
      title: discrepancy.title,
      severity: discrepancy.severity,
      category: titleize(discrepancy.category),
      detail: discrepancy.description,
      question: discrepancy.suggested_question ?? undefined,
    })
  }

  // --- Missing data from the score components -----------------------------
  for (const component of score.components) {
    if (component.data_quality === 'missing' && component.key !== 'data_quality') {
      missing.push(`${component.label}: ${component.rationale}`)
    }
  }

  // --- Lender considerations ----------------------------------------------
  if (summary.ltv !== null && summary.ltv > 75) {
    considerations.push('Leverage above 75% will exclude several bank lenders; debt funds and specialty finance lenders are the more likely fit.')
  }
  if (metrics?.medicaid_pct != null && metrics.medicaid_pct > 65) {
    considerations.push(`At ${formatPercent(metrics.medicaid_pct)} Medicaid, lenders that cap Medicaid exposure at 65% will screen this out on payer mix alone.`)
  }
  if (deal.transaction_type === 'acquisition' && (sponsor?.facilities_operated ?? 0) <= 2) {
    considerations.push('First- or second-facility acquisitions are typically financed by regional banks and SBA-eligible lenders rather than national balance-sheet lenders.')
  }
  if (summary.dscr !== null && summary.dscr >= 1.5 && summary.ltv !== null && summary.ltv <= 70) {
    considerations.push('The combination of low leverage and strong coverage should attract competitive bank pricing; the borrower is well positioned to run a process rather than accept a first quote.')
  }
  if (terms?.target_close_date) {
    const days = Math.ceil((new Date(terms.target_close_date).getTime() - Date.now()) / 86_400_000)
    if (days > 0 && days < 45) {
      considerations.push(`A ${days}-day closing timeline rules out lenders whose credit process runs 60 days or longer; bridge and specialty lenders are the realistic pool.`)
    }
  }

  // Questions: from findings first, then generic gaps.
  for (const finding of findings) {
    if (finding.question) questions.push(finding.question)
  }
  if (!snapshot.documents.some((d) => d.doc_type === 'tax_return')) {
    questions.push('Can you provide the last two years of business tax returns to reconcile against the operating statements?')
  }
  if (latest && !latest.items.capex) {
    questions.push('What has annual capital expenditure been over the last three years, and what is planned post-closing?')
  }

  const mitigants = findings.map((f) => f.mitigant).filter((m): m is string => Boolean(m))

  const summaryText = buildSummary(snapshot, score, strengths.length, findings.length)

  return {
    overall_score: score.overall,
    summary: summaryText,
    strengths: dedupe(strengths).slice(0, 20),
    risks: findings.slice(0, 30).map((f) => ({
      title: f.title, severity: f.severity, detail: f.detail, category: f.category,
    })),
    questions: dedupe(questions).slice(0, 30),
    missing_information: dedupe(missing).slice(0, 30),
    potential_mitigants: dedupe(mitigants).slice(0, 20),
    lender_considerations: dedupe(considerations).slice(0, 20),
    confidence: score.confidence,
  }
}

function buildSummary(snapshot: DealSnapshot, score: DealScore, strengthCount: number, riskCount: number): string {
  const { deal, facility, summary } = snapshot
  const beds = facility?.operating_beds ?? facility?.licensed_beds
  const descriptor = [
    beds ? `${beds}-bed` : null,
    assetNoun(deal.asset_type),
    facility?.state ? `in ${stateName(facility.state)}` : null,
  ].filter(Boolean).join(' ')

  const metrics = [
    summary.loanAmount ? `${formatCurrency(summary.loanAmount, { compact: true })} requested` : null,
    summary.ltv !== null ? `${formatPercent(summary.ltv)} LTV` : null,
    summary.dscr !== null ? `${formatRatio(summary.dscr)} DSCR` : null,
    summary.debtYield !== null ? `${formatPercent(summary.debtYield)} debt yield` : null,
  ].filter(Boolean).join(', ')

  return [
    `${titleize(deal.transaction_type)} financing for a ${descriptor}.`,
    metrics ? `Underwritten at ${metrics}.` : 'Key metrics are not yet computable from the information provided.',
    `The analysis identifies ${strengthCount} supporting factor${strengthCount === 1 ? '' : 's'} and ${riskCount} item${riskCount === 1 ? '' : 's'} a lender is likely to question.`,
    `Deal score of ${score.overall} reflects ${score.coverage}% coverage of the expected underwriting inputs; the score should be read alongside its components rather than on its own.`,
    'This analysis is decision support for the parties to the transaction. It is not a credit decision, a commitment, or an offer of financing.',
  ].join(' ')
}

function dedupe(values: string[]): string[] {
  return [...new Set(values.map((v) => v.trim()).filter(Boolean))]
}
