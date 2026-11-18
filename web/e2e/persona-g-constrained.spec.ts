// Persona G: a phone on a poor connection. Scripted, not a human.
// 375x667, 400 kbps down and up, 400 ms round trip, CPU slowed 4x.
// Open the app, adjust the policy, submit a request, read the outcome.

import { expect, press, record, shot, SLOW, test, throttle } from './helpers'

test.describe('Persona G: mobile on a constrained network', () => {
  test.use({ viewport: { width: 375, height: 667 }, hasTouch: true, isMobile: true })

  test('adjust the policy, send a request, read the outcome; loading is always visible and ends', async ({ page }) => {
    test.setTimeout(300_000)
    const slow = { timeout: 120_000 }
    await throttle(page)
    const timings: Record<string, number> = {}
    const started = Date.now()
    const since = () => Date.now() - started

    await page.goto('/', { timeout: 120_000 })
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible(slow)
    timings.landingHeadingVisibleMs = since()

    // The example says it is starting while the part that runs the contract downloads.
    const demo = page.locator('section[aria-labelledby="demo-title"]')
    await expect(demo.getByText('Starting the practice vault…')).toBeVisible(slow)
    timings.homeLoadingIndicatorVisibleMs = since()
    await shot(page, 'G-01-home-loading')

    // She does not wait for it: straight to her own rules.
    await page.getByRole('main').getByRole('link', { name: 'Protect my AI' }).tap()
    await expect(page.locator('#perDay')).toBeVisible(slow)
    await page.locator('#perPayment').fill('5')
    await page.locator('#perDay').fill('15')
    timings.policyEditedMs = since()

    await page.getByRole('button', { name: 'Review the rules' }).tap()
    // While the contract code loads, the button says what is happening and cannot be pressed twice.
    const checking = page.getByRole('button', { name: 'Checking the rules…' })
    await expect(checking).toBeVisible()
    await expect(checking).toBeDisabled()
    await shot(page, 'G-02-checking-the-rules')
    await expect(page.getByRole('heading', { name: 'Check the rules before you create the vault' })).toBeVisible(slow)
    timings.reviewVisibleMs = since()
    await expect(page.getByText('up to $5.00 at a time, and up to $15.00 in a day')).toBeVisible()

    await page.getByRole('button', { name: 'Create it in this browser' }).tap()
    await expect(page.getByRole('heading', { name: 'What the agent tries' })).toBeVisible(slow)
    timings.vaultReadyMs = since()

    const paid = await press(page, 'Pay $4.00 to Cloud hosting')
    await expect(paid.locator('.stamp')).toHaveText('Paid')
    await expect(paid.locator('.slip-sentence')).toHaveText('Inside every limit. $11.00 left today.')
    timings.firstVerdictMs = since()

    const blocked = await press(page, 'Pay $80.00 to Cloud hosting')
    await expect(blocked.locator('.slip-sentence')).toHaveText('One payment may be at most $5.00.')
    await blocked.scrollIntoViewIfNeeded()
    await expect(blocked.locator('.slip-sentence')).toBeInViewport()
    timings.secondVerdictMs = since()
    await shot(page, 'G-03-outcome')

    // Nothing is left spinning.
    await expect(page.getByText(/Starting|Checking the rules|Creating the vault/).filter({ visible: true })).toHaveCount(0)
    record('persona-g-timings', { conditions: SLOW, viewport: '375x667', note: 'Wall time from navigation start, including Playwright overhead.', ...timings })
  })

  test('a reload under the same conditions shows a loading state, then the same vault', async ({ page }) => {
    test.setTimeout(300_000)
    await page.goto('/activity')
    await page.getByRole('button', { name: 'Start with an example vault' }).tap()
    await press(page, 'Pay $4.00 to Cloud hosting')
    // Same tab, so the saved vault is still there, but nothing cached: the part
    // that runs the contract has to be downloaded again at 400 kbps.
    const cdp = await throttle(page)
    await cdp.send('Network.clearBrowserCache')
    await cdp.send('Network.setCacheDisabled', { cacheDisabled: true })
    const started = Date.now()
    await page.reload({ timeout: 120_000 })
    await expect(page.getByRole('status').filter({ hasText: 'Opening your vault…' })).toBeVisible({ timeout: 120_000 })
    const indicatorMs = Date.now() - started
    await expect(page.locator('section[aria-labelledby="vault-title"] .figure')).toHaveText('$96.00', { timeout: 120_000 })
    record('persona-g-reload', { conditions: SLOW, loadingIndicatorVisibleMs: indicatorMs, vaultRestoredMs: Date.now() - started })
  })
})
