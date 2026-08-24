/**
 * End-to-end smoke check.
 *
 * Mints a real session cookie for a seeded user and walks the routes each role
 * is expected to reach, asserting a 200 and that the page contains an expected
 * marker. This exercises the full server render path — auth, policy, services
 * and engines — rather than testing components in isolation.
 *
 *   npx tsx scripts/smoke.mts [baseUrl]
 */
import { loadEnv } from './load-env.mts'

loadEnv()

import { db } from '@/db'
import { createSessionToken, SESSION_COOKIE } from '@/lib/auth/session'

const BASE = process.argv[2] ?? 'http://localhost:3111'

interface Check {
  path: string
  expect?: string
  allow?: number[]
  /** Text that must NOT appear — used to assert nothing leaked. */
  absent?: string
}

async function cookieFor(email: string): Promise<string> {
  const store = await db()
  const user = await store.selectOne('users', { where: { email } })
  if (!user) throw new Error(`No seeded user ${email}`)
  const membership = await store.selectOne('company_members', { where: { user_id: user.id } })
  if (!membership) throw new Error(`No membership for ${email}`)
  return `${SESSION_COOKIE}=${createSessionToken({ userId: user.id, companyId: membership.company_id })}`
}

async function run(label: string, cookie: string | null, checks: Check[]): Promise<number> {
  let failures = 0
  for (const check of checks) {
    const started = Date.now()
    let status = 0
    let body = ''
    try {
      const response = await fetch(`${BASE}${check.path}`, {
        headers: cookie ? { cookie } : {},
        redirect: 'manual',
      })
      status = response.status
      body = await response.text()
    } catch (error) {
      console.log(`  FAIL ${check.path} — ${(error as Error).message}`)
      failures++
      continue
    }

    const allowed = check.allow ?? [200]
    const statusOk = allowed.includes(status)
    const contentOk =
      (!check.expect || body.includes(check.expect)) &&
      (!check.absent || !body.includes(check.absent))
    const ms = Date.now() - started

    if (statusOk && contentOk) {
      console.log(`  ok   ${String(status).padEnd(3)} ${check.path.padEnd(46)} ${ms}ms`)
    } else {
      failures++
      console.log(
        `  FAIL ${String(status).padEnd(3)} ${check.path.padEnd(46)} ${
          statusOk ? `missing marker "${check.expect}"` : `expected ${allowed.join('/')}`
        }`,
      )
      const error = body.match(/<h2[^>]*>([^<]{5,200})<\/h2>/)?.[1] ?? body.slice(0, 200).replace(/\s+/g, ' ')
      if (!statusOk) console.log(`       ${error}`)
    }
  }
  console.log(`  ${label}: ${checks.length - failures}/${checks.length} passed\n`)
  return failures
}

async function main(): Promise<void> {
  const store = await db()
  // Scope the borrower fixtures to one company: a deal belonging to a different
  // borrower is correctly a 404, which would otherwise read as a failure.
  const borrowerUser = await store.selectOne('users', { where: { email: 'dana@meridiansenior.demo' } })
  const borrowerMembership = await store.selectOne('company_members', { where: { user_id: borrowerUser!.id } })
  const deals = await store.select('deals', {
    where: { company_id: borrowerMembership!.company_id },
    orderBy: { field: 'reference' },
  })
  const withIndications = deals.find((d) => d.status === 'indications_received')
  const ready = deals.find((d) => d.status === 'ready_for_distribution')
  const draft = deals.find((d) => d.status === 'draft')
  const dealId = withIndications?.id ?? deals[0]!.id
  const foreignDeal = (await store.select('deals', {})).find(
    (d) => d.company_id !== borrowerMembership!.company_id,
  )
  const foreignDealId = foreignDeal?.id
  const foreignFacilityName = foreignDeal
    ? (await store.selectOne('facilities', { where: { deal_id: foreignDeal.id } }))?.name
    : undefined
  const lenders = await store.select('lenders', {})
  const lenderId = lenders[0]!.id
  const distribution = await store.selectOne('deal_distributions', { where: { deal_id: dealId } })
  const lenderForDeal = distribution ? await store.findById('lenders', distribution.lender_id) : null
  const lenderUser = lenderForDeal
    ? await store.selectOne('company_members', { where: { company_id: lenderForDeal.company_id } })
    : null
  const lenderEmail = lenderUser
    ? (await store.findById('users', lenderUser.user_id))?.email
    : undefined

  let failures = 0

  console.log('\nPublic routes')
  failures += await run('public', null, [
    { path: '/', expect: 'Healthcare capital' },
    { path: '/how-it-works', expect: 'How it works' },
    { path: '/for-borrowers', expect: 'fifteen banks' },
    { path: '/for-lenders', expect: 'lending box' },
    { path: '/pricing', expect: 'Transaction fees' },
    { path: '/about', expect: 'Principles' },
    { path: '/contact', expect: 'Contact' },
    { path: '/login', expect: 'Sign in' },
    { path: '/signup', expect: 'Create your account' },
    { path: '/dashboard', allow: [307, 302], },
  ])

  console.log('Borrower routes')
  const borrower = await cookieFor('dana@meridiansenior.demo')
  failures += await run('borrower', borrower, [
    { path: '/dashboard', expect: 'Portfolio overview' },
    { path: '/deals', expect: 'Deals' },
    { path: '/deals/new', expect: 'Create a deal' },
    { path: `/deals/${dealId}`, expect: 'Underwriting metrics' },
    { path: `/deals/${dealId}/financials`, expect: 'Financial' },
    { path: `/deals/${dealId}/operations`, expect: 'Operating' },
    { path: `/deals/${dealId}/transaction`, expect: 'Transaction' },
    { path: `/deals/${dealId}/sponsor`, expect: 'Sponsor' },
    { path: `/deals/${dealId}/documents`, expect: 'Data room' },
    { path: `/deals/${dealId}/issues`, expect: 'attention' },
    { path: `/deals/${dealId}/analysis`, expect: 'analysis' },
    { path: `/deals/${dealId}/memo`, expect: 'memo' },
    { path: `/deals/${dealId}/matches`, expect: 'match' },
    { path: `/deals/${dealId}/indications`, expect: 'ndication' },
    { path: `/deals/${dealId}/messages`, expect: 'essage' },
    { path: `/deals/${dealId}/activity`, expect: 'ctivity' },
    { path: `/deals/${dealId}/distribute`, expect: 'istribut' },
    { path: `/deals/${dealId}/ask`, expect: 'Ask' },
    { path: '/analytics', expect: 'Analytics' },
    { path: '/notifications', expect: 'Notifications' },
    { path: '/settings', expect: 'Settings' },
    { path: `/lenders/${lenderId}`, expect: 'lending' },
    { path: '/api/search?q=lake', expect: 'results' },
    // A deal belonging to another borrower must render the not-found page and
    // must not disclose anything about the deal. Next.js reports an in-app
    // notFound() as 200, so the assertion is on content, not status.
    ...(foreignDealId
      ? [{ path: `/deals/${foreignDealId}`, allow: [200, 404], expect: 'Not found', absent: foreignFacilityName ?? '\u0000' }]
      : []),
    ...(ready ? [{ path: `/deals/${ready.id}`, expect: 'Underwriting metrics' }] : []),
    ...(draft ? [{ path: `/deals/${draft.id}/documents`, expect: 'Data room' }] : []),
  ])

  if (lenderEmail) {
    console.log('Lender routes')
    const lender = await cookieFor(lenderEmail)
    failures += await run('lender', lender, [
      { path: '/lender', expect: 'ipeline' },
      { path: '/marketplace', expect: 'arketplace' },
      { path: '/lender/pipeline', expect: 'ipeline' },
      { path: '/lender/box', expect: 'ending box' },
      { path: '/lender/profile', expect: 'rofile' },
      { path: '/lender/analytics', expect: 'nalytics' },
      { path: `/lender/deals/${dealId}`, expect: 'ndication' },
      { path: '/notifications', expect: 'Notifications' },
      // A lender must never reach the borrower workspace; they are routed to
      // the lender deal room instead.
      { path: `/deals/${dealId}`, allow: [307, 302, 200], absent: 'Ask the deal' },
    ])
  }

  console.log('Admin routes')
  const admin = await cookieFor('admin@carecapital.demo')
  failures += await run('admin', admin, [
    { path: '/admin', expect: 'arketplace' },
    { path: '/admin/deals', expect: 'eals' },
    { path: '/admin/lenders', expect: 'erification' },
    { path: '/admin/users', expect: 'sers' },
    { path: '/admin/ai', expect: 'AI' },
    { path: '/admin/jobs', expect: 'obs' },
    { path: '/admin/audit', expect: 'udit' },
    { path: '/admin/billing', expect: 'illing' },
    { path: '/admin/benchmarks', expect: 'enchmark' },
  ])

  if (failures > 0) {
    console.error(`\n${failures} check(s) failed.`)
    process.exitCode = 1
  } else {
    console.log('All smoke checks passed.')
  }
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
