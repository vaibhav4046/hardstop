// Runs the critical journey against a DEPLOYED copy of the app and saves
// screenshots. A green build does not prove the live site works; this does.
//
//   node e2e/live-check.mjs https://hardstop-omega.vercel.app
//   BROWSER=firefox node e2e/live-check.mjs ...   (or webkit, the engine of Safari)
//
// Exits non-zero on any console error, failed request or wrong verdict.

import { mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium, firefox, webkit } from '@playwright/test'

const base = (process.argv[2] ?? '').replace(/\/$/, '')
if (!/^https:\/\//.test(base)) {
  console.error('usage: node e2e/live-check.mjs https://<deployed-host>')
  process.exit(2)
}

const engine = process.env.BROWSER ?? 'chromium'
const engines = { chromium, firefox, webkit }
if (!(engine in engines)) {
  console.error('BROWSER must be chromium, firefox or webkit')
  process.exit(2)
}
const shots = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'qa', 'screenshots', engine === 'chromium' ? 'live' : 'live-' + engine)
mkdirSync(shots, { recursive: true })

const problems = []
const browser = await engines[engine].launch()
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
page.on('console', (message) => message.type() === 'error' && problems.push(`console: ${message.text()}`))
// A Next.js prefetch (a URL with `_rsc=`) that this script's own page.goto
// cancels is the browser doing its job, not a failure of the site. Each
// engine words it its own way: Chromium "net::ERR_ABORTED", Firefox
// "NS_BINDING_ABORTED", WebKit "Load request cancelled" plus a page error
// "... due to access control checks". Staying on a page, or clicking a link
// as a person does, shows none of these in any engine (checked 2026-11-21).
const cancelledPrefetch = (text) => /_rsc=/.test(text)
const ABORTED = new Set(['net::ERR_ABORTED', 'NS_BINDING_ABORTED', 'Load request cancelled'])
page.on('pageerror', (error) => {
  if (!(cancelledPrefetch(error.message) && /access control checks/.test(error.message))) problems.push(`pageerror: ${error.message}`)
})
page.on('requestfailed', (request) => {
  const reason = request.failure()?.errorText ?? 'unknown'
  if (!(ABORTED.has(reason) && (reason === 'net::ERR_ABORTED' || cancelledPrefetch(request.url())))) {
    problems.push(`request failed (${reason}): ${request.url()}`)
  }
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
await page.getByRole('button', { name: 'Create it in this browser' }).click()
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

// The practice MCP server answers an MCP client: initialize, then a payment
// that is paid and one that is refused, in a session of its own.
for (const path of ['/mcp', '/mcp/tricked']) {
  const mcp = async (body, session) => {
    const response = await fetch(`${base}${path}`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json, text/event-stream',
        'mcp-protocol-version': '2025-06-18',
        ...(session ? { 'mcp-session-id': session } : {}),
      },
      body: JSON.stringify(body),
    })
    const text = await response.text()
    return { status: response.status, session: response.headers.get('mcp-session-id'), json: text ? JSON.parse(text) : null }
  }
  try {
    const init = await mcp({
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'live-check', version: '1' } },
    })
    if (init.status !== 200 || !init.session || init.json?.result?.serverInfo?.name !== 'hardstop') {
      problems.push(`${path}: initialize answered ${init.status} ${JSON.stringify(init.json)}`)
      continue
    }
    await mcp({ jsonrpc: '2.0', method: 'notifications/initialized' }, init.session)
    const pay = (id, amount) =>
      mcp({ jsonrpc: '2.0', id, method: 'tools/call', params: { name: 'hardstop_pay', arguments: { to: 'Cloud hosting', amount_usd: amount } } }, init.session)
    const small = (await pay(2, path === '/mcp' ? '3' : '500')).json?.result?.content?.[0]?.text ?? ''
    const expected = path === '/mcp' ? /^✅ Paid/m : /^⛔ Refused/m
    if (!expected.test(small)) problems.push(`${path}: payment answered ${JSON.stringify(small)}`)
    else console.log(`ok   ${path}: ${small.split('\n')[0]}`)
  } catch (error) {
    problems.push(`${path}: ${error.message}`)
  }
}

if (problems.length > 0) {
  console.log(`\n${problems.length} problem(s):\n` + problems.map((problem) => `  ${problem}`).join('\n'))
  process.exit(1)
}
console.log(`\nlive check passed against ${base} in ${engine}`)
