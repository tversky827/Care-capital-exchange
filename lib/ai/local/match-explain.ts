import type { MatchExplanationPayload } from '@/lib/ai/schemas'
import { BAND_LABELS, type MatchResult } from '@/lib/matching/engine'

/**
 * Turns a deterministic match result into borrower-facing language.
 *
 * The wording rule matters as much as the content: the platform never says a
 * lender will approve anything. It reports how the deal measures against the
 * criteria that lender has published, and nothing more.
 */
export function explainMatch(
  match: MatchResult,
  lenderName: string,
  context: { loanAmount: number | null; assetLabel: string; state: string },
): MatchExplanationPayload {
  const passes = match.factors.filter((f) => f.status === 'pass')

  if (match.hardFail) {
    const blockers = match.factors.filter((f) => f.status === 'fail')
    return {
      headline: `${lenderName} — outside stated lending criteria`,
      narrative: `Based on the criteria ${lenderName} publishes, this opportunity falls outside their box on ${blockers.length === 1 ? 'one point' : `${blockers.length} points`}: ${blockers.map((b) => b.detail).join(' ')} Lenders do make exceptions, but a deal outside a stated boundary is rarely the best use of a first approach.`,
      concerns: blockers.map((b) => b.detail),
    }
  }

  const strongest = [...passes].sort((a, b) => b.score / b.weight - a.score / a.weight).slice(0, 3)

  const narrative = [
    `${lenderName} appears to be a ${BAND_LABELS[match.band].toLowerCase()} for this opportunity based on their stated lending criteria.`,
    strongest.length
      ? `The strongest alignment is on ${strongest.map((f) => f.label.toLowerCase()).join(', ')}: ${strongest.map((f) => f.detail).join(' ')}`
      : '',
    match.concerns.length
      ? `Points the lender is likely to probe: ${match.concerns.join(' ')}`
      : 'No stated criterion is in tension with this deal.',
    'This reflects published lending criteria only. It is not an indication that this lender will offer financing, and every lender reaches its own credit conclusion.',
  ]
    .filter(Boolean)
    .join(' ')

  return {
    headline: `${lenderName} — ${BAND_LABELS[match.band]} (${match.score}%)`,
    narrative,
    concerns: match.concerns,
  }
}
