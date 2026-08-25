import type { EmailMessage } from '../notifications'

/**
 * Email content for the equity marketplace.
 *
 * Written as plain text on purpose. These messages tell someone that money,
 * a document or a deadline concerns them, and a plain sentence carries that
 * better than a layout does — it also renders identically everywhere and
 * cannot leak a tracking pixel into an investor's inbox.
 *
 * Two rules hold for every template. No figure appears here that the caller
 * did not compute, and nothing is described as guaranteed, approved, expected
 * or safe. The subject line says what happened; the body says what to do.
 */

const SIGN_OFF = [
  '—',
  'CareCapital Exchange',
  '',
  'CareCapital Exchange is not a broker-dealer, investment adviser or funding portal,',
  'and does not recommend investments. Private investments are illiquid and can lose',
  'their entire value.',
].join('\n')

function compose(to: string, subject: string, lines: (string | null)[]): EmailMessage {
  return {
    to,
    subject,
    body: [...lines.filter((line): line is string => line !== null), '', SIGN_OFF].join('\n'),
  }
}

export interface OfferingEmailContext {
  investorName: string
  offeringName: string
  /** Absolute URL to the offering or portfolio page. */
  href: string
}

/** A published offering matches what the investor said they look for. */
export function newMatchEmail(
  to: string,
  context: OfferingEmailContext & { reasons: string[] },
): EmailMessage {
  return compose(to, `A new offering matches your preferences: ${context.offeringName}`, [
    `${context.investorName},`,
    '',
    `${context.offeringName} has been published and is consistent with the preferences you have set:`,
    '',
    ...context.reasons.slice(0, 4).map((reason) => `  · ${reason}`),
    '',
    'This is a match against your stated preferences, not a recommendation to invest.',
    '',
    context.href,
  ])
}

export function offeringOpenEmail(to: string, context: OfferingEmailContext): EmailMessage {
  return compose(to, `${context.offeringName} is open for investment`, [
    `${context.investorName},`,
    '',
    `${context.offeringName} is now accepting commitments.`,
    'Read the offering documents and risk disclosures before deciding whether it suits you.',
    '',
    context.href,
  ])
}

export function closingSoonEmail(
  to: string,
  context: OfferingEmailContext & { closesOn: string },
): EmailMessage {
  return compose(to, `${context.offeringName} closes on ${context.closesOn}`, [
    `${context.investorName},`,
    '',
    `${context.offeringName} is scheduled to close on ${context.closesOn}.`,
    'If you intend to participate, allow time for verification and document review.',
    '',
    context.href,
  ])
}

export function documentAddedEmail(
  to: string,
  context: OfferingEmailContext & { documentName: string },
): EmailMessage {
  return compose(to, `New document in ${context.offeringName}`, [
    `${context.investorName},`,
    '',
    `${context.documentName} has been added to the data room for ${context.offeringName}.`,
    '',
    context.href,
  ])
}

export function verificationRequiredEmail(
  to: string,
  context: { investorName: string; whatIsNeeded: string; href: string },
): EmailMessage {
  return compose(to, 'Verification needed before you can invest', [
    `${context.investorName},`,
    '',
    `${context.whatIsNeeded}`,
    '',
    'Verification is performed by an external provider. CareCapital Exchange receives the',
    'result and a reference, and does not store your identity documents.',
    '',
    context.href,
  ])
}

export function commitmentStatusEmail(
  to: string,
  context: OfferingEmailContext & { status: string; amount: string },
): EmailMessage {
  return compose(to, `Your commitment to ${context.offeringName} is ${context.status}`, [
    `${context.investorName},`,
    '',
    `Your commitment of ${context.amount} to ${context.offeringName} is now ${context.status}.`,
    '',
    'A commitment records your intention to invest. It is not itself a purchase of securities.',
    '',
    context.href,
  ])
}

export function quarterlyUpdateEmail(
  to: string,
  context: OfferingEmailContext & { period: string; highlights: string[] },
): EmailMessage {
  return compose(to, `${context.offeringName}: ${context.period} update`, [
    `${context.investorName},`,
    '',
    `The sponsor has published its ${context.period} update for ${context.offeringName}.`,
    '',
    ...context.highlights.slice(0, 5).map((highlight) => `  · ${highlight}`),
    '',
    'These are actual results for the period, not projections. Past performance does not',
    'indicate future results.',
    '',
    context.href,
  ])
}

export function distributionEmail(
  to: string,
  context: OfferingEmailContext & { amount: string; period: string },
): EmailMessage {
  return compose(to, `Distribution posted for ${context.offeringName}`, [
    `${context.investorName},`,
    '',
    `A distribution of ${context.amount} has been recorded for ${context.period}.`,
    'Your statement shows how the amount splits between return of capital, preferred return',
    'and profit share.',
    '',
    context.href,
  ])
}

export function taxDocumentEmail(
  to: string,
  context: OfferingEmailContext & { form: string; taxYear: number },
): EmailMessage {
  return compose(to, `${context.form} available for ${context.taxYear}`, [
    `${context.investorName},`,
    '',
    `Your ${context.form} for ${context.taxYear} is available for ${context.offeringName}.`,
    '',
    'CareCapital Exchange does not provide tax advice. Questions about this document should',
    'go to the issuer or your own adviser.',
    '',
    context.href,
  ])
}
