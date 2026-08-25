/**
 * Seeds the demo database.
 *
 *   npm run seed
 *
 * Against the local file store this is safe to re-run: it truncates first.
 * Against Supabase it refuses to touch a database that already holds data,
 * because clearing someone's hosted project is not a thing a seed script
 * should decide to do. Empty it deliberately first (see the README) and rerun.
 */
import { loadEnv } from './load-env.mts'

loadEnv()

import { getStore } from '@/db'
import { LocalStore } from '@/db/local-store'
import { seedDemoData } from '@/lib/seed/seed'
import { TABLE_NAMES } from '@/db/tables'

async function main(): Promise<void> {
  const store = getStore()
  const started = Date.now()

  if (store.driver === 'local') {
    console.log('Resetting local store…')
    await store.reset()
  } else {
    // The application never auto-seeds a remote database, so this script is
    // the only way demo data gets there — and the one place that has to be
    // careful about what is already in it.
    const existing = await store.count('companies')
    if (existing > 0) {
      console.error(
        `Refusing to seed: ${store.driver} already holds ${existing} companies.\n` +
        'Empty the database first if that is what you intend — this script will\n' +
        'not delete data from a hosted project.',
      )
      process.exitCode = 1
      return
    }
    console.log(`Seeding the ${store.driver} database…`)
  }

  console.log('Seeding demo data…')
  await seedDemoData(store)
  if (store.driver === 'local') await (store as LocalStore).flush()

  const counts: string[] = []
  for (const table of TABLE_NAMES) {
    const count = await store.count(table)
    if (count > 0) counts.push(`  ${table.padEnd(26)} ${count}`)
  }

  console.log(`\nSeeded in ${((Date.now() - started) / 1000).toFixed(1)}s\n`)
  console.log(counts.join('\n'))
  console.log('\nDemo sign-in: admin@carecapital.demo / dana@meridiansenior.demo / healthcare@midwesthealthcarebank.demo')
  console.log('Password: DemoPass123!')
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
