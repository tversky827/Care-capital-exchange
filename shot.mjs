import { chromium } from 'playwright-core'
const OUT = '/tmp/claude-0/-home-user-Care-capital-exchange/9a39a782-e840-5259-bf72-0999493a4d0f/scratchpad'
const [email, ...paths] = process.argv.slice(2)
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' })
const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } })
const page = await ctx.newPage()
await page.goto('http://localhost:3000/login')
await page.fill('input[name=email]', email)
await page.fill('input[name=password]', 'DemoPass123!')
await Promise.all([page.waitForURL(u => !u.pathname.startsWith('/login'), { timeout: 90000 }), page.click('form button[type=submit]', { noWaitAfter: true })])
console.log('landed:', page.url())
for (const p of paths) {
  await page.goto(`http://localhost:3000${p}`, { waitUntil: 'networkidle' })
  const name = p.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '') || 'root'
  await page.screenshot({ path: `${OUT}/shot-${name}.png`, fullPage: false })
  console.log(p, '->', `shot-${name}.png`)
}
await browser.close()
