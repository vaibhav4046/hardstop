// Runs the critical journey against a DEPLOYED copy of the app and saves
// screenshots. A green build does not prove the live site works; this does.
//
//   node e2e/live-check.mjs https://hardstop-omega.vercel.app
//
// Exits non-zero on any console error, failed request or wrong verdict.

import { mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from '@playwright/test'

const base = (process.argv[2] ?? '').replace(/\/$/, '')
if (!/^https:\/\//.test(base)) {
  console.error('usage: node e2e/live-check.mjs https://<deployed-host>')
  process.exit(2)
}

const shots = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'qa', 'screenshots', 'live')
mkdirSync(shots, { recursive: true })

const problems = []
const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
page.on('console', (message) => message.type() === 'error' && problems.push(`console: ${message.text()}`))
page.on('pageerror', (error) => problems.push(`pageerror: ${error.message}`))
// A prefetch that the next navigation cancels is reported as aborted; that is
// the browser doing its job, not a failure of the site.
page.on('requestfailed', (request) => {
  const reason = request.failure()?.errorText ?? 'unknown'
  if (reason !== 'net::ERR_ABORTED') problems.push(`request failed (${reason}): ${request.url()}`)
})
page.on('response', (response) => response.status() >= 400 && problems.push(`${response.status()}: ${response.url()}`))

const check = async (label, locator) => {
  try {
    await locator.waitFor({ state: 'visible', timeout: 20_000 })
    console.log(`ok   ${label}`)
  } catch {
    problems.push(`not seen: ${label}`)
    console.log(`FAIL ${label}`)
  }
}

const started = Date.now()
const response = await page.goto(`${base}/`, { waitUntil: 'load' })
const headers = response.headers()
for (const header of ['content-security-policy', 'x-content-type-options', 'x-frame-options', 'referrer-policy']) {
  if (headers[header]) console.log(`ok   header ${header}`)
  else problems.push(`missing header: ${header}`)
}

// Home: the example vault.
console.log(`     page loaded ${Date.now() - started} ms after navigation started`)
const clicked = Date.now()
await page.getByRole('button', { name: 'Agent pays $4' }).click()
await check('home: $4 is paid', page.getByText('Inside every limit. $16.00 left today.').first())
console.log(`     first verdict ${Date.now() - clicked} ms after the click`)
await page.getByRole('button', { name: 'Agent tries $80' }).click()
await check('home: $80 is blocked with the reason', page.getByText('One payment may be at most $10.00.').first())
await page.screenshot({ path: join(shots, 'live-01-home.png') })

// Create a vault with the defaults.
await page.goto(`${base}/protect`)
await page.getByRole('button', { name: 'Review the rules' }).click()
await check('protect: worst case shown before creating', page.getByText('Worst case in the next 24 hours'))
await page.getByRole('button', { name: 'Create vault' }).click()
await page.waitForURL(`${base}/activity`)
await check('activity: vault holds $100.00', page.getByText('$100.00').first())

// Allowed, blocked, the agent's own raise, pause.
await page.getByRole('button', { name: 'Pay $4.00 to Cloud hosting' }).click()
await check('activity: $4 is paid', page.getByText('Inside every limit. $16.00 left today.').first())
await page.getByRole('button', { name: 'Pay $80.00 to Cloud hosting' }).click()
await check('activity: $80 is blocked', page.getByText('One payment may be at most $10.00.').first())
await page.getByRole('button', { name: 'Send the last paid request again' }).click()
await check('activity: a repeated request is blocked', page.getByText('Blocked: repeat request').first())
await page.getByRole('button', { name: /Raise its own limit/ }).click()
await check('activity: the agent cannot change the rules', page.getByText('Rejected. Only you can change the rules.').first())
await page.getByRole('button', { name: 'Pause the agent now' }).click()
await page.getByRole('button', { name: 'Pay $4.00 to Cloud hosting' }).click()
await check('activity: paused blocks the next payment', page.getByText('Blocked: paused').first())
await page.screenshot({ path: join(shots, 'live-02-activity.png'), fullPage: true })

// The vault survives a reload.
await page.reload()
await check('activity: reload restores the vault', page.getByText('Blocked: paused').first())

for (const path of ['/how-it-works', '/developers']) {
  await page.goto(`${base}${path}`)
  await check(`${path} renders`, page.getByRole('heading', { level: 1 }))
}

await browser.close()
if (problems.length > 0) {
  console.log(`\n${problems.length} problem(s):\n` + problems.map((problem) => `  ${problem}`).join('\n'))
  process.exit(1)
}
console.log(`\nlive check passed against ${base}`)
