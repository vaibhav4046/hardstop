// Moving between pages without a reload. Next.js keeps the pages a visitor
// has left mounted but hidden, so their state and their elements are still in
// the document. These checks cover what that can break.

import AxeBuilder from '@axe-core/playwright'
import type { Page } from '@playwright/test'
import { balance, expect, press, rulesInForce, shot, test } from './helpers'

const nav = (page: Page, name: string) => page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name }).click()

/** Labels and descriptions that point at an element which is hidden, or at an id used more than once. */
const brokenReferences = (page: Page): Promise<string[]> =>
  page.evaluate(() => {
    const broken: string[] = []
    for (const element of document.querySelectorAll('[aria-labelledby], [aria-describedby], label[for]')) {
      if (!(element as HTMLElement).checkVisibility()) continue
      const ids = [element.getAttribute('aria-labelledby'), element.getAttribute('aria-describedby'), element.getAttribute('for')]
        .filter((value): value is string => value !== null)
        .flatMap((value) => value.split(/\s+/))
      for (const id of ids) {
        const target = document.getElementById(id)
        const copies = document.querySelectorAll(`[id="${CSS.escape(id)}"]`).length
        if (target === null) broken.push(`#${id} is missing`)
        else if (!target.checkVisibility() && !target.closest('.sr-only')) broken.push(`#${id} resolves to a hidden element (${copies} in the document)`)
        else if (copies > 1) broken.push(`#${id} is used ${copies} times`)
      }
    }
    return [...new Set(broken)]
  })

test.describe('Moving between pages', () => {
  test('after creating a vault, /protect can be used again', async ({ page }) => {
    await page.goto('/protect')
    await page.getByRole('button', { name: 'Review the rules' }).click()
    await page.getByRole('button', { name: 'Create vault' }).click()
    await expect(page.getByRole('heading', { name: 'What the agent tries' })).toBeVisible()
    await press(page, 'Pay $4.00 to Cloud hosting')

    // Back to the form by the main navigation: it is a form again, not a spinner.
    await nav(page, 'Protect my AI')
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Set the rules your agent has to live inside')
    await expect(page.getByRole('button', { name: /Creating the vault/ })).toHaveCount(0)
    const review = page.getByRole('button', { name: 'Review the rules' })
    await expect(review).toBeVisible()
    await expect(review).toBeEnabled()
    await shot(page, 'NAV-01-protect-after-creating')

    // A second vault with other rules replaces the first.
    await page.locator('#perPayment').fill('7')
    await page.locator('#perDay').fill('14')
    await review.click()
    await expect(page.getByText('Creating this vault replaces the practice vault you already have.')).toBeVisible()
    await page.getByRole('button', { name: 'Create vault' }).click()
    await expect(page.getByRole('heading', { name: 'What the agent tries' })).toBeVisible()
    await expect(rulesInForce(page)).toContainText('Most per payment$7.00')
    await expect(balance(page)).toHaveText('$100.00')
    await expect(page.locator('section[aria-labelledby="receipts-title"] li')).toHaveCount(0)

    // The browser's own back button does not bring the spinner back either.
    await page.goBack()
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Set the rules your agent has to live inside')
    await expect(page.getByRole('button', { name: /Creating the vault/ })).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Review the rules' }).or(page.getByRole('button', { name: 'Create vault' }))).toBeEnabled()
  })

  test('labels still point at the right thing after visiting every page, and axe stays clean', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByText(/^In the vault: \$100\.00/)).toBeVisible()
    const check = async (state: string) => {
      expect(await brokenReferences(page), `label and description references: ${state}`).toEqual([])
      const results = await new AxeBuilder({ page }).analyze()
      const blocking = results.violations.filter((violation) => violation.impact === 'serious' || violation.impact === 'critical')
      expect(blocking.map((violation) => `${violation.id}: ${violation.nodes[0]?.html.slice(0, 120)}`), `axe: ${state}`).toEqual([])
    }

    await nav(page, 'How it works')
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('One door for the agent. Every control for you.')
    await check('/how-it-works after /')

    await nav(page, 'Protect my AI')
    await page.getByRole('button', { name: 'Review the rules' }).click()
    await expect(page.getByRole('heading', { name: 'Check the rules before you create the vault' })).toBeVisible()
    await check('/protect review after /how-it-works')
    // The worst-case panel is named by its own heading, not one from a page left behind.
    await expect(page.getByRole('complementary', { name: 'Worst case in the next 24 hours' })).toBeVisible()

    await page.getByRole('button', { name: 'Create vault' }).click()
    await expect(page.getByRole('heading', { name: 'What the agent tries' })).toBeVisible()
    await press(page, 'Pay $4.00 to Cloud hosting')
    await check('/activity after /protect and /how-it-works')
    await expect(page.getByRole('region', { name: 'What the agent tries' })).toBeVisible()
    await expect(page.getByRole('region', { name: 'Worst case if your agent goes rogue' })).toBeVisible()

    await nav(page, 'How it works')
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('One door for the agent. Every control for you.')
    await check('/how-it-works after /activity')
    await expect(page.getByRole('region', { name: 'What your agent can do' })).toBeVisible()
    await expect(page.getByRole('region', { name: 'The worst-case number' })).toBeVisible()

    await nav(page, 'Developers')
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    await check('/developers after everything')

    await nav(page, 'Activity')
    await expect(balance(page)).toHaveText('$96.00')
    await check('/activity, returned to')
  })
})
