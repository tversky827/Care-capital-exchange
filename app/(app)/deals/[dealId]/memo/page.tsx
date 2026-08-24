import Link from 'next/link'
import { notFound } from 'next/navigation'
import { FileDown, Printer } from 'lucide-react'
import { db } from '@/db'
import { requireActor } from '@/lib/auth/session'
import { subjectOf } from '@/lib/access'
import { canEditDeal } from '@/lib/policy'
import { currentMemo, memoVersions } from '@/services/memo'
import { buildSnapshot } from '@/lib/deal/snapshot'
import { Alert, Badge, Button, Card, CardBody, EmptyState, Section } from '@/components/ui/primitives'
import { InlineAction } from '@/components/forms/action-form'
import { MemoEditor } from './memo-editor'
import { generateMemoAction } from '../../actions'
import { formatDateTime } from '@/lib/utils/format'

/**
 * Credit memo.
 *
 * Citations are rendered as links back to the source document, which is the
 * property that makes the memo usable by a lender who did not assemble the
 * deal: any figure can be checked in two clicks.
 */
export default async function MemoPage({ params }: { params: Promise<{ dealId: string }> }) {
  const { dealId } = await params
  const actor = await requireActor()

  const snapshot = await buildSnapshot(dealId)
  if (!snapshot) notFound()

  const [current, versions] = await Promise.all([currentMemo(dealId), memoVersions(dealId)])
  const canEdit = canEditDeal(subjectOf(actor), snapshot.deal)

  const store = await db()
  const users = await store.select('users', {})
  const userName = new Map(users.map((user) => [user.id, user.full_name]))

  if (!current) {
    return (
      <Card>
        <EmptyState
          title="No credit memo yet"
          description="The memo assembles the full institutional package — executive summary through conclusion — from the deal record, with every financial fact traced back to the document it came from."
          action={
            canEdit ? (
              <InlineAction
                action={generateMemoAction}
                label="Generate credit memo"
                hidden={{ dealId }}
                variant="primary"
                size="md"
                pendingLabel="Generating…"
              />
            ) : null
          }
        />
      </Card>
    )
  }

  const { memo, version } = current

  return (
    <div className="space-y-4">
      <div className="no-print flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-[17px] font-semibold text-ink">Credit memorandum</h2>
          <p className="mt-0.5 text-[12px] text-ink-secondary">
            Version {version.version} · {version.generator === 'ai' ? 'Generated' : 'Edited'} by{' '}
            {userName.get(version.generated_by) ?? 'the platform'} · {formatDateTime(version.created_at)}
            {versions.length > 1 ? ` · ${versions.length} versions` : ''}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link href={`/deals/${dealId}/memo/print`} target="_blank">
            <Button size="sm" className="gap-1.5"><Printer className="size-3.5" /> Print / PDF</Button>
          </Link>
          <Link href={`/deals/${dealId}/memo/print?download=1`} target="_blank">
            <Button size="sm" className="gap-1.5"><FileDown className="size-3.5" /> Export</Button>
          </Link>
          {canEdit ? (
            <InlineAction
              action={generateMemoAction}
              label="Regenerate"
              hidden={{ dealId }}
              pendingLabel="Regenerating…"
              confirm="Regenerating creates a new version from the current deal data. The version you are viewing is preserved."
            />
          ) : null}
        </div>
      </div>

      <Alert tone="neutral" className="no-print">
        This memorandum was prepared from information supplied by the borrower and has not been
        independently verified. It supports a lender&apos;s own underwriting; it is not a credit
        approval, a commitment to lend, or an offer of financing.
      </Alert>

      {canEdit ? (
        <MemoEditor dealId={dealId} sections={version.sections} />
      ) : (
        <div className="space-y-3">
          {version.sections.map((section) => (
            <Section key={section.key} title={section.title}>
              <CardBody>
                <pre className="whitespace-pre-wrap font-sans text-[13px] leading-relaxed text-ink-secondary">
                  {section.body}
                </pre>
              </CardBody>
            </Section>
          ))}
        </div>
      )}

      {versions.length > 1 ? (
        <Section title="Version history" className="no-print">
          <ul className="divide-y divide-line">
            {versions.map((entry) => (
              <li key={entry.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-2.5">
                <span className="flex items-center gap-2">
                  <Badge tone={entry.version === memo.current_version ? 'accent' : 'neutral'}>
                    v{entry.version}
                  </Badge>
                  <span className="text-[12px] text-ink-secondary">
                    {entry.generator === 'ai' ? 'Generated' : 'Human edit'} by{' '}
                    {userName.get(entry.generated_by) ?? 'the platform'}
                  </span>
                </span>
                <span className="text-[11px] text-ink-muted">{formatDateTime(entry.created_at)}</span>
              </li>
            ))}
          </ul>
        </Section>
      ) : null}
    </div>
  )
}

export const dynamic = 'force-dynamic'
