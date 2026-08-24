import 'server-only'
import { LocalStore } from './local-store'
import { SupabaseStore } from './supabase-store'
import type { Store } from './store'

export * from './query'
export * from './store'
export * from './tables'

type Global = typeof globalThis & {
  __ccxStore?: Store
  __ccxSeed?: Promise<void>
  __ccxSeeding?: boolean
}

const g = globalThis as Global

function createStore(): Store {
  const driver = process.env.DATA_DRIVER ?? 'local'
  if (driver === 'supabase') {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!url || !key) {
      throw new Error(
        'DATA_DRIVER=supabase requires NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.',
      )
    }
    return new SupabaseStore(url, key)
  }
  return new LocalStore()
}

/** Process-wide store singleton (survives Next.js dev module reloads). */
export function getStore(): Store {
  return (g.__ccxStore ??= createStore())
}

/**
 * Ensures demo data exists before the first query. Runs at most once per
 * process; concurrent callers await the same promise.
 */
export async function ensureSeeded(): Promise<void> {
  if (process.env.SEED_DEMO_DATA === 'false') return
  // The seeder itself calls db(); returning early here keeps that re-entrant
  // call from awaiting the seed promise it is running inside.
  if (g.__ccxSeeding) return
  const store = getStore()
  if (store.driver !== 'local') return
  g.__ccxSeed ??= (async () => {
    const local = store as LocalStore
    if (!(await local.isEmpty())) return
    g.__ccxSeeding = true
    try {
      const { seedDemoData } = await import('@/lib/seed/seed')
      await seedDemoData(store)
      await local.flush()
    } finally {
      g.__ccxSeeding = false
    }
  })().catch((error) => {
    g.__ccxSeed = undefined
    throw error
  })
  return g.__ccxSeed
}

/** Store handle that guarantees demo data is present. Use this in app code. */
export async function db(): Promise<Store> {
  await ensureSeeded()
  return getStore()
}
