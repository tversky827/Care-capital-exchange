import 'server-only'
import { db } from '@/db'
import { monthlyBudgetUsd } from '@/lib/ai/routing'
import { log } from '@/lib/observability'
import type { AiUsageEvent } from '@/types'

/**
 * AI usage and cost tracking.
 *
 * Every model call — including the zero-cost local analyst — is recorded, so
 * the admin console can show what the platform is spending and on which deals,
 * and so a runaway loop is visible rather than only appearing on an invoice.
 */

export interface UsageInput {
  dealId?: string | null
  task: string
  provider: string
  model: string
  tokensIn: number
  tokensOut: number
  costUsd: number
  durationMs: number
  success: boolean
}

export async function recordAiUsage(input: UsageInput): Promise<void> {
  try {
    const store = await db()
    await store.insert('ai_usage_events', {
      deal_id: input.dealId ?? null,
      task: input.task,
      provider: input.provider,
      model: input.model,
      tokens_in: input.tokensIn,
      tokens_out: input.tokensOut,
      cost_usd: input.costUsd,
      duration_ms: input.durationMs,
      success: input.success,
    } as Omit<AiUsageEvent, 'id' | 'created_at'>)
  } catch (error) {
    log.error('ai usage write failed', error, { task: input.task, provider: input.provider })
  }
}

export interface UsageSummary {
  monthToDateUsd: number
  budgetUsd: number
  budgetUsedPct: number
  callCount: number
  byTask: { task: string; calls: number; costUsd: number; tokens: number }[]
  byProvider: { provider: string; calls: number; costUsd: number }[]
}

export async function usageSummary(): Promise<UsageSummary> {
  const store = await db()
  const monthStart = new Date()
  monthStart.setUTCDate(1)
  monthStart.setUTCHours(0, 0, 0, 0)

  const events = await store.select('ai_usage_events', {
    where: { created_at: { gte: monthStart.toISOString() } },
  })

  const byTask = new Map<string, { calls: number; costUsd: number; tokens: number }>()
  const byProvider = new Map<string, { calls: number; costUsd: number }>()
  let total = 0

  for (const event of events) {
    total += event.cost_usd
    const task = byTask.get(event.task) ?? { calls: 0, costUsd: 0, tokens: 0 }
    task.calls++
    task.costUsd += event.cost_usd
    task.tokens += event.tokens_in + event.tokens_out
    byTask.set(event.task, task)

    const provider = byProvider.get(event.provider) ?? { calls: 0, costUsd: 0 }
    provider.calls++
    provider.costUsd += event.cost_usd
    byProvider.set(event.provider, provider)
  }

  const budget = monthlyBudgetUsd()
  return {
    monthToDateUsd: Math.round(total * 100) / 100,
    budgetUsd: budget,
    budgetUsedPct: Math.round((total / budget) * 1000) / 10,
    callCount: events.length,
    byTask: [...byTask.entries()]
      .map(([task, stats]) => ({ task, ...stats, costUsd: Math.round(stats.costUsd * 10000) / 10000 }))
      .sort((a, b) => b.costUsd - a.costUsd),
    byProvider: [...byProvider.entries()]
      .map(([provider, stats]) => ({ provider, ...stats, costUsd: Math.round(stats.costUsd * 10000) / 10000 }))
      .sort((a, b) => b.costUsd - a.costUsd),
  }
}

/** True when this month's spend has reached the configured ceiling. */
export async function budgetExhausted(): Promise<boolean> {
  const summary = await usageSummary()
  return summary.monthToDateUsd >= summary.budgetUsd
}
