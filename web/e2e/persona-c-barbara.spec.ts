// Persona C: Barbara, 64, on a phone with larger text. Scripted, not a human.
// 360x740 viewport, root font size 125%. She tries the example on the home
// page and reads what the vault protects, without connecting anything.

import AxeBuilder from '@axe-core/playwright'
import type { Page } from '@playwright/test'
import { expect, openAll, overflow, press, record, ROUTES, saveLimits, shot, startExampleVault, targets, test, type Target } from './helpers'

const MIN_TARGET = 44

/** Larger text, as a browser's font-size setting does it: the root font size, not zoom. */
async function largerText(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const apply = () => {
      if (document.documentElement) document.documentElement.style.fontSize = '125%'
    }
    apply()
    document.addEventListener('DOMContentLoaded', apply)
  })
}

const tooSmall = (found: Target[]): Target[] =>
  found.filter((target) => !target.inline && (target.width < MIN_TARGET || target.height < MIN_TARGET))

test.describe('Persona C: Barbara, mobile with larger text', () => {
  test.use({ viewport: { width: 360, height: 740 }, hasTouch: true, isMobile: true })

  test('the home walkthrough, then the protects / does not protect section on How it works, with nothing to connect', async ({ page }) => {
    await largerText(page)
    const foreign: string[] = []
    page.on('request', (request) => {
      if (!request.url().startsWith('http://localhost:3220/') && !request.url().startsWith('data:')) foreign.push(request.url())
    })
    await page.goto('/')
    expect(await page.evaluate(() => getComputedStyle(document.documentElement).fontSize)).toBe('20px')

    const demo = page.locator('section[aria-labelledby="demo-title"]')
    await demo.getByRole('button', { name: 'Agent pays $4' }).tap()
    await expect(demo.locator('.slip')).toHaveCount(1)
    await expect(demo.locator('.slip').first()).toContainText('Inside every limit. $16.00 left today.')
    await demo.getByRole('button', { name: 'Agent tries $80' }).tap()
    await expect(demo.locator('.slip')).toHaveCount(2)
    await expect(demo.locator('.slip').first()).toContainText('One payment may be at most $10.00.')
    await shot(page, 'C-01-home-360-large-text')

    await page.goto('/how-it-works')
    const boundary = page.locator('section[aria-labelledby="boundary-title"]')
    await boundary.scrollIntoViewIfNeeded()
    await expect(boundary.getByRole('heading', { name: 'What this protects, and what it does not' })).toBeVisible()
    await expect(boundary.getByRole('heading', { name: 'It protects the money in the vault' })).toBeVisible()
    await expect(boundary.getByRole('heading', { name: 'It does not protect anything else' })).toBeVisible()
    await expect(boundary.getByRole('listitem')).toHaveCount(9)
    for (const item of await boundary.getByRole('listitem').all()) {
      const box = await item.boundingBox()
      expect(box!.x).toBeGreaterThanOrEqual(0)
      expect(box!.x + box!.width).toBeLessThanOrEqual(360)
    }
    // Body text at this setting is 20px, never smaller than 16px anywhere in the section.
    const smallest = await boundary.evaluate((section) =>
      Math.min(...Array.from(section.querySelectorAll('li, h2, h3'), (node) => parseFloat(getComputedStyle(node).fontSize))),
    )
    expect(smallest).toBeGreaterThanOrEqual(16)

    // Nothing was connected and nothing left this machine.
    expect(foreign, 'requests to anything but this site').toEqual([])
    expect(await page.evaluate(() => 'ethereum' in window)).toBe(false)
  })

  // A wallet is offered on the review step, as one of two choices; nothing on the way there asks for one.
  // Links are not checked for the word "wallet": the sources on /evidence are articles about wallets.
  test('no route asks for a wallet or an address', async ({ page }) => {
    await largerText(page)
    // My vaults is the one page that is about a wallet: signing in there is
    // the point, and nothing else needs it. Every other route stays usable
    // with no wallet at all.
    for (const route of ROUTES.filter((path) => path !== '/vaults')) {
      await page.goto(route)
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
      await expect(page.getByRole('button', { name: /connect|wallet|sign in|log in/i })).toHaveCount(0)
      await expect(page.getByRole('link', { name: /connect|sign in|log in/i })).toHaveCount(0)
      const fields = await page.locator('input, textarea, select').evaluateAll((inputs) =>
        inputs.map((input) => `${(input as HTMLInputElement).labels?.[0]?.textContent ?? ''} ${input.getAttribute('placeholder') ?? ''} ${input.id}`),
      )
      expect(fields.filter((field) => /address|wallet|0x|seed|key|password/i.test(field)), `fields on ${route}`).toEqual([])
    }
    // The vault itself: every field the owner and the agent panel offer.
    await startExampleVault(page)
    await openAll(page)
    const fields = await page.locator('input, textarea, select').evaluateAll((inputs) =>
      inputs.map((input) => `${(input as HTMLInputElement).labels?.[0]?.textContent ?? ''} ${input.id}`),
    )
    expect(fields.length).toBeGreaterThan(5)
    expect(fields.filter((field) => /address|wallet|0x|seed|key|password/i.test(field))).toEqual([])
  })

  for (const scale of ['125%', '100%'] as const) {
    test(`no horizontal overflow and 44px targets on all five routes at 360px, text ${scale}`, async ({ page }) => {
      if (scale === '125%') await largerText(page)
      const report: Record<string, unknown> = {}
      const small: Record<string, string[]> = {}
      const check = async (state: string) => {
        const sizes = await overflow(page)
        expect(sizes.offenders, `elements past the right edge: ${state}`).toEqual([])
        expect(sizes.scrollWidth, `page scroll width: ${state}`).toBeLessThanOrEqual(sizes.clientWidth)
        const found = await targets(page)
        // Content that fits the page only by scrolling sideways inside its own box.
        const scrollers = await page.locator('.table-scroll, pre.code').evaluateAll((boxes) =>
          boxes
            .filter((box) => (box as HTMLElement).checkVisibility() && box.scrollWidth > box.clientWidth + 1)
            .map((box) => `${box.className.split(' ')[0]}: content ${box.scrollWidth}px in a ${box.clientWidth}px box`),
        )
        report[state] = {
          scrollsSideways: scrollers,
          targets: found.length,
          inlineLinksExempt: found.filter((target) => target.inline).map((target) => `${target.what} ${target.width}x${target.height}`),
          smallest: found.filter((target) => !target.inline).reduce((least, target) => Math.min(least, target.width, target.height), Infinity),
        }
        const under = tooSmall(found).map((target) => `${target.what} ${target.width}x${target.height}`)
        if (under.length > 0) small[state] = under
      }

      for (const route of ROUTES) {
        await page.goto(route)
        await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
        if (route === '/') {
          await page.locator('#live-example').scrollIntoViewIfNeeded()
          await expect(page.getByText(/^In the vault: \$100\.00/)).toBeVisible()
        }
        if (route === '/how-it-works') await openAll(page)
        await check(route)
      }

      // /protect with errors and with the review open.
      await page.goto('/protect')
      await page.locator('#perPayment').fill('abc')
      await page.locator('#recipient-0').fill('')
      await page.getByRole('button', { name: 'Review the rules' }).tap()
      await expect(page.locator('#perPayment-error')).toBeVisible()
      await check('/protect with errors')
      await page.locator('#perPayment').fill('10')
      await page.locator('#recipient-0').fill('Cloud hosting')
      await page.getByRole('button', { name: 'Review the rules' }).tap()
      await expect(page.getByRole('heading', { name: 'Check the rules before you create the vault' })).toBeVisible()
      await check('/protect review')
      await page.getByRole('button', { name: 'Create it in this browser' }).tap()
      await expect(page.getByRole('heading', { name: 'What the agent tries' })).toBeVisible()

      // /activity with a vault, receipts, a scheduled change and everything open.
      await press(page, 'Pay $4.00 to Cloud hosting')
      await press(page, 'Pay $80.00 to Cloud hosting')
      await press(page, /^Raise its own limit/)
      await saveLimits(page, '15', '40')
      await openAll(page, 'details')
      await expect(page.locator('.scheduled')).toBeVisible()
      await check('/activity with vault, receipts and a scheduled change')
      if (scale === '125%') await shot(page, 'C-02-activity-360-large-text')
      record(`persona-c-targets-${scale === '125%' ? 'large-text' : 'default-text'}`, report)
      expect(small, `targets under ${MIN_TARGET}x${MIN_TARGET} CSS px`).toEqual({})
    })
  }

  test('contrast passes on all five routes at 360px with larger text (axe)', async ({ page }) => {
    await largerText(page)
    for (const route of ROUTES) {
      await page.goto(route)
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
      if (route === '/') {
        const demo = page.locator('section[aria-labelledby="demo-title"]')
        await demo.getByRole('button', { name: 'Agent pays $4' }).tap()
        await demo.getByRole('button', { name: 'Agent tries $80' }).tap()
        await expect(demo.locator('.slip')).toHaveCount(2)
      }
      const results = await new AxeBuilder({ page }).withRules(['color-contrast']).analyze()
      expect(results.violations.flatMap((violation) => violation.nodes.map((node) => `${route} ${node.html}`))).toEqual([])
      expect(results.passes.length, `axe checked contrast on ${route}`).toBeGreaterThan(0)
    }
  })
})
