'use client'

import Link from 'next/link'
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Badge, Card } from '@/components/ui/primitives'
import { updatePipelineStageAction } from '../actions'
import { cn } from '@/lib/utils/cn'
import { titleize } from '@/lib/utils/format'

const STAGES = [
  'new_match', 'reviewing', 'requesting_information', 'underwriting', 'indication_submitted',
  'loi', 'diligence', 'credit_committee', 'closing', 'funded', 'passed',
] as const

type Stage = (typeof STAGES)[number]

export interface PipelineCard {
  id: string
  dealId: string
  stage: string
  title: string
  state: string
  amount: string
  ltv: string
  dscr: string
  matchScore: number | null
  indication: string | null
  viewCount: number
}

/**
 * Drag-and-drop pipeline.
 *
 * Built on the native HTML drag-and-drop API rather than a library: the
 * interaction is a single drag target per column, and the card moves optimistically
 * while the server action settles so the board never feels laggy.
 */
export function PipelineBoard({ cards }: { cards: PipelineCard[] }) {
  const router = useRouter()
  const [items, setItems] = useState(cards)
  const [dragging, setDragging] = useState<string | null>(null)
  const [over, setOver] = useState<Stage | null>(null)
  const [, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  // Only render columns that hold something, plus the early funnel stages.
  const visible = STAGES.filter(
    (stage) => items.some((card) => card.stage === stage) ||
      ['new_match', 'reviewing', 'underwriting', 'indication_submitted'].includes(stage),
  )

  function move(cardId: string, stage: Stage) {
    const card = items.find((entry) => entry.id === cardId)
    if (!card || card.stage === stage) return

    setItems((current) => current.map((entry) => (entry.id === cardId ? { ...entry, stage } : entry)))
    setError(null)

    startTransition(async () => {
      const formData = new FormData()
      formData.set('distributionId', cardId)
      formData.set('stage', stage)
      const result = await updatePipelineStageAction({}, formData)
      if (result.error) {
        // Roll the optimistic move back rather than leaving the board lying.
        setItems((current) => current.map((entry) => (entry.id === cardId ? { ...entry, stage: card.stage } : entry)))
        setError(result.error)
      } else {
        router.refresh()
      }
    })
  }

  return (
    <div className="space-y-3">
      {error ? <p className="text-[12px] text-critical">{error}</p> : null}
      <div className="flex gap-3 overflow-x-auto pb-3">
        {visible.map((stage) => {
          const columnCards = items.filter((card) => card.stage === stage)
          return (
            <div
              key={stage}
              onDragOver={(event) => { event.preventDefault(); setOver(stage) }}
              onDragLeave={() => setOver((current) => (current === stage ? null : current))}
              onDrop={(event) => {
                event.preventDefault()
                setOver(null)
                if (dragging) move(dragging, stage)
                setDragging(null)
              }}
              className={cn(
                'flex w-64 shrink-0 flex-col border transition-colors',
                over === stage ? 'border-accent bg-accent-soft/40' : 'border-line bg-surface-sunken/40',
              )}
            >
              <div className="flex items-center justify-between border-b border-line bg-surface px-3 py-2">
                <span className="text-[11px] font-semibold uppercase tracking-[0.04em] text-ink-secondary">
                  {titleize(stage)}
                </span>
                <span className="tnum text-[11px] text-ink-muted">{columnCards.length}</span>
              </div>

              <div className="flex-1 space-y-2 p-2">
                {columnCards.map((card) => (
                  <Card
                    key={card.id}
                    draggable
                    onDragStart={() => setDragging(card.id)}
                    onDragEnd={() => setDragging(null)}
                    className={cn(
                      'cursor-grab p-3 active:cursor-grabbing',
                      dragging === card.id && 'opacity-50',
                    )}
                  >
                    <Link href={`/lender/deals/${card.dealId}`} className="block">
                      <p className="truncate text-[12px] font-medium text-ink hover:text-accent">{card.title}</p>
                      <p className="mt-0.5 text-[11px] text-ink-muted">{card.state} · {card.amount}</p>
                    </Link>
                    <div className="mt-2 flex flex-wrap items-center gap-1">
                      <Badge tone="neutral">{card.ltv} LTV</Badge>
                      <Badge tone="neutral">{card.dscr}</Badge>
                      {card.matchScore !== null ? (
                        <Badge tone={card.matchScore >= 85 ? 'positive' : 'accent'}>{card.matchScore}%</Badge>
                      ) : null}
                    </div>
                    {card.indication ? (
                      <p className="tnum mt-2 border-t border-line pt-1.5 text-[11px] text-ink-secondary">
                        Your terms: {card.indication}
                      </p>
                    ) : null}
                  </Card>
                ))}

                {columnCards.length === 0 ? (
                  <p className="px-2 py-4 text-center text-[11px] text-ink-muted">Drop a deal here</p>
                ) : null}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
