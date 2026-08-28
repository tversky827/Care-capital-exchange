import { cache } from 'react'
import { cookies } from 'next/headers'
import { signToken, verifyToken } from '@/lib/auth/tokens'

/**
 * The three environments.
 *
 * The product is one product. What changes between environments is which
 * catalogue of opportunities a person is looking at and whose money moves:
 *
 *   live     — the real catalogue, the real account, the regulated workflow
 *   practice — the real catalogue, virtual money, no obligation of any kind
 *   demo     — a fictional catalogue, virtual money, for showing the product
 *
 * The pages, the deal record, the documents, the analysis and the investment
 * ticket are the same code in all three. That is the point: a person who has
 * practised has practised on the actual product, not on a tutorial that
 * resembles it.
 */
export type Environment = 'live' | 'practice' | 'demo'

export const ENVIRONMENTS: Environment[] = ['live', 'practice', 'demo']

/** The environments that spend virtual money and can never spend real money. */
export type SandboxEnvironment = 'practice' | 'demo'

export const ENVIRONMENT_COOKIE = 'ccx_env'
const ENVIRONMENT_TTL_SECONDS = 60 * 60 * 12

interface EnvironmentPayload extends Record<string, unknown> {
  env: SandboxEnvironment
  /** The account the cookie was issued to. A lifted cookie is worthless. */
  userId: string
}

function isSandbox(value: unknown): value is SandboxEnvironment {
  return value === 'practice' || value === 'demo'
}

/**
 * The environment this request is running in.
 *
 * Read from a signed cookie and nowhere else. Not from a query parameter, not
 * from a form field, not from a JSON body, not from a header the client
 * controls. A request that says it is a practice request is not evidence of
 * anything; this function is the only thing that decides, and every service
 * that can write calls it rather than being told.
 *
 * Anything that fails to verify — no cookie, bad signature, expired, or issued
 * to a different user — resolves to `live`. Failing closed here would be the
 * wrong closure: `live` is the environment with the real safeguards in front
 * of it, and a person wrongly placed in it is stopped by eligibility, funding
 * and disclosure gates rather than quietly spending virtual money they think
 * is real.
 */
export const currentEnvironment = cache(async (userId?: string): Promise<Environment> => {
  const jar = await cookies()
  const payload = verifyToken<EnvironmentPayload>(jar.get(ENVIRONMENT_COOKIE)?.value)
  if (!payload || !isSandbox(payload.env)) return 'live'
  if (userId !== undefined && payload.userId !== userId) return 'live'
  return payload.env
})

export function environmentToken(env: SandboxEnvironment, userId: string): string {
  return signToken({ env, userId } satisfies EnvironmentPayload, ENVIRONMENT_TTL_SECONDS)
}

export async function enterEnvironment(env: SandboxEnvironment, userId: string): Promise<void> {
  const jar = await cookies()
  jar.set(ENVIRONMENT_COOKIE, environmentToken(env, userId), {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: ENVIRONMENT_TTL_SECONDS,
  })
}

export async function leaveEnvironment(): Promise<void> {
  const jar = await cookies()
  jar.delete(ENVIRONMENT_COOKIE)
}

/** How each environment describes itself wherever it has to be named. */
export const ENVIRONMENT_LABELS: Record<Environment, { label: string; detail: string }> = {
  live: { label: 'Live', detail: 'Real opportunities' },
  practice: {
    label: 'Practice',
    detail: 'Real opportunities · virtual money',
  },
  demo: {
    label: 'Demo',
    detail: 'Fictional data · virtual money',
  },
}

/** True when nothing in this environment can create a financial obligation. */
export function isSandboxEnvironment(env: Environment): env is SandboxEnvironment {
  return env === 'practice' || env === 'demo'
}
