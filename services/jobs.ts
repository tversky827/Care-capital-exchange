import 'server-only'
import { db } from '@/db'
import type { Job } from '@/types'

/**
 * Background job runner.
 *
 * Jobs are rows first and execution second: enqueueing writes a `jobs` record,
 * then execution is attempted in-process. That ordering means a crash between
 * the two leaves a recoverable `queued` row rather than losing the work, and it
 * gives administrators a real queue to inspect and retry from.
 *
 * Retries use exponential backoff and a per-job attempt cap; a job that
 * exhausts its attempts is marked `dead` and surfaced in the admin console
 * rather than disappearing.
 */

export type JobHandler = (payload: Record<string, unknown>, job: Job) => Promise<void>

const handlers = new Map<string, JobHandler>()

export function registerJobHandler(kind: string, handler: JobHandler): void {
  handlers.set(kind, handler)
}

/** Ensures the handler registry is populated before a job is executed. */
async function ensureHandlers(): Promise<void> {
  if (handlers.size === 0) await import('@/jobs')
}

export interface EnqueueOptions {
  kind: string
  payload?: Record<string, unknown>
  dealId?: string | null
  maxAttempts?: number
  /** Await execution instead of letting it run in the background. */
  runInline?: boolean
}

export async function enqueue(options: EnqueueOptions): Promise<Job> {
  const store = await db()
  const job = await store.insert('jobs', {
    kind: options.kind,
    payload: options.payload ?? {},
    deal_id: options.dealId ?? null,
    status: 'queued',
    attempts: 0,
    max_attempts: options.maxAttempts ?? 3,
    last_error: null,
    scheduled_at: new Date().toISOString(),
    started_at: null,
    finished_at: null,
    duration_ms: null,
  } as Omit<Job, 'id' | 'created_at'>)

  if (options.runInline) {
    await runJob(job.id)
  } else {
    // Fire and forget: the caller gets a job id to poll, and a failure here is
    // recorded on the job row rather than thrown into the user's request.
    void runJob(job.id).catch((error) => console.error('[jobs] execution failed', job.kind, error))
  }
  return (await store.findById('jobs', job.id)) ?? job
}

export async function runJob(jobId: string): Promise<Job | null> {
  await ensureHandlers()
  const store = await db()
  const job = await store.findById('jobs', jobId)
  if (!job) return null
  if (job.status === 'running' || job.status === 'succeeded') return job

  const handler = handlers.get(job.kind)
  if (!handler) {
    return store.update('jobs', jobId, {
      status: 'dead',
      last_error: `No handler registered for job kind "${job.kind}".`,
      finished_at: new Date().toISOString(),
    })
  }

  const startedAt = Date.now()
  await store.update('jobs', jobId, {
    status: 'running',
    attempts: job.attempts + 1,
    started_at: new Date().toISOString(),
  })

  try {
    await handler(job.payload, job)
    return store.update('jobs', jobId, {
      status: 'succeeded',
      last_error: null,
      finished_at: new Date().toISOString(),
      duration_ms: Date.now() - startedAt,
    })
  } catch (error) {
    const attempts = job.attempts + 1
    const message = error instanceof Error ? error.message : String(error)
    const exhausted = attempts >= job.max_attempts
    const updated = await store.update('jobs', jobId, {
      status: exhausted ? 'dead' : 'failed',
      last_error: message.slice(0, 2000),
      finished_at: new Date().toISOString(),
      duration_ms: Date.now() - startedAt,
    })

    if (!exhausted) {
      // Exponential backoff: 2s, 4s, 8s.
      const delay = 2 ** attempts * 1000
      const timer = setTimeout(() => void runJob(jobId).catch(() => undefined), delay)
      timer.unref?.()
    }
    return updated
  }
}

/** Admin retry: resets the attempt counter and runs the job again. */
export async function retryJob(jobId: string): Promise<Job | null> {
  const store = await db()
  const job = await store.findById('jobs', jobId)
  if (!job) return null
  await store.update('jobs', jobId, { status: 'queued', attempts: 0, last_error: null })
  return runJob(jobId)
}

export async function listJobs(filter: { status?: Job['status']; dealId?: string } = {}, limit = 100): Promise<Job[]> {
  const store = await db()
  const where: Record<string, unknown> = {}
  if (filter.status) where.status = filter.status
  if (filter.dealId) where.deal_id = filter.dealId
  return store.select('jobs', {
    where: where as never,
    orderBy: { field: 'created_at', dir: 'desc' },
    limit,
  })
}
