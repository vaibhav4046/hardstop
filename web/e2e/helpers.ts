// Shared by every spec. The `test` exported here fails a test if the page
// logged a console error, threw, or had a network request fail.

import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { test as base, expect, type CDPSession, type Locator, type Page } from '@playwright/test'

export { expect }

export const REPO = path.resolve(import.meta.dirname, '..', '..')
const SHOTS = path.join(REPO, 'qa', 'screenshots')
const METRICS = path.join(REPO, 'qa', 'metrics')

export const ROUTES = ['/', '/protect', '/activity', '/how-it-works', '/developers'] as const
export const STORAGE_KEY = 'hardstop.practice.v1'

type Problems = { list: string[]; aborted: string[] }

/** Collects console errors, page errors and failed requests from a page. */
export function watch(page: Page): Problems {
  const problems: Problems = { list: [], aborted: [] }
  page.on('console', (message) => {
    if (message.type() === 'error') problems.list.push(`console.error: ${message.text()}`)
  })
  page.on('pageerror', (error) => problems.list.push(`pageerror: ${error.message}`))
  page.on('requestfailed', (request) => {
    const failure = request.failure()?.errorText ?? 'unknown'
    // A request the browser itself cancelled, because the page navigated away
    // before a prefetch or a preloaded chunk finished. Not counted as failed
    // here; `settle` fetches each of these again and fails if any is broken.
    if (failure === 'net::ERR_ABORTED' && request.method() === 'GET') {
      problems.aborted.push(request.url())
      return
    }
    problems.list.push(`requestfailed: ${request.method()} ${request.url()} ${failure}`)
  })
  page.on('response', (response) => {
    if (response.status() >= 400) problems.list.push(`http ${response.status()}: ${response.url()}`)
  })
  return problems
}

export const test = base.extend<{ problems: Problems }>({
  problems: [
    async ({ page }, use) => {
      const problems = watch(page)
      await use(problems)
      await settle(page, problems)
    },
    { auto: true },
  ],
})

/** Every request the browser cancelled must load when asked for again; then nothing may be left in the list. */
export async function settle(page: Page, problems: Problems): Promise<void> {
  for (const url of new Set(problems.aborted)) {
    const response = await page.request.get(url)
    if (response.status() !== 200) problems.list.push(`cancelled request does not load: ${response.status()} ${url}`)
  }
  expect(problems.list, 'console errors, page errors and failed requests').toEqual([])
}

/** An evidence screenshot, kept in the repository under qa/screenshots/. */
export async function shot(page: Page, name: string): Promise<string> {
  mkdirSync(SHOTS, { recursive: true })
  const file = path.join(SHOTS, `${name}.png`)
  await page.screenshot({ path: file, fullPage: true, animations: 'disabled' })
  return file
}

/** A measurement, kept under qa/metrics/ so the reports quote real numbers. */
export function record(name: string, data: unknown): void {
  mkdirSync(METRICS, { recursive: true })
  writeFileSync(path.join(METRICS, `${name}.json`), `${JSON.stringify(data, null, 2)}\n`)
}

export const median = (values: number[]): number => {
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}

// --- the activity board ---------------------------------------------------

/** Every line in the receipts list, newest first: slips and one-line notes. */
export const receipts = (page: Page): Locator => page.locator('section[aria-labelledby="receipts-title"] ol > li')
export const newest = (page: Page): Locator => receipts(page).first()
/** The live region that announces each verdict. */
export const announcer = (page: Page): Locator => page.locator('main p[role="status"][aria-live="polite"]')
export const balance = (page: Page): Locator => page.locator('section[aria-labelledby="vault-title"] .figure')
export const rulesInForce = (page: Page): Locator => page.locator('section[aria-labelledby="rules-title"] dl.rows')
export const scheduled = (page: Page): Locator => page.locator('.scheduled')

export async function startExampleVault(page: Page): Promise<void> {
  await page.goto('/activity')
  await page.getByRole('button', { name: 'Start with an example vault' }).click()
  await expect(page.getByRole('heading', { name: 'What the agent tries' })).toBeVisible()
}

/** Clicks something that sends one action to the vault and waits for its line to print. */
export async function act(page: Page, trigger: () => Promise<unknown>): Promise<Locator> {
  const before = await receipts(page).count()
  await trigger()
  await expect(receipts(page)).toHaveCount(before + 1)
  return newest(page)
}

export const press = (page: Page, name: string | RegExp): Promise<Locator> =>
  act(page, () => page.getByRole('button', { name }).click())

async function open(page: Page, summary: string | RegExp): Promise<void> {
  const details = page.locator('details').filter({ has: page.locator('summary', { hasText: summary }) }).last()
  if ((await details.getAttribute('open')) === null) await details.locator('summary').first().click()
}

/** Fills the "Send a different request" form. Does not submit. */
export async function fillRequest(page: Page, amount: string, to?: string): Promise<void> {
  await open(page, 'Send a different request')
  await page.locator('#custom-amount').fill(amount)
  if (to !== undefined) await page.locator('#custom-to').selectOption({ label: to })
}

/** Sends a custom request as the agent and returns the receipt it produced. */
export async function request(page: Page, amount: string, to?: string): Promise<Locator> {
  await fillRequest(page, amount, to)
  return act(page, () => page.getByRole('button', { name: 'Send request' }).click())
}

/** Changes the limits as the owner. Empty string leaves a field as it is. */
export async function saveLimits(page: Page, perPayment: string, perDay: string): Promise<Locator> {
  await open(page, 'Change limits')
  if (perPayment) await page.locator('#limit-payment').fill(perPayment)
  if (perDay) await page.locator('#limit-day').fill(perDay)
  return act(page, () => page.getByRole('button', { name: 'Save limits' }).click())
}

export async function openOwner(page: Page, summary: string | RegExp): Promise<void> {
  await open(page, summary)
}

/** Opens every closed <details> matching `selector` that is on screen. */
export async function openAll(page: Page, selector = 'details.disclosure'): Promise<void> {
  const closed = page.locator(`${selector}:not([open]) > summary`).filter({ visible: true })
  for (let left = await closed.count(); left > 0; left--) await closed.first().click()
  await expect(closed).toHaveCount(0)
}

export async function skipDays(page: Page, days: number): Promise<void> {
  for (let day = 0; day < days; day++) await press(page, 'Skip ahead 1 day')
}

/** The saved session, as the app wrote it. */
export const readSession = (page: Page): Promise<{ setup: Record<string, unknown>; actions: Record<string, unknown>[] }> =>
  page.evaluate((key) => JSON.parse(sessionStorage.getItem(key) ?? 'null'), STORAGE_KEY)

export const writeSession = (page: Page, raw: string): Promise<void> =>
  page.evaluate(([key, value]) => sessionStorage.setItem(key, value), [STORAGE_KEY, raw])

// --- constrained device (persona G and the throttled performance runs) ------

export const SLOW = { downKbps: 400, upKbps: 400, rttMs: 400, cpuSlowdown: 4 }

export async function throttle(page: Page): Promise<CDPSession> {
  const cdp = await page.context().newCDPSession(page)
  await cdp.send('Network.enable')
  await cdp.send('Network.emulateNetworkConditions', {
    offline: false,
    latency: SLOW.rttMs,
    downloadThroughput: (SLOW.downKbps * 1000) / 8,
    uploadThroughput: (SLOW.upKbps * 1000) / 8,
  })
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: SLOW.cpuSlowdown })
  return cdp
}

// --- page-wide checks -------------------------------------------------------

/** Text a visitor reads without opening anything: the page minus every <details>. */
export const primaryCopy = (page: Page): Promise<string> =>
  page.evaluate(() => {
    const copy = document.body.cloneNode(true) as HTMLElement
    for (const hidden of copy.querySelectorAll('details, script, style, template, noscript')) hidden.remove()
    return (copy.textContent ?? '').replace(/\s+/g, ' ')
  })

export const JARGON = ['EVM', 'ABI', 'gas', 'nonce', 'hash', 'smart contract', 'bytecode', 'private key']

export function jargonIn(text: string): string[] {
  return JARGON.filter((term) => new RegExp(`\\b${term}\\b`, 'i').test(text))
}

/** Elements that stick out past the right edge of the viewport and are not inside a scroller. */
export const overflow = (page: Page): Promise<{ scrollWidth: number; clientWidth: number; offenders: string[] }> =>
  page.evaluate(() => {
    const root = document.documentElement
    const width = root.clientWidth
    const inScroller = (element: Element): boolean => {
      for (let parent = element.parentElement; parent; parent = parent.parentElement) {
        const { overflowX } = getComputedStyle(parent)
        if ((overflowX === 'auto' || overflowX === 'scroll') && parent !== document.body && parent !== root) return true
      }
      return false
    }
    const offenders: string[] = []
    for (const element of document.body.querySelectorAll('*')) {
      const box = element.getBoundingClientRect()
      if (box.width === 0 || box.height === 0) continue
      if (element.closest('.sr-only, .skip')) continue
      if (box.right > width + 1 && !inScroller(element)) {
        offenders.push(`${element.tagName.toLowerCase()}.${element.className} right=${Math.round(box.right)}`)
      }
    }
    return { scrollWidth: root.scrollWidth, clientWidth: width, offenders: offenders.slice(0, 10) }
  })

export type Target = { what: string; width: number; height: number; inline: boolean }

/**
 * Every visible thing a finger can press, with its size in CSS px. A radio or
 * checkbox is measured by its label, which is the real target. `inline` marks
 * a link that sits inside a sentence.
 */
export const targets = (page: Page): Promise<Target[]> =>
  page.evaluate(() => {
    const found: Target[] = []
    const seen = new Set<Element>()
    for (const element of document.querySelectorAll('a[href], button, input, select, textarea, summary, [role="button"]')) {
      if (element.closest('.skip')) continue
      const isToggle = element instanceof HTMLInputElement && (element.type === 'radio' || element.type === 'checkbox')
      const measured = isToggle ? (element.closest('label') ?? element) : element
      if (seen.has(measured)) continue
      seen.add(measured)
      const box = measured.getBoundingClientRect()
      if (box.width === 0 || box.height === 0) continue
      const style = getComputedStyle(measured)
      if (style.visibility === 'hidden') continue
      const parent = element.parentElement
      const siblingText = parent
        ? Array.from(parent.childNodes)
            .filter((node) => node !== element && node.nodeType === Node.TEXT_NODE)
            .map((node) => node.textContent ?? '')
            .join('')
            .trim()
        : ''
      const inline = element.tagName === 'A' && style.display === 'inline' && siblingText.length > 0
      const label = (measured.getAttribute('aria-label') ?? measured.textContent ?? '').trim().replace(/\s+/g, ' ').slice(0, 50)
      found.push({
        what: `${element.tagName.toLowerCase()}${element.id ? `#${element.id}` : ''} "${label}"`,
        width: Math.round(box.width * 10) / 10,
        height: Math.round(box.height * 10) / 10,
        inline,
      })
    }
    return found
  })
