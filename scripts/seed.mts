/**
 * Seeds the local demo database. Safe to re-run: it truncates first.
 *
 *   npm run seed
 */
import { loadEnv } from './load-env.mts'

loadEnv()

import { getStore } from '@/db'
import { LocalStore } from '@/db/local-store'
import { seedDemoData } from '@/lib/seed/seed'
import { TABLE_NAMES } from '@/db/tables'

async function main(): Promise<void> {
  const store = getStore()
  if (store.driver !== 'local') {
    console.error('Seeding targets the local driver. Set DATA_DRIVER=local (or unset it) and retry.')
    process.exitCode = 1
    return
  }

  const started = Date.now()
  console.log('Resetting local store…')
  await store.reset()

  console.log('Seeding demo data…')
  await seedDemoData(store)
  await (store as LocalStore).flush()

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
