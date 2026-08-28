import { chromium } from 'playwright-core'
const OUT='/tmp/claude-0/-home-user-Care-capital-exchange/9a39a782-e840-5259-bf72-0999493a4d0f/scratchpad'
const B='http://localhost:3100'
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' })
const c = await b.newContext({ viewport: { width: 1440, height: 1000 } })
const p = await c.newPage()
const errs = []
p.on('pageerror', e => errs.push(e.message))
await p.goto(`${B}/login`, { waitUntil: 'domcontentloaded' })
await Promise.all([p.waitForURL(u => !u.pathname.startsWith('/login'), { timeout: 120000 }),
                   p.click('button:has-text("Sign in as investor")', { noWaitAfter: true })])
// Wait for real content, not for the network to go quiet.
await p.waitForSelector('a[href^="/investments/"]', { timeout: 60000 })
console.log('listings:', await p.$$eval('a[href^="/investments/"]', a => a.length))
await p.screenshot({ path: `${OUT}/r-browse.png` })

const hrefs = await p.$$eval('a[href^="/investments/"]', a => a.map(x => x.getAttribute('href')))
let gated = null
for (const href of hrefs) {
  await p.goto(B + href, { waitUntil: 'domcontentloaded' })
  await p.waitForSelector('h1', { timeout: 60000 })
  if (await p.$('text=Confidentiality agreement')) { gated = href; break }
}
console.log('found a gated offering:', gated !== null)
await p.screenshot({ path: `${OUT}/r-offering.png`, fullPage: true })

// And an already-signed one shows the detail.
for (const href of hrefs) {
  await p.goto(B + href, { waitUntil: 'domcontentloaded' })
  await p.waitForSelector('h1', { timeout: 60000 })
  if (await p.$('text=What it could pay')) { console.log('signed offering renders detail: yes'); break }
}
console.log(errs.length ? 'PAGE ERRORS: ' + errs.slice(0,4).join(' | ') : 'no page errors')
await b.close()
