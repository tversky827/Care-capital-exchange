import { notFound } from 'next/navigation'
import { db } from '@/db'
import { requireActor } from '@/lib/auth/session'
import { requireDealAccess } from '@/lib/deal-access'

import { SUGGESTED_QUESTIONS } from '@/services/chat'
import { aiProviderIsLive } from '@/lib/ai/provider'
import { Alert, Card, CardBody } from '@/components/ui/primitives'
import { AskPanel } from './ask-panel'

export default async function AskPage({ params }: { params: Promise<{ dealId: string }> }) {
  const { dealId } = await params
  // Authorizes and produces a 404 the framework reports correctly.
  await requireDealAccess(dealId)
  await requireActor()

  const store = await db()
  const deal = await store.findById('deals', dealId)
  if (!deal) notFound()

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div>
        <h2 className="text-[17px] font-semibold text-ink">Ask the deal</h2>
        <p className="mt-0.5 text-[13px] leading-relaxed text-ink-secondary">
          Questions are answered from this deal&apos;s own records — the computed metrics, the extracted
          figures and the documents behind them. Answers cite their source, and when the record does
          not contain the answer it says so rather than estimating.
        </p>
      </div>

      <AskPanel dealId={dealId} suggestions={[...SUGGESTED_QUESTIONS]} />

      {!aiProviderIsLive() ? (
        <Card>
          <CardBody>
            <Alert tone="neutral" title="Answering without a model provider">
              No AI provider is configured, so questions are answered by the built-in retrieval
              analyst working over the same deal record. It handles the common questions — risks,
              missing information, what moved year over year, payer mix, debt structure, which
              document supports a figure — and says plainly when a question is outside what it can
              answer. Configuring a provider routes the identical request to a model.
            </Alert>
          </CardBody>
        </Card>
      ) : null}
    </div>
  )
}

export const dynamic = 'force-dynamic'
