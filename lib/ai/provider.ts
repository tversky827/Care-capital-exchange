import type { z } from 'zod'
import { buildPrompt, scanForInjection, type UntrustedDocument } from './prompts'
import { estimateCost, taskConfig, type AiTask } from './routing'

/**
 * The AI service interface.
 *
 * Every AI-assisted operation supplies BOTH a model prompt and a `local`
 * deterministic implementation. When no model provider is configured the local
 * implementation runs and the product is fully functional; when one is
 * configured the model output is validated against the same schema, and any
 * validation failure falls back to the local result rather than failing the
 * user's request. This is what lets the application boot and work end to end
 * with no credentials while still being genuinely model-backed in production.
 */
export interface AiRequest<T> {
  task: AiTask
  instruction: string
  schema: z.ZodType<T>
  schemaName: string
  schemaHint: string
  /** Trusted, platform-computed context. Never user-authored free text. */
  context?: unknown
  /** Untrusted extracts from uploaded files. */
  documents?: UntrustedDocument[]
  local: () => T | Promise<T>
}

export interface AiResult<T> {
  data: T
  provider: string
  model: string | null
  tokensIn: number
  tokensOut: number
  costUsd: number
  durationMs: number
  /** Suspicious instruction-like content detected in the supplied documents. */
  injectionFindings: string[]
  /** Set when the model was consulted but its output could not be used. */
  fallbackReason: string | null
}

export interface AiProvider {
  readonly name: string
  generate<T>(request: AiRequest<T>): Promise<Omit<AiResult<T>, 'injectionFindings'>>
}

// ---------------------------------------------------------------------------
// Local provider — deterministic, no network, no credentials
// ---------------------------------------------------------------------------

export class LocalAnalystProvider implements AiProvider {
  readonly name = 'local-analyst'

  async generate<T>(request: AiRequest<T>): Promise<Omit<AiResult<T>, 'injectionFindings'>> {
    const started = Date.now()
    const raw = await request.local()
    // The local path is validated too: a bug in a rules implementation should
    // surface here rather than as malformed data on a deal.
    const data = request.schema.parse(raw)
    return {
      data,
      provider: this.name,
      model: null,
      tokensIn: 0,
      tokensOut: 0,
      costUsd: 0,
      durationMs: Date.now() - started,
      fallbackReason: null,
    }
  }
}

// ---------------------------------------------------------------------------
// OpenAI-compatible provider
// ---------------------------------------------------------------------------

export class OpenAiProvider implements AiProvider {
  readonly name = 'openai'

  constructor(
    private readonly apiKey: string,
    private readonly baseUrl = process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1',
  ) {}

  async generate<T>(request: AiRequest<T>): Promise<Omit<AiResult<T>, 'injectionFindings'>> {
    const started = Date.now()
    const config = taskConfig(request.task)
    const prompt = buildPrompt({
      instruction: request.instruction,
      schemaName: request.schemaName,
      schemaHint: request.schemaHint,
      context: request.context,
      documents: request.documents,
    })

    try {
      const response = await fetch(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model: config.model,
          temperature: config.temperature,
          max_tokens: config.maxTokens,
          response_format: { type: 'json_object' },
          messages: [
            { role: 'system', content: prompt.system },
            { role: 'user', content: prompt.user },
          ],
        }),
        signal: AbortSignal.timeout(120_000),
      })

      if (!response.ok) {
        const detail = await response.text().catch(() => '')
        throw new Error(`AI provider returned ${response.status}: ${detail.slice(0, 300)}`)
      }

      const payload = (await response.json()) as {
        choices?: { message?: { content?: string } }[]
        usage?: { prompt_tokens?: number; completion_tokens?: number }
      }
      const content = payload.choices?.[0]?.message?.content
      if (!content) throw new Error('AI provider returned an empty response.')

      const parsed = request.schema.safeParse(JSON.parse(content))
      const tokensIn = payload.usage?.prompt_tokens ?? 0
      const tokensOut = payload.usage?.completion_tokens ?? 0

      if (!parsed.success) {
        // Schema violation: use the deterministic result rather than writing
        // unvalidated model output onto a deal.
        return {
          data: request.schema.parse(await request.local()),
          provider: this.name,
          model: config.model,
          tokensIn,
          tokensOut,
          costUsd: estimateCost(request.task, tokensIn, tokensOut),
          durationMs: Date.now() - started,
          fallbackReason: `Response failed ${request.schemaName} validation: ${parsed.error.issues[0]?.message ?? 'unknown'}`,
        }
      }

      return {
        data: parsed.data,
        provider: this.name,
        model: config.model,
        tokensIn,
        tokensOut,
        costUsd: estimateCost(request.task, tokensIn, tokensOut),
        durationMs: Date.now() - started,
        fallbackReason: null,
      }
    } catch (error) {
      return {
        data: request.schema.parse(await request.local()),
        provider: this.name,
        model: config.model,
        tokensIn: 0,
        tokensOut: 0,
        costUsd: 0,
        durationMs: Date.now() - started,
        fallbackReason: error instanceof Error ? error.message : 'AI provider call failed.',
      }
    }
  }
}

let cachedProvider: AiProvider | null = null

export function getAiProvider(): AiProvider {
  if (cachedProvider) return cachedProvider
  const configured = process.env.AI_PROVIDER
  const key = process.env.OPENAI_API_KEY
  cachedProvider =
    configured === 'openai' && key ? new OpenAiProvider(key) : new LocalAnalystProvider()
  return cachedProvider
}

/** Test seam: forces a provider for the duration of a test. */
export function __setAiProvider(provider: AiProvider | null): void {
  cachedProvider = provider
}

export function aiProviderIsLive(): boolean {
  return getAiProvider().name !== 'local-analyst'
}

/**
 * Runs an AI request, records usage, and returns a validated result. Callers
 * never see an unvalidated response and never need to handle a provider error.
 */
export async function runAi<T>(request: AiRequest<T>): Promise<AiResult<T>> {
  const documentText = (request.documents ?? []).map((d) => d.content).join('\n')
  const injectionFindings = documentText ? scanForInjection(documentText) : []
  const result = await getAiProvider().generate(request)
  return { ...result, injectionFindings }
}

export type { UntrustedDocument }
