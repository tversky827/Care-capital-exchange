import type { DealChatAnswer } from '@/lib/ai/schemas'
import type { DealSnapshot } from '@/lib/deal/snapshot'
import { formatCurrency, formatPercent, formatRatio, titleize } from '@/lib/utils/format'
import type { CreditAnalysis, DocumentRecord, ExtractedField } from '@/types'

/**
 * "Ask the Deal" — retrieval over the deal record.
 *
 * The deterministic implementation answers from structured deal data and
 * extracted fields, citing the document each figure came from. It answers what
 * it can and says plainly when the record does not contain the answer, which
 * is the behaviour that matters: a confident wrong answer about a $10M
 * financing is worse than no answer.
 */

export interface ChatContext {
  snapshot: DealSnapshot
  extracted: ExtractedField[]
  documents: DocumentRecord[]
  analysis: CreditAnalysis | null
}

type Handler = {
  key: string
  match: RegExp
  run: (context: ChatContext) => DealChatAnswer | null
}

function citationsFor(context: ChatContext, fieldNames: string[]): DealChatAnswer['citations'] {
  const out: DealChatAnswer['citations'] = []
  for (const field of context.extracted) {
    if (!fieldNames.includes(field.field_name) || !field.document_id) continue
    const document = context.documents.find((d) => d.id === field.document_id)
    if (!document) continue
    out.push({
      document_id: document.id,
      label: `${titleize(field.field_name)}${field.year ? ` (${field.year})` : ''} — ${document.display_name}`,
      page: field.page_number,
      quote: field.source_text,
    })
    if (out.length >= 8) break
  }
  return out
}

const HANDLERS: Handler[] = [
  {
    key: 'risks',
    match: /\b(risk|concern|worry|problem|weakness|red flag)/i,
    run: ({ analysis }) => {
      if (!analysis?.risks.length) return null
      const top = analysis.risks.slice(0, 5)
      return {
        answer: `The analysis identifies ${analysis.risks.length} item${analysis.risks.length === 1 ? '' : 's'} a lender is likely to question. The most significant:\n\n${top
          .map((r, i) => `${i + 1}. **${r.title}** (${r.severity})\n   ${r.detail}`)
          .join('\n\n')}`,
        citations: [],
        insufficient_information: false,
      }
    },
  },
  {
    key: 'lender_questions',
    match: /\b(lender.*(question|ask|probe)|what would.*question|push ?back)/i,
    run: ({ analysis }) => {
      if (!analysis?.questions.length) return null
      return {
        answer: `Based on the deal as it stands, these are the questions most likely to come back from a credit committee:\n\n${analysis.questions
          .slice(0, 8)
          .map((q, i) => `${i + 1}. ${q}`)
          .join('\n')}`,
        citations: [],
        insufficient_information: false,
      }
    },
  },
  {
    key: 'missing',
    match: /\b(missing|still need|outstanding|incomplete|what.*don't have)/i,
    run: ({ analysis, snapshot }) => {
      const missing = analysis?.missing_information ?? []
      const open = snapshot.openDiscrepancies
      if (!missing.length && !open.length) {
        return {
          answer: 'Nothing is currently flagged as missing, and there are no open discrepancies on this deal.',
          citations: [],
          insufficient_information: false,
        }
      }
      return {
        answer: [
          missing.length ? `Information still outstanding:\n${missing.map((m) => `  • ${m}`).join('\n')}` : '',
          open.length
            ? `\nOpen items needing attention (${open.length}):\n${open.slice(0, 8).map((d) => `  • ${d.title}`).join('\n')}`
            : '',
        ].filter(Boolean).join('\n'),
        citations: [],
        insufficient_information: false,
      }
    },
  },
  {
    key: 'ebitda_change',
    match: /\b(ebitda|margin|cash flow|profit).*(decline|drop|fall|decrease|change|increase|grow)|why.*(ebitda|margin)/i,
    run: (context) => {
      const { latest, prior, summary } = context.snapshot
      if (!latest || !prior || latest.items.ebitda == null || prior.items.ebitda == null) return null
      const drivers: string[] = []
      const compare = (key: 'revenue' | 'labor_expense' | 'agency_labor' | 'rent' | 'utilities' | 'insurance') => {
        const now = latest.items[key]
        const then = prior.items[key]
        if (now == null || then == null || then === 0) return
        const change = ((now - then) / Math.abs(then)) * 100
        if (Math.abs(change) >= 3) {
          drivers.push(`${titleize(key)} ${change >= 0 ? 'rose' : 'fell'} ${formatPercent(Math.abs(change))} (${formatCurrency(then)} → ${formatCurrency(now)})`)
        }
      }
      ;(['revenue', 'labor_expense', 'agency_labor', 'rent', 'utilities', 'insurance'] as const).forEach(compare)

      return {
        answer: `EBITDA moved from ${formatCurrency(prior.items.ebitda)} in ${prior.period.label} to ${formatCurrency(latest.items.ebitda)} in ${latest.period.label}, a change of ${formatPercent(summary.ebitdaGrowthPct)}.\n\n${
          drivers.length ? `The line items that moved materially:\n${drivers.map((d) => `  • ${d}`).join('\n')}` : 'No individual expense line moved materially; the change is spread across the statement.'
        }\n\nThe deal record shows what changed, not why. The explanation itself has to come from the operator.`,
        citations: citationsFor(context, ['ebitda', 'revenue', 'labor_expense', 'agency_labor']),
        insufficient_information: false,
      }
    },
  },
  {
    key: 'revenue_support',
    match: /\b(which|what).*(document|support|source|back).*(revenue|number|figure)|where.*revenue.*from/i,
    run: (context) => {
      const sources = context.extracted.filter((f) => f.field_name === 'revenue' && f.document_id)
      if (!sources.length) return null
      return {
        answer: `Revenue is supported by ${sources.length} extracted value${sources.length === 1 ? '' : 's'}:\n\n${sources
          .slice(0, 10)
          .map((f) => {
            const doc = context.documents.find((d) => d.id === f.document_id)
            return `  • ${f.year ?? 'unspecified period'}: ${formatCurrency(f.normalized_value)} — ${doc?.display_name ?? 'unknown document'}${f.page_number ? `, page ${f.page_number}` : ''} (confidence ${(f.confidence * 100).toFixed(0)}%)`
          })
          .join('\n')}`,
        citations: citationsFor(context, ['revenue']),
        insufficient_information: false,
      }
    },
  },
  {
    key: 'debt',
    match: /\b(debt|obligation|loan|mortgage|leverage|ltv)\b/i,
    run: (context) => {
      const { summary, terms } = context.snapshot
      return {
        answer: [
          `Requested financing: ${formatCurrency(summary.loanAmount)}`,
          `Existing debt to be retired: ${formatCurrency(terms?.existing_debt ?? null)}`,
          `Seller financing: ${formatCurrency(terms?.seller_financing ?? null)}`,
          `Loan-to-value: ${formatPercent(summary.ltv)} against a value basis of ${formatCurrency(summary.valueBasis)}`,
          `Loan-to-cost: ${formatPercent(summary.loanToCost)}`,
          `Annual debt service: ${formatCurrency(summary.annualDebtService)}`,
          `Debt service coverage: ${formatRatio(summary.dscr)}`,
          `Debt yield: ${formatPercent(summary.debtYield)}`,
          `Balloon balance at maturity: ${formatCurrency(summary.balloonBalance)}`,
        ].join('\n'),
        citations: citationsFor(context, ['existing_debt', 'requested_financing']),
        insufficient_information: false,
      }
    },
  },
  {
    key: 'payer_mix',
    match: /\b(payer|medicaid|medicare|private pay|managed care|reimburse)/i,
    run: (context) => {
      const metrics = context.snapshot.metrics
      if (!metrics) return null
      return {
        answer: `Payer mix for ${metrics.period_label}:\n\n  • Medicare: ${formatPercent(metrics.medicare_pct)}\n  • Medicaid: ${formatPercent(metrics.medicaid_pct)}\n  • Managed care: ${formatPercent(metrics.managed_care_pct)}\n  • Private pay: ${formatPercent(metrics.private_pay_pct)}\n  • Other: ${formatPercent(metrics.other_payer_pct)}\n\n${
          (metrics.medicaid_pct ?? 0) > 70
            ? 'Medicaid concentration above 70% will screen this deal out with several lenders whose stated criteria cap Medicaid exposure.'
            : 'Payer concentration is within the range most healthcare lenders will consider.'
        }`,
        citations: citationsFor(context, ['medicaid_pct', 'medicare_pct', 'private_pay_pct']),
        insufficient_information: false,
      }
    },
  },
  {
    key: 'occupancy',
    match: /\b(occupancy|census|beds|capacity)\b/i,
    run: (context) => {
      const { facility, metricHistory, summary } = context.snapshot
      if (!facility) return null
      return {
        answer: [
          `Licensed beds: ${facility.licensed_beds ?? '—'}`,
          `Operating beds: ${facility.operating_beds ?? '—'}`,
          `Current census: ${facility.current_census ?? '—'}`,
          `Occupancy: ${formatPercent(facility.occupancy_pct ?? summary.occupancyPct)}`,
          metricHistory.length
            ? `\nOccupancy history: ${metricHistory.map((m) => `${m.period_label} ${formatPercent(m.occupancy_pct)}`).join(', ')}`
            : '',
        ].filter(Boolean).join('\n'),
        citations: citationsFor(context, ['occupancy_pct', 'average_census', 'licensed_beds']),
        insufficient_information: false,
      }
    },
  },
  {
    key: 'metrics',
    match: /\b(dscr|coverage|debt yield|metric|underwriting|summary|overview)\b/i,
    run: (context) => {
      const { summary, deal, facility } = context.snapshot
      return {
        answer: [
          `${facility?.name ?? deal.name} — ${titleize(deal.transaction_type)}`,
          '',
          `Requested financing: ${formatCurrency(summary.loanAmount)}`,
          `LTV: ${formatPercent(summary.ltv)}`,
          `DSCR: ${formatRatio(summary.dscr)}`,
          `Debt yield: ${formatPercent(summary.debtYield)}`,
          `Underwritten NOI: ${formatCurrency(summary.noi)}`,
          `EBITDA margin: ${formatPercent(summary.ebitdaMargin)}`,
          `Occupancy: ${formatPercent(summary.occupancyPct)}`,
          '',
          context.snapshot.assumedTerms.assumed
            ? `Coverage assumes ${formatPercent(context.snapshot.assumedTerms.ratePct)} over a ${context.snapshot.assumedTerms.amortizationMonths / 12}-year amortization, since the borrower has not specified terms.`
            : 'Coverage is computed on the terms the borrower requested.',
        ].join('\n'),
        citations: [],
        insufficient_information: false,
      }
    },
  },
]

export function answerDealQuestion(question: string, context: ChatContext): DealChatAnswer {
  for (const handler of HANDLERS) {
    if (!handler.match.test(question)) continue
    const answer = handler.run(context)
    if (answer) return answer
  }

  // No handler matched, or the one that did had nothing to work with.
  const available = [
    context.snapshot.latest ? 'historical financial statements' : null,
    context.snapshot.metrics ? 'census and payer mix detail' : null,
    context.snapshot.sponsor ? 'sponsor background' : null,
    context.documents.length ? `${context.documents.length} uploaded documents` : null,
    context.analysis ? 'a completed underwriting analysis' : null,
  ].filter(Boolean)

  return {
    answer: `The deal record does not contain enough information to answer that reliably, and guessing at a figure on a financing of this size would not be useful.\n\nWhat this deal currently holds: ${available.join(', ') || 'very little — no financials or documents have been added yet'}.\n\nTry asking about the risks a lender would raise, what information is still missing, how EBITDA changed year over year, the payer mix, the debt structure, or which documents support a given figure.`,
    citations: [],
    insufficient_information: true,
  }
}
