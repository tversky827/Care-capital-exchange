/**
 * Observability.
 *
 * Structured logging with a pluggable sink, plus timing and error reporting
 * helpers. The default sink writes JSON lines to stdout, which is what every
 * log aggregator ingests without configuration. Sentry, PostHog or anything
 * else attaches by calling `setLogSink` / `setErrorReporter` at startup —
 * nothing else in the application needs to change.
 *
 * Two rules:
 *   * Never log a document's contents, a password hash, or a session token.
 *     `redact` strips the fields most likely to carry them.
 *   * A logging failure never propagates into the caller's request.
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error'

export interface LogEvent {
  level: LogLevel
  message: string
  timestamp: string
  /** Free-form structured fields. Redacted before it reaches the sink. */
  context?: Record<string, unknown>
  durationMs?: number
  error?: { name: string; message: string; stack?: string }
}

export type LogSink = (event: LogEvent) => void
export type ErrorReporter = (error: unknown, context?: Record<string, unknown>) => void

const SENSITIVE_KEYS = new Set([
  'password', 'password_hash', 'passwordhash', 'token', 'session', 'cookie',
  'authorization', 'apikey', 'api_key', 'secret', 'service_role_key', 'content',
  'body', 'source_text', 'raw_response',
])

/** Removes values whose keys suggest credentials or document content. */
export function redact(value: unknown, depth = 0): unknown {
  if (depth > 4) return '[deep]'
  if (value === null || typeof value !== 'object') return value
  if (Array.isArray(value)) return value.slice(0, 20).map((entry) => redact(entry, depth + 1))

  const out: Record<string, unknown> = {}
  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    out[key] = SENSITIVE_KEYS.has(key.toLowerCase()) ? '[redacted]' : redact(entry, depth + 1)
  }
  return out
}

const consoleSink: LogSink = (event) => {
  const line = JSON.stringify(event)
  if (event.level === 'error') console.error(line)
  else if (event.level === 'warn') console.warn(line)
  else console.log(line)
}

let sink: LogSink = consoleSink
let reporter: ErrorReporter | null = null

export function setLogSink(next: LogSink): void {
  sink = next
}

export function setErrorReporter(next: ErrorReporter): void {
  reporter = next
}

function emit(level: LogLevel, message: string, context?: Record<string, unknown>, extra?: Partial<LogEvent>): void {
  // Debug output is noise outside development.
  if (level === 'debug' && process.env.NODE_ENV === 'production') return
  try {
    sink({
      level,
      message,
      timestamp: new Date().toISOString(),
      context: context ? (redact(context) as Record<string, unknown>) : undefined,
      ...extra,
    })
  } catch {
    // A logging failure must never break the request that produced it.
  }
}

export const log = {
  debug: (message: string, context?: Record<string, unknown>) => emit('debug', message, context),
  info: (message: string, context?: Record<string, unknown>) => emit('info', message, context),
  warn: (message: string, context?: Record<string, unknown>) => emit('warn', message, context),
  error: (message: string, error?: unknown, context?: Record<string, unknown>) => {
    const normalized = error instanceof Error ? error : error !== undefined ? new Error(String(error)) : undefined
    emit('error', message, context, {
      error: normalized
        ? { name: normalized.name, message: normalized.message, stack: normalized.stack }
        : undefined,
    })
    if (normalized && reporter) {
      try {
        reporter(normalized, context)
      } catch {
        // An error reporter that throws is not allowed to compound the problem.
      }
    }
  },
}

/**
 * Times an operation and logs its duration, whether it succeeds or fails.
 * Used for the operations worth watching: extraction, underwriting, matching
 * and model calls.
 */
export async function timed<T>(
  name: string,
  operation: () => Promise<T>,
  context?: Record<string, unknown>,
): Promise<T> {
  const started = Date.now()
  try {
    const result = await operation()
    emit('info', name, context, { durationMs: Date.now() - started })
    return result
  } catch (error) {
    const normalized = error instanceof Error ? error : new Error(String(error))
    emit('error', `${name} failed`, context, {
      durationMs: Date.now() - started,
      error: { name: normalized.name, message: normalized.message, stack: normalized.stack },
    })
    if (reporter) {
      try {
        reporter(normalized, { ...context, operation: name })
      } catch {
        // Ignore.
      }
    }
    throw error
  }
}

/** True when an external error reporter has been attached. */
export function errorReportingEnabled(): boolean {
  return reporter !== null
}
