// Measurements, not guesses. Everything here is taken from the production
// build served by `next start` on this machine. A "payment" is a transaction
// in an EVM inside the page: these numbers say nothing about how long a real
// chain takes to confirm one.
//
// Runs alone, after the rest of the suite (see playwright.config.ts).

import type { Browser, Page } from '@playwright/test'
import { expect, median, record, settle, SLOW, test, throttle, watch } from './helpers'

type Mode = 'unthrottled' | 'throttled'
const RUNS = { unthrottled: { load: 5, click: 10, create: 5 }, throttled: { load: 3, click: 10, create: 3 } }
const WAIT = { timeout: 180_000 }

const summary = (values: number[]) => ({
  runs: values.length,
  median: Math.round(median(values)),
  max: Math.round(Math.max(...values)),
  min: Math.round(Math.min(...values)),
  all: values.map(Math.round),
})

/** A page in a new context: empty HTTP cache, empty storage. Fails on the same problems as the shared fixture. */
async function fresh<T>(browser: Browser, mode: Mode, mobile: boolean, run: (page: Page) => Promise<T>): Promise<T> {
  const context = await browser.newContext({
    baseURL: 'http://localhost:3220',
    viewport: mobile ? { width: 375, height: 667 } : { width: 1280, height: 720 },
  })
  const page = await context.newPage()
  const problems = watch(page)
  if (mode === 'throttled') await throttle(page)
  try {
    const result = await run(page)
    await settle(page, problems)
    return result
  } finally {
    await context.close()
  }
}

/** Bytes of JavaScript as they came over the wire, from the browser's network log. */
async function countScripts(page: Page): Promise<{ read: () => { files: number; transferred: number; decoded: number; encodings: string[] } }> {
  const cdp = await page.context().newCDPSession(page)
  await cdp.send('Network.enable')
  const scripts = new Map<string, { encoding: string; decoded: number; transferred: number }>()
  cdp.on('Network.responseReceived', ({ requestId, type, response }) => {
    if (type === 'Script' || /javascript/.test(response.mimeType)) {
      scripts.set(requestId, { encoding: String(response.headers['content-encoding'] ?? response.headers['Content-Encoding'] ?? 'none'), decoded: 0, transferred: 0 })
    }
  })
  cdp.on('Network.dataReceived', ({ requestId, dataLength }) => {
    const script = scripts.get(requestId)
    if (script) script.decoded += dataLength
  })
  cdp.on('Network.loadingFinished', ({ requestId, encodedDataLength }) => {
    const script = scripts.get(requestId)
    if (script) script.transferred = encodedDataLength
  })
  return {
    read: () => ({
      files: scripts.size,
      transferred: [...scripts.values()].reduce((sum, script) => sum + script.transferred, 0),
      decoded: [...scripts.values()].reduce((sum, script) => sum + script.decoded, 0),
      encodings: [...new Set([...scripts.values()].map((script) => script.encoding))],
    }),
  }
}

const paints = (page: Page): Promise<{ fcp: number; lcp: number; lcpElement: string }> =>
  page.evaluate(
    () =>
      new Promise((resolve) => {
        new PerformanceObserver((list) => {
          const entries = list.getEntries() as (PerformanceEntry & { element?: Element })[]
          const last = entries[entries.length - 1]
          const fcp = performance.getEntriesByName('first-contentful-paint')[0]?.startTime ?? -1
          resolve({ fcp, lcp: last.startTime, lcpElement: `${last.element?.tagName.toLowerCase()}.${last.element?.className}` })
        }).observe({ type: 'largest-contentful-paint', buffered: true })
      }),
  )

/** Clicks a button and times, inside the page, until `appears` matches one more element and a frame has been produced. */
const clickToAppear = (page: Page, buttonText: string, appears: string): Promise<number> =>
  page.evaluate(
    ([text, selector]) =>
      new Promise<number>((resolve, reject) => {
        const button = Array.from(document.querySelectorAll('main button, main a')).find((node) => node.textContent?.trim() === text) as HTMLElement | undefined
        if (!button) return reject(new Error(`no button "${text}"`))
        const before = document.querySelectorAll(selector).length
        let started = 0
        const observer = new MutationObserver(() => {
          if (document.querySelectorAll(selector).length > before) {
            observer.disconnect()
            requestAnimationFrame(() => resolve(performance.now() - started))
          }
        })
        observer.observe(document.body, { childList: true, subtree: true })
        started = performance.now()
        button.click()
      }),
    [buttonText, appears],
  )

for (const mode of ['unthrottled', 'throttled'] as const) {
  const mobile = mode === 'throttled'
  const conditions = mode === 'throttled' ? { ...SLOW, viewport: '375x667' } : { viewport: '1280x720', network: 'none', cpu: 'none' }

  test.describe(`Performance, ${mode}`, () => {
    test.describe.configure({ mode: 'serial' })
    test.setTimeout(900_000)

    test(`paint times and JavaScript transferred for /`, async ({ browser }) => {
      const fcp: number[] = []
      const lcp: number[] = []
      const ready: number[] = []
      let scripts = { files: 0, transferred: 0, decoded: 0, encodings: [] as string[] }
      let initialScripts = scripts
      let lcpElement = ''
      for (let run = 0; run < RUNS[mode].load; run++) {
        await fresh(browser, mode, mobile, async (page) => {
          const counter = await countScripts(page)
          await page.goto('/', { waitUntil: 'load', ...WAIT })
          await page.waitForLoadState('networkidle', WAIT)
          initialScripts = counter.read()
          const painted = await paints(page)
          fcp.push(painted.fcp)
          lcp.push(painted.lcp)
          lcpElement = painted.lcpElement
          // The practice vault's EVM loads only when the example comes near the screen.
          const started = Date.now()
          await page.locator('#live-example').scrollIntoViewIfNeeded()
          await expect(page.getByText(/^In the vault: \$100\.00/)).toBeVisible(WAIT)
          ready.push(Date.now() - started)
          await page.waitForLoadState('networkidle', WAIT)
          scripts = counter.read()
        })
      }
      record(`perf-${mode}-home-load`, {
        conditions,
        cache: 'empty for every run',
        firstContentfulPaintMs: summary(fcp),
        largestContentfulPaintMs: summary(lcp),
        largestContentfulPaintElement: lcpElement,
        exampleVaultReadyMs: { ...summary(ready), note: 'from scrolling to the home example until it shows its balance, i.e. the EVM chunk has loaded and the vault is deployed' },
        javascriptBeforeScrolling: { ...initialScripts, note: 'all script responses from load until network idle, before the visitor scrolls; the EVM chunk is not among them' },
        javascript: { ...scripts, note: 'all script responses after scrolling to the home example, including its EVM chunk and anything Next.js prefetches' },
      })
      expect(scripts.transferred).toBeGreaterThan(0)
    })

    test(`JavaScript transferred for /activity`, async ({ browser }) => {
      await fresh(browser, mode, mobile, async (page) => {
        const counter = await countScripts(page)
        await page.goto('/activity', { waitUntil: 'load', ...WAIT })
        await expect(page.getByRole('heading', { name: 'You have no practice vault yet' })).toBeVisible(WAIT)
        await page.waitForLoadState('networkidle', WAIT)
        const empty = counter.read()
        const painted = await paints(page)
        await page.getByRole('button', { name: 'Start with an example vault' }).click()
        await expect(page.getByRole('heading', { name: 'What the agent tries' })).toBeVisible(WAIT)
        await page.waitForLoadState('networkidle', WAIT)
        record(`perf-${mode}-activity-js`, {
          conditions,
          cache: 'empty',
          withNoVault: empty,
          afterStartingAVault: counter.read(),
          firstContentfulPaintMs: Math.round(painted.fcp),
          largestContentfulPaintMs: Math.round(painted.lcp),
        })
        expect(counter.read().transferred).toBeGreaterThan(empty.transferred)
      })
    })

    test(`click "Agent pays $4" to receipt, ${RUNS[mode].click} runs`, async ({ browser }) => {
      const times: number[] = []
      await fresh(browser, mode, mobile, async (page) => {
        for (let run = 0; run < RUNS[mode].click; run++) {
          // A reload starts the home example again; it is not saved.
          await page.goto('/', WAIT)
          await page.locator('#live-example').scrollIntoViewIfNeeded()
          await expect(page.getByText(/^In the vault: \$100\.00/)).toBeVisible(WAIT)
          times.push(await clickToAppear(page, 'Agent pays $4', 'section[aria-labelledby="demo-title"] .slip'))
          await expect(page.locator('section[aria-labelledby="demo-title"] .slip')).toContainText('Inside every limit. $16.00 left today.')
        }
      })
      record(`perf-${mode}-pay-click`, {
        conditions,
        what: 'click on "Agent pays $4" until the receipt is in the page and a frame has been produced; the example vault was already running',
        notIncluded: 'the 320 ms print animation that follows; any real chain',
        ms: summary(times),
      })
      expect(times).toHaveLength(RUNS[mode].click)
    })

    test(`time to create a vault`, async ({ browser }) => {
      const example: number[] = []
      const own: number[] = []
      for (let run = 0; run < RUNS[mode].create; run++) {
        await fresh(browser, mode, mobile, async (page) => {
          await page.goto('/activity', WAIT)
          await expect(page.getByRole('heading', { name: 'You have no practice vault yet' })).toBeVisible(WAIT)
          await page.waitForLoadState('networkidle', WAIT)
          example.push(await clickToAppear(page, 'Start with an example vault', '#agent-title'))
        })
        await fresh(browser, mode, mobile, async (page) => {
          await page.goto('/protect', WAIT)
          await page.getByRole('button', { name: 'Review the rules' }).click()
          await expect(page.getByRole('button', { name: 'Create it in this browser' })).toBeVisible(WAIT)
          own.push(await clickToAppear(page, 'Create it in this browser', '#agent-title'))
        })
      }
      record(`perf-${mode}-create-vault`, {
        conditions,
        exampleVaultMs: { ...summary(example), what: 'click "Start with an example vault" on /activity until the vault is on screen; empty cache, so this includes downloading the EVM chunk' },
        ownVaultMs: { ...summary(own), what: 'click "Create it in this browser" on the /protect review until the vault is on screen on /activity; the EVM chunk was already loaded by the review' },
      })
      expect(example).toHaveLength(RUNS[mode].create)
    })
  })
}
