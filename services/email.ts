import type { EmailMessage, EmailTransport } from './notifications'
import { log } from '@/lib/observability'

/**
 * Outbound email.
 *
 * The platform ships with no mail credentials, so delivery is deliberately
 * pluggable: set RESEND_API_KEY and EMAIL_FROM and real mail goes out, leave
 * them unset and delivery is logged instead. Nothing in the product pretends
 * an email was sent when it was not — screens that depend on delivery ask
 * `mailConfigured()` first and hide themselves when the answer is no.
 */

/** True when this deployment can actually deliver mail to a real inbox. */
export function mailConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY && process.env.EMAIL_FROM)
}

/**
 * Delivery over Resend's HTTP API. Chosen because it needs no dependency —
 * a single fetch — so the repository stays installable without a mail SDK.
 */
export class ResendEmailTransport implements EmailTransport {
  readonly name = 'resend'

  constructor(
    private readonly apiKey: string,
    private readonly from: string,
  ) {}

  async send(message: EmailMessage): Promise<void> {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: this.from,
        to: [message.to],
        subject: message.subject,
        text: message.body,
      }),
    })

    if (!response.ok) {
      // The body can carry the address being mailed; keep it out of the log.
      throw new Error(`Resend rejected the message (${response.status}).`)
    }
  }
}

/** The transport this environment's configuration implies. */
export function resolveTransport(): EmailTransport | null {
  const apiKey = process.env.RESEND_API_KEY
  const from = process.env.EMAIL_FROM
  if (!apiKey || !from) return null
  log.info('email transport configured', { transport: 'resend' })
  return new ResendEmailTransport(apiKey, from)
}
