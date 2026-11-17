// Persona F: a contest judge with limited time. Scripted, not a human.
// The README's commands are run from a shell and logged in
// qa/TEST_RESULTS.md; this file checks the README's links and counts the
// clicks from / to the things the project claims as its contribution.

import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { expect, press, record, REPO, saveLimits, scheduled, shot, test } from './helpers'

test.describe('Persona F: contest judge', () => {
  test('every relative link in README.md resolves to a file', () => {
    const readme = readFileSync(path.join(REPO, 'README.md'), 'utf8')
    const links = [...readme.matchAll(/\]\(([^)\s]+)\)/g)].map((match) => match[1])
    const relative = [...new Set(links.filter((link) => !/^[a-z]+:/i.test(link) && !link.startsWith('#')))]
    expect(relative.length).toBeGreaterThan(5)
    const missing = relative.filter((link) => !existsSync(path.join(REPO, link.split('#')[0])))
    record('persona-f-readme-links', { checked: relative, missing })
    expect(missing).toEqual([])
    // Paths the README names in backticks, outside links.
    for (const named of ['web/src/lib/hardstop/artifacts.ts', 'web/tests/differential.test.ts', 'web/package-lock.json', 'fe/src/kernel.fe', 'fe/src/adversary.fe']) {
      expect(existsSync(path.join(REPO, named)), `${named} exists`).toBe(true)
    }
  })

  test('the contribution within three clicks of /', async ({ page }) => {
    const clicks: Record<string, number> = {}

    // 0 clicks: the ratchet and the limits are stated on the landing page.
    await page.goto('/')
    await expect(page.getByText('Lowering a limit is instant. Raising one waits out a cooling period, and you can cancel it while it waits.')).toBeVisible()
    clicks['the ratchet is explained in words'] = 0

    // 1 click: a request over the limit is refused, with the reason.
    const demo = page.locator('section[aria-labelledby="demo-title"]')
    await demo.getByRole('button', { name: 'Agent tries $80' }).click()
    await expect(demo.locator('.slip')).toContainText('One payment may be at most $10.00.')
    clicks['an over-limit payment is blocked with its reason'] = 1
    await shot(page, 'F-01-one-click-blocked')

    // 2 clicks: the worst-case number, on a vault of the visitor's own.
    await page.goto('/')
    await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Activity' }).click()
    await page.getByRole('button', { name: 'Start with an example vault' }).click()
    const worst = page.locator('section[aria-labelledby="worst-title"]')
    await expect(worst.getByRole('heading')).toHaveText('Worst case if your agent goes rogue')
    // $20.00: a full day's limit, with no reset inside the next 24 hours less a second.
    await expect(worst.locator('.figure')).toHaveText('$20.00')
    clicks['the worst-case number is on screen'] = 2

    // 3 clicks: the agent asks to raise its own limit and is rejected.
    const rejected = await press(page, /^Raise its own limit/)
    await expect(rejected).toContainText('Rejected. Only you can change the rules.')
    clicks['the agent raising its own limit is rejected'] = 3
    await shot(page, 'F-02-three-clicks-rejected')

    // The owner's raise being scheduled takes more: open the form, type, save.
    await saveLimits(page, '50', '50')
    await expect(scheduled(page)).toContainText('Scheduled')
    clicks['an owner raise shows as Scheduled (plus typing two amounts)'] = 4
    await shot(page, 'F-03-four-clicks-scheduled')

    record('persona-f-clicks', clicks)
    for (const [what, count] of Object.entries(clicks).slice(0, 4)) expect(count, what).toBeLessThanOrEqual(3)
  })
})
