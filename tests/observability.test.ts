import { describe, expect, it, vi } from 'vitest'
import { log, redact, setErrorReporter, setLogSink, timed, type LogEvent } from '@/lib/observability'

describe('redaction', () => {
  it('strips credentials and document content', () => {
    const redacted = redact({
      email: 'user@example.com',
      password: 'hunter2',
      password_hash: 'scrypt$...',
      token: 'abc',
      cookie: 'ccx_session=...',
      source_text: 'Total Revenue: $18,400,000',
      raw_response: { fields: [] },
      loanAmount: 10_500_000,
    }) as Record<string, unknown>

    expect(redacted.email).toBe('user@example.com')
    expect(redacted.loanAmount).toBe(10_500_000)
    for (const key of ['password', 'password_hash', 'token', 'cookie', 'source_text', 'raw_response']) {
      expect(redacted[key], `${key} must be redacted`).toBe('[redacted]')
    }
  })

  it('redacts nested structures', () => {
    const redacted = redact({ deal: { sponsor: { secret: 'x', name: 'Acme' } } }) as never
    expect((redacted as any).deal.sponsor.secret).toBe('[redacted]')
    expect((redacted as any).deal.sponsor.name).toBe('Acme')
  })

  it('does not recurse without bound', () => {
    const deep: Record<string, unknown> = {}
    let node = deep
    for (let i = 0; i < 12; i++) {
      node.next = {}
      node = node.next as Record<string, unknown>
    }
    expect(() => redact(deep)).not.toThrow()
  })
})

describe('logging', () => {
  it('emits structured events through the sink', () => {
    const events: LogEvent[] = []
    setLogSink((event) => events.push(event))
    log.info('deal distributed', { dealId: 'deal-1', lenders: 3 })

    expect(events).toHaveLength(1)
    expect(events[0]!.level).toBe('info')
    expect(events[0]!.message).toBe('deal distributed')
    expect(events[0]!.context).toEqual({ dealId: 'deal-1', lenders: 3 })
    expect(Date.parse(events[0]!.timestamp)).not.toBeNaN()
  })

  it('forwards errors to the reporter without letting it break the caller', () => {
    const events: LogEvent[] = []
    setLogSink((event) => events.push(event))
    const reporter = vi.fn(() => {
      throw new Error('reporter is down')
    })
    setErrorReporter(reporter)

    expect(() => log.error('extraction failed', new Error('bad file'), { documentId: 'd1' })).not.toThrow()
    expect(reporter).toHaveBeenCalledOnce()
    expect(events[0]!.error?.message).toBe('bad file')
  })

  it('never lets a failing sink break the caller', () => {
    setLogSink(() => {
      throw new Error('sink is down')
    })
    expect(() => log.info('anything')).not.toThrow()
  })

  it('times an operation and records its duration on success and failure', async () => {
    const events: LogEvent[] = []
    setLogSink((event) => events.push(event))
    setErrorReporter(() => {})

    await timed('job.document.process', async () => 'done', { jobId: 'j1' })
    expect(events[0]!.durationMs).toBeGreaterThanOrEqual(0)
    expect(events[0]!.level).toBe('info')

    await expect(timed('job.failing', async () => { throw new Error('nope') })).rejects.toThrow('nope')
    expect(events[1]!.level).toBe('error')
    expect(events[1]!.durationMs).toBeGreaterThanOrEqual(0)
  })
})
