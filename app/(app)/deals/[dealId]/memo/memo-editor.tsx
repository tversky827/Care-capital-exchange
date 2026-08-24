'use client'

import Link from 'next/link'
import { useActionState, useState } from 'react'
import { Alert, Badge, Button, Card, CardBody, CardHeader, CardTitle } from '@/components/ui/primitives'
import { saveMemoAction, type ActionState } from '../../actions'
import type { MemoSection } from '@/types'

/**
 * Memo editing.
 *
 * Editing is in place, section by section, and saving creates a new version
 * rather than overwriting — so the AI-generated original stays on the record
 * next to whatever a human changed.
 */
export function MemoEditor({ dealId, sections }: { dealId: string; sections: MemoSection[] }) {
  const [draft, setDraft] = useState(sections)
  const [editing, setEditing] = useState<string | null>(null)
  const [state, submit, pending] = useActionState<ActionState, FormData>(saveMemoAction, {})
  const dirty = JSON.stringify(draft) !== JSON.stringify(sections)

  return (
    <div className="space-y-3">
      {dirty ? (
        <form action={submit} className="no-print sticky top-16 z-20">
          <input type="hidden" name="dealId" value={dealId} />
          <input type="hidden" name="sections" value={JSON.stringify(draft)} />
          <Card className="flex flex-wrap items-center justify-between gap-3 border-accent-line bg-accent-soft p-3">
            <span className="text-[12px] text-accent">
              You have unsaved edits. Saving creates a new version; the current one is preserved.
            </span>
            <span className="flex gap-2">
              <Button type="button" size="sm" onClick={() => setDraft(sections)}>Discard</Button>
              <Button type="submit" size="sm" variant="primary" disabled={pending}>
                {pending ? 'Saving…' : 'Save as new version'}
              </Button>
            </span>
          </Card>
        </form>
      ) : null}

      {state.error ? <Alert tone="critical">{state.error}</Alert> : null}
      {state.success ? <Alert tone="positive">{state.success}</Alert> : null}

      {draft.map((section, index) => (
        <Card key={section.key} className="print-block">
          <CardHeader>
            <CardTitle>{section.title}</CardTitle>
            <button
              type="button"
              onClick={() => setEditing(editing === section.key ? null : section.key)}
              className="no-print text-[12px] text-accent hover:underline"
            >
              {editing === section.key ? 'Done' : 'Edit'}
            </button>
          </CardHeader>
          <CardBody>
            {editing === section.key ? (
              <textarea
                value={section.body}
                onChange={(event) => {
                  const next = [...draft]
                  next[index] = { ...section, body: event.target.value }
                  setDraft(next)
                }}
                rows={Math.min(30, Math.max(6, section.body.split('\n').length + 2))}
                className="w-full border border-line-strong bg-surface px-3 py-2 font-mono text-[12px] leading-relaxed text-ink rounded-[3px] focus:border-accent"
              />
            ) : (
              <pre className="whitespace-pre-wrap font-sans text-[13px] leading-relaxed text-ink-secondary">
                {section.body}
              </pre>
            )}

            {section.citations.length > 0 ? (
              <div className="mt-4 border-t border-line pt-3">
                <p className="eyebrow mb-1.5">Sources</p>
                <ul className="space-y-1">
                  {section.citations.map((citation) => (
                    <li key={citation.marker} className="flex gap-2 text-[11px] leading-relaxed">
                      <Badge tone="neutral" className="shrink-0">{citation.marker}</Badge>
                      {citation.document_id ? (
                        <Link
                          href={`/api/documents/${citation.document_id}/download?disposition=inline`}
                          target="_blank"
                          className="text-accent hover:underline"
                        >
                          {citation.label}
                        </Link>
                      ) : (
                        <span className="text-ink-muted">{citation.label}</span>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </CardBody>
        </Card>
      ))}
    </div>
  )
}
