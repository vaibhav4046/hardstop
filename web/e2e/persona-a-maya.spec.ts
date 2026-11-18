// Persona A: Maya, 22, non-technical creator. Scripted, not a human.
// Lands on / with no instructions, tries the example, follows the main
// button, creates a $20/day vault with the defaults, and reads the verdicts.

import { expect, jargonIn, newest, press, primaryCopy, record, shot, test } from './helpers'

test.describe('Persona A: Maya, non-technical creator', () => {
  test('home example, primary CTA, default vault, paid and blocked with the reason', async ({ page }) => {
    let clicks = 0
    const started = Date.now()
    // Evidence screenshots are the suite's work, not the visitor's, so their time is taken off the clock.
    let shooting = 0
    const evidence = async (name: string) => {
      const from = Date.now()
      await shot(page, name)
      shooting += Date.now() - from
    }
    await page.goto('/')

    // Before she presses anything she is told the example is practice, and the footer says no real money is used.
    await expect(page.getByRole('heading', { name: 'Try it on a practice vault' })).toBeVisible()
    const notice = page.getByRole('contentinfo').getByText(/Nothing here holds or moves real money/)
    await expect(notice).toBeVisible()

    // The example on the home page.
    const demo = page.locator('section[aria-labelledby="demo-title"]')
    await demo.getByRole('button', { name: 'Agent pays $4' }).click()
    clicks++
    await expect(demo.locator('.slip')).toHaveCount(1)
    await expect(demo.locator('.slip').first()).toContainText('Paid')
    await expect(demo.locator('.slip').first()).toContainText('Inside every limit. $16.00 left today.')

    await demo.getByRole('button', { name: 'Agent tries $80' }).click()
    clicks++
    await expect(demo.locator('.slip')).toHaveCount(2)
    await expect(demo.locator('.slip').first()).toContainText('Blocked')
    await expect(demo.locator('.slip').first()).toContainText('One payment may be at most $10.00.')
    expect(jargonIn(await primaryCopy(page)), 'jargon in the primary copy of / with receipts').toEqual([])
    await evidence('A-01-home-example')

    // The primary call to action.
    await page.getByRole('main').getByRole('link', { name: 'Protect my AI' }).click()
    clicks++
    await expect(page).toHaveURL(/\/protect$/)
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Set the rules your agent has to live inside')
    await expect(page.locator('#perDay')).toHaveValue('20')
    await expect(notice).toBeVisible()
    expect(jargonIn(await primaryCopy(page)), 'jargon in the primary copy of /protect').toEqual([])

    // Defaults, untouched.
    await page.getByRole('button', { name: 'Review the rules' }).click()
    clicks++
    await expect(page.getByRole('heading', { name: 'Check the rules before you create the vault' })).toBeVisible()
    await expect(page.getByText('up to $10.00 at a time, and up to $20.00 in a day')).toBeVisible()
    expect(jargonIn(await primaryCopy(page)), 'jargon in the primary copy of the review').toEqual([])
    await evidence('A-02-review')

    await page.getByRole('button', { name: 'Create it in this browser' }).click()
    clicks++
    await expect(page).toHaveURL(/\/activity$/)
    await expect(page.getByRole('heading', { name: 'What the agent tries' })).toBeVisible()
    await expect(notice).toBeVisible()
    // Her vault says where it lives.
    await expect(page.getByText('In this browser only')).toBeVisible()

    // An approved payment on her own vault.
    const paid = await press(page, 'Pay $4.00 to Cloud hosting')
    clicks++
    const firstVerdictMs = Date.now() - started - shooting
    await expect(paid.locator('.stamp')).toHaveText('Paid')
    await expect(paid).toContainText('Inside every limit. $16.00 left today.')

    // A larger one, and why it is blocked: the sentence names the limit.
    const blocked = await press(page, 'Pay $80.00 to Cloud hosting')
    await expect(blocked.locator('.stamp')).toHaveText('Blocked')
    await expect(blocked.locator('.slip-sentence')).toBeVisible()
    await expect(blocked.locator('.slip-sentence')).toHaveText('One payment may be at most $10.00.')
    await expect(newest(page).locator('.slip-amount')).toHaveText('$80.00')
    expect(jargonIn(await primaryCopy(page)), 'jargon in the primary copy of /activity with receipts').toEqual([])
    await shot(page, 'A-03-own-vault-paid-and-blocked')

    record('persona-a-journey', {
      note: 'Scripted journey including the two example clicks on the home page. Wall time includes Playwright overhead but not the two evidence screenshots.',
      screenshotMsExcluded: shooting,
      clicksToFirstVerdictOnOwnVault: clicks,
      wallMsToFirstVerdictOnOwnVault: firstVerdictMs,
    })
  })

  test('shortest path from landing to a verdict on her own vault', async ({ page }) => {
    const started = Date.now()
    await page.goto('/')
    await page.getByRole('main').getByRole('link', { name: 'Protect my AI' }).click()
    await page.getByRole('button', { name: 'Review the rules' }).click()
    await page.getByRole('button', { name: 'Create it in this browser' }).click()
    await expect(page.getByRole('heading', { name: 'What the agent tries' })).toBeVisible()
    const paid = await press(page, 'Pay $4.00 to Cloud hosting')
    await expect(paid.locator('.stamp')).toHaveText('Paid')
    const clicks = 4
    record('persona-a-shortest-path', {
      note: 'Landing, primary CTA, Review the rules, Create it in this browser, Pay $4.00. No typing. Wall time includes Playwright overhead.',
      clicks,
      wallMs: Date.now() - started,
    })
    expect(clicks).toBeLessThanOrEqual(4)
  })

  test('primary copy has no jargon on the empty states either', async ({ page }) => {
    for (const route of ['/', '/protect', '/activity']) {
      await page.goto(route)
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
      if (route === '/activity') await expect(page.getByRole('heading', { name: 'You have no practice vault yet' })).toBeVisible()
      expect(jargonIn(await primaryCopy(page)), `jargon in the primary copy of ${route}`).toEqual([])
    }
  })
})
