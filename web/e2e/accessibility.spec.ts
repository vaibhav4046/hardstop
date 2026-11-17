// Accessibility checks that cut across personas: axe on every route in its
// main states, a keyboard-only run of the primary journey, live announcements,
// error association, and reduced motion.

import AxeBuilder from '@axe-core/playwright'
import type { Page } from '@playwright/test'
import { announcer, expect, openAll, press, record, ROUTES, saveLimits, shot, startExampleVault, test } from './helpers'

type Finding = { state: string; id: string; impact: string | null | undefined; nodes: number; help: string; sample: string }
const findings: Finding[] = []
const states: string[] = []

/** Runs every axe rule on the page as it stands; serious and critical findings fail. */
async function axe(page: Page, state: string): Promise<void> {
  const results = await new AxeBuilder({ page }).analyze()
  states.push(state)
  for (const violation of results.violations) {
    findings.push({
      state,
      id: violation.id,
      impact: violation.impact,
      nodes: violation.nodes.length,
      help: violation.help,
      sample: violation.nodes[0]?.html.slice(0, 160) ?? '',
    })
  }
  const blocking = results.violations.filter((violation) => violation.impact === 'serious' || violation.impact === 'critical')
  expect(
    blocking.map((violation) => `${violation.id}: ${violation.nodes.map((node) => node.html.slice(0, 120)).join(' | ')}`),
    `serious or critical axe violations: ${state}`,
  ).toEqual([])
}

test.describe('Accessibility: axe', () => {
  test.describe.configure({ mode: 'serial' })

  test('static routes and the home example', async ({ page }) => {
    for (const route of ROUTES) {
      await page.goto(route)
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
      if (route === '/') await expect(page.getByText(/^In the vault: \$100\.00/)).toBeVisible()
      await axe(page, `${route} (empty)`)
    }
    await page.goto('/')
    const demo = page.locator('section[aria-labelledby="demo-title"]')
    await demo.getByRole('button', { name: 'Agent pays $4' }).click()
    await demo.getByRole('button', { name: 'Agent tries $80' }).click()
    await expect(demo.locator('.slip')).toHaveCount(2)
    await demo.locator('details.tech summary').first().click()
    await axe(page, '/ (with receipts, technical details open)')
    await page.goto('/how-it-works')
    await page.locator('details.disclosure > summary').click()
    await axe(page, '/how-it-works (technical section open)')
  })

  test('/protect: form errors and the review', async ({ page }) => {
    await page.goto('/protect')
    await page.locator('#perPayment').fill('abc')
    await page.locator('#perDay').fill('0')
    await page.locator('#funding').fill('')
    await page.locator('#recipient-0').fill('')
    await page.getByRole('button', { name: 'Review the rules' }).click()
    await expect(page.locator('#perPayment-error')).toBeVisible()
    await axe(page, '/protect (with form errors)')
    await shot(page, 'A11Y-01-protect-errors')
    await page.locator('#perPayment').fill('10')
    await page.locator('#perDay').fill('20')
    await page.locator('#funding').fill('100')
    await page.getByRole('button', { name: 'Remove recipient 1' }).click()
    await page.getByRole('button', { name: 'Review the rules' }).click()
    await expect(page.getByRole('heading', { name: 'Check the rules before you create the vault' })).toBeVisible()
    await axe(page, '/protect (review, no recipients)')
  })

  test('/activity: vault, receipts, form errors, scheduled change, paused', async ({ page }) => {
    await startExampleVault(page)
    await axe(page, '/activity (with vault, no receipts)')
    await press(page, 'Pay $4.00 to Cloud hosting')
    await press(page, 'Pay $80.00 to Cloud hosting')
    await press(page, /^Raise its own limit/)
    await press(page, 'Skip ahead 1 hour')
    await page.locator('details.tech summary').first().click()
    await axe(page, '/activity (with receipts)')

    await openAll(page)
    await page.locator('#custom-amount').fill('-1')
    await page.getByRole('button', { name: 'Send request' }).click()
    await page.locator('#limit-payment').fill('x')
    await page.getByRole('button', { name: 'Save limits' }).click()
    await page.getByRole('button', { name: 'Add recipient' }).click()
    await page.locator('#withdraw-amount').fill('500')
    await page.getByRole('button', { name: 'Withdraw to yourself' }).click()
    await expect(page.locator('#withdraw-amount-error')).toBeVisible()
    await axe(page, '/activity (every disclosure open, with form errors)')

    await saveLimits(page, '50', '50')
    await expect(page.locator('.scheduled')).toBeVisible()
    await axe(page, '/activity (with a scheduled change)')
    await shot(page, 'A11Y-02-activity-scheduled')
    await press(page, 'Pause the agent now')
    await axe(page, '/activity (paused)')
  })

  test('/activity: saved vault that cannot be read', async ({ page }) => {
    await page.goto('/activity')
    await page.evaluate(() => sessionStorage.setItem('hardstop.practice.v1', '{'))
    await page.reload()
    await expect(page.getByRole('alert').filter({ hasText: 'The practice vault could not start' })).toBeVisible()
    await axe(page, '/activity (error state)')
  })

  test.afterAll(() => {
    record('axe', { statesChecked: states, violations: findings })
  })
})

// --- keyboard ---------------------------------------------------------------

type Focus = { what: string; outline: string; ring: boolean }

/** What has focus, and whether a focus indicator is drawn on it (or on the row that stands for it). */
const focused = (page: Page): Promise<Focus> =>
  page.evaluate(() => {
    const element = document.activeElement as HTMLElement
    const drawn = (node: Element | null): boolean => {
      if (!node) return false
      const style = getComputedStyle(node)
      const hasOutline = style.outlineStyle !== 'none' && parseFloat(style.outlineWidth) >= 2
      return hasOutline || style.boxShadow !== 'none'
    }
    const style = getComputedStyle(element)
    const label = (element.getAttribute('aria-label') ?? element.textContent ?? '').trim().replace(/\s+/g, ' ').slice(0, 40)
    return {
      what: `${element.tagName.toLowerCase()}${element.id ? `#${element.id}` : ''} "${label}"`,
      outline: `${style.outlineStyle} ${style.outlineWidth} ${style.outlineColor}`,
      ring: drawn(element) || drawn(element.closest('.choice')),
    }
  })

/** Presses Tab (or Shift+Tab) until `wanted` has focus. Every stop on the way must show a focus indicator. */
async function tabTo(page: Page, wanted: RegExp, trail: Focus[], key: 'Tab' | 'Shift+Tab' = 'Tab'): Promise<void> {
  for (let presses = 0; presses < 80; presses++) {
    await page.keyboard.press(key)
    const stop = await focused(page)
    trail.push(stop)
    // Past the last link, Tab leaves the page for the browser's own controls;
    // headless Chromium reports that stop as <body>. Nothing on the page has
    // focus then, so there is nothing to draw a ring on. Counted in the trail.
    if (stop.what.startsWith('body')) continue
    expect(stop.ring, `visible focus indicator on ${stop.what} (${stop.outline}), after ${trail.slice(-6, -1).map((s) => s.what).join(' > ')}`).toBe(true)
    if (wanted.test(stop.what)) return
  }
  throw new Error(`${wanted} never received focus`)
}

test.describe('Accessibility: keyboard only', () => {
  test('the primary journey with Tab, Shift+Tab, Enter and Space', async ({ page }) => {
    const trail: Focus[] = []
    await page.goto('/')
    await expect(page.getByText(/^In the vault: \$100\.00/)).toBeVisible()

    // The first stop is the skip link, and it is on screen when focused.
    await page.keyboard.press('Tab')
    const skip = page.getByRole('link', { name: 'Skip to content' })
    await expect(skip).toBeFocused()
    await expect(skip).toBeInViewport()
    trail.push(await focused(page))

    // Home example with Space and Enter.
    await tabTo(page, /^button "Agent pays \$4"/, trail)
    await page.keyboard.press('Space')
    const demo = page.locator('section[aria-labelledby="demo-title"]')
    await expect(demo.locator('.slip')).toHaveCount(1)
    await tabTo(page, /^button "Agent tries \$80"/, trail)
    await page.keyboard.press('Enter')
    await expect(demo.locator('.slip')).toHaveCount(2)
    await expect(page.getByRole('button', { name: 'Agent tries $80' })).toBeFocused()

    // Back up to the primary call to action.
    await tabTo(page, /^a "Protect my AI"/, trail, 'Shift+Tab')
    await expect(page.getByRole('main').getByRole('link', { name: 'Protect my AI' })).toBeFocused()
    await page.keyboard.press('Enter')
    await expect(page).toHaveURL(/\/protect$/)
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Set the rules your agent has to live inside')

    // The page changed without a reload: keyboard order starts at the new
    // page's content, so the very next Tab is its first field, not the footer.
    await expect(page.locator('main')).toBeFocused()
    await page.keyboard.press('Tab')
    await expect(page.locator('#perPayment')).toBeFocused()
    trail.push(await focused(page))

    // The form: change the day limit by typing, pass through the radio groups, then review.
    await tabTo(page, /^input#perDay/, trail)
    await page.keyboard.press('Control+A')
    await page.keyboard.type('30')
    await tabTo(page, /^button "Review the rules"/, trail)
    await page.keyboard.press('Enter')
    const reviewTitle = page.getByRole('heading', { name: 'Check the rules before you create the vault' })
    await expect(reviewTitle).toBeFocused()
    await expect(page.getByText('up to $10.00 at a time, and up to $30.00 in a day')).toBeVisible()

    await tabTo(page, /^button "Create vault"/, trail)
    await page.keyboard.press('Enter')
    await expect(page).toHaveURL(/\/activity$/)
    await expect(page.getByRole('heading', { name: 'What the agent tries' })).toBeVisible()
    await expect(page.locator('main')).toBeFocused()

    // On the vault: pay with Space, open a disclosure with Enter, pause with Space.
    await tabTo(page, /^button "Pay \$4\.00 to Cloud hosting"/, trail)
    await page.keyboard.press('Space')
    await expect(page.locator('section[aria-labelledby="receipts-title"] li')).toHaveCount(1)
    await expect(page.locator('section[aria-labelledby="receipts-title"] .stamp')).toHaveText('Paid')
    await expect(page.getByRole('button', { name: 'Pay $4.00 to Cloud hosting' })).toBeFocused()
    await tabTo(page, /^button "Pay \$80\.00 to Cloud hosting"/, trail)
    await page.keyboard.press('Enter')
    await expect(page.locator('section[aria-labelledby="receipts-title"] li')).toHaveCount(2)
    await tabTo(page, /^summary "Technical details"/, trail)
    await page.keyboard.press('Enter')
    await expect(page.locator('section[aria-labelledby="receipts-title"] details.tech').first()).toHaveAttribute('open', '')
    await tabTo(page, /^button "Pause the agent now"/, trail)
    await page.keyboard.press('Space')
    await expect(page.locator('section[aria-labelledby="receipts-title"] li')).toHaveCount(3)
    await expect(page.getByText('Nothing the agent asks for is paid.', { exact: true })).toBeVisible()

    expect(trail.filter((stop) => stop.what.startsWith('body')), 'times focus left the page').toEqual([])
    record('keyboard-trail', { stops: trail.length, trail })
    await shot(page, 'A11Y-03-keyboard-journey-end')
  })

  test('a form error moves focus to the summary, and its links go to the fields', async ({ page }) => {
    await page.goto('/protect')
    await page.locator('#perPayment').fill('50')
    await page.locator('#perPayment').press('Enter')
    const summary = page.getByRole('alert').filter({ hasText: 'Fix this to continue' })
    await expect(summary).toBeFocused()
    await expect(summary.getByRole('link')).toHaveText('One payment cannot be larger than the whole day’s limit.')
    await page.keyboard.press('Tab')
    await page.keyboard.press('Enter')
    await expect(page.locator('#perPayment')).toBeFocused()
  })
})

// --- announcements, error association, reduced motion ------------------------

test.describe('Accessibility: announcements and errors', () => {
  test('every verdict is announced through a polite live region', async ({ page }) => {
    // Home example.
    await page.goto('/')
    const demo = page.locator('section[aria-labelledby="demo-title"]')
    const homeRegion = demo.locator('p[role="status"][aria-live="polite"]')
    await expect(homeRegion).toHaveCount(1)
    await expect(homeRegion).toHaveText('')
    await demo.getByRole('button', { name: 'Agent pays $4' }).click()
    await expect(homeRegion).toHaveText('Paid. Inside every limit. $16.00 left today.')
    await demo.getByRole('button', { name: 'Agent tries $80' }).click()
    await expect(homeRegion).toHaveText('Blocked: too large. One payment may be at most $10.00.')

    // The visitor's vault: the region exists before anything is said.
    await startExampleVault(page)
    await expect(announcer(page)).toHaveCount(1)
    await expect(announcer(page)).toHaveText('')
    const said = async (run: () => Promise<unknown>, text: string | RegExp) => {
      await run()
      await expect(announcer(page)).toHaveText(text)
    }
    await said(() => press(page, 'Pay $4.00 to Cloud hosting'), 'Paid. Inside every limit. $16.00 left today.')
    await said(() => press(page, 'Pay $80.00 to Cloud hosting'), 'Blocked: too large. One payment may be at most $10.00.')
    // The same verdict twice in a row still changes the region, so it is spoken again.
    const first = await announcer(page).evaluate((region) => region.textContent)
    await press(page, 'Pay $80.00 to Cloud hosting')
    await expect(announcer(page)).toHaveText('Blocked: too large. One payment may be at most $10.00.')
    expect(await announcer(page).evaluate((region) => region.textContent)).not.toBe(first)
    await said(() => press(page, 'Pay $4.00 to an address you never approved'), /^Blocked: unknown recipient\. This recipient is not on your approved list/)
    await said(() => press(page, 'Send the last paid request again'), /^Blocked: repeat request\. /)
    await said(() => press(page, /^Raise its own limit/), 'The agent tried to change the rules. Rejected. Only you can change the rules.')
    await said(() => saveLimits(page, '50', '50'), /^You asked for looser rules\. Scheduled: they take effect /)
    await said(() => press(page, 'Cancel scheduled change'), 'You cancelled the scheduled change. The rules stay as they are.')
    await said(() => press(page, 'Pause the agent now'), 'You paused the agent. In force at once.')
    await said(() => press(page, 'Pay $4.00 to Cloud hosting'), /^Blocked: paused\. You paused this agent/)
    await said(() => press(page, 'Skip ahead 1 day'), /^Practice clock skipped ahead 1 day, to /)
  })

  test('form errors are tied to their inputs', async ({ page }) => {
    const tied = async (input: string, error: string, text: string | RegExp) => {
      const field = page.locator(input)
      await expect(field).toHaveAttribute('aria-invalid', 'true')
      const ids = ((await field.getAttribute('aria-describedby')) ?? '').split(' ')
      expect(ids, `${input} is described by ${error}`).toContain(error)
      await expect(page.locator(`#${error}`)).toHaveText(text)
      await expect(page.locator(`#${error}`)).toBeVisible()
    }
    const clean = async (input: string) => {
      await expect(page.locator(input)).not.toHaveAttribute('aria-invalid', 'true')
    }

    await page.goto('/protect')
    await clean('#perPayment')
    await page.locator('#perPayment').fill('abc')
    await page.locator('#perDay').fill('0')
    await page.locator('#funding').fill('2000000')
    await page.locator('#recipient-0').fill('   ')
    await page.getByRole('button', { name: 'Review the rules' }).click()
    await tied('#perPayment', 'perPayment-error', 'Enter the most per payment as a number of dollars, for example 10 or 12.50.')
    await tied('#perDay', 'perDay-error', 'The most per day must be more than $0.')
    await tied('#funding', 'funding-error', 'Enter $1,000,000.00 or less.')
    await tied('#recipient-0', 'recipients-error', 'Give every recipient a name, or remove the empty one.')
    // A hint stays attached next to the error.
    expect(await page.locator('#perDay').getAttribute('aria-describedby')).toBe('perDay-hint perDay-error')
    // The summary lists the same four messages and is an alert.
    await expect(page.getByRole('alert').filter({ hasText: 'Fix these 4 things to continue' }).getByRole('listitem')).toHaveCount(4)
    // Fixing a field and resubmitting clears its error.
    await page.locator('#perPayment').fill('10')
    await page.getByRole('button', { name: 'Review the rules' }).click()
    await clean('#perPayment')
    await expect(page.locator('#perPayment-error')).toHaveCount(0)

    await startExampleVault(page)
    await openAll(page)
    await page.locator('#custom-amount').fill('ten')
    await page.getByRole('button', { name: 'Send request' }).click()
    await tied('#custom-amount', 'custom-amount-error', /^Enter the amount as a number of dollars/)
    await page.locator('#limit-payment').fill('30')
    await page.getByRole('button', { name: 'Save limits' }).click()
    await tied('#limit-payment', 'limit-payment-error', 'One payment cannot be larger than the whole day’s limit.')
    await page.getByRole('button', { name: 'Add recipient' }).click()
    await tied('#new-recipient', 'new-recipient-error', 'Enter a name for the recipient.')
    await page.locator('#new-recipient').fill('cloud HOSTING')
    await page.getByRole('button', { name: 'Add recipient' }).click()
    await tied('#new-recipient', 'new-recipient-error', 'There is already a recipient with that name.')
    await page.locator('#withdraw-amount').fill('100.01')
    await page.getByRole('button', { name: 'Withdraw to yourself' }).click()
    await tied('#withdraw-amount', 'withdraw-amount-error', 'The vault only holds $100.00.')
    // None of those sent anything to the vault.
    await expect(page.locator('section[aria-labelledby="receipts-title"] li')).toHaveCount(0)
  })
})

test.describe('Accessibility: reduced motion', () => {
  /** The longest animation or transition, in ms, on the newest slip, its stamp, the gauge and the button pressed. */
  const motion = (page: Page): Promise<{ longestMs: number; running: number; names: string[] }> =>
    page.evaluate(() => {
      const ms = (value: string) => Math.max(...value.split(',').map((part) => (part.trim().endsWith('ms') ? parseFloat(part) : parseFloat(part) * 1000)))
      const nodes = Array.from(document.querySelectorAll('.slip, .slip .stamp, .logline, .gauge-fill, .btn'))
      let longestMs = 0
      const names: string[] = []
      for (const node of nodes) {
        const style = getComputedStyle(node)
        if (style.animationName !== 'none') {
          names.push(style.animationName)
          longestMs = Math.max(longestMs, ms(style.animationDuration) + ms(style.animationDelay))
        }
        if (style.transitionProperty !== 'none') longestMs = Math.max(longestMs, ms(style.transitionDuration) + ms(style.transitionDelay))
      }
      const running = document.getAnimations().filter((animation) => {
        const timing = animation.effect?.getComputedTiming()
        return Number(timing?.duration ?? 0) + Number(timing?.delay ?? 0) > 10
      }).length
      return { longestMs, running, names }
    })

  test('with reduced motion, nothing on a verdict animates for longer than 10 ms', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.goto('/')
    const demo = page.locator('section[aria-labelledby="demo-title"]')
    await demo.getByRole('button', { name: 'Agent tries $80' }).click()
    await expect(demo.locator('.slip.is-new')).toHaveCount(1)
    expect(await motion(page)).toEqual({ longestMs: 0, running: 0, names: [] })

    await startExampleVault(page)
    await press(page, 'Pay $4.00 to Cloud hosting')
    await expect(page.locator('.slip.is-new')).toHaveCount(1)
    expect(await motion(page)).toEqual({ longestMs: 0, running: 0, names: [] })
    await press(page, 'Pause the agent now')
    await expect(page.locator('.logline.is-new')).toHaveCount(1)
    expect(await motion(page)).toEqual({ longestMs: 0, running: 0, names: [] })
  })

  test('control: without the preference the slip does animate, so the check above can fail', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'no-preference' })
    await startExampleVault(page)
    await press(page, 'Pay $4.00 to Cloud hosting')
    const measured = await motion(page)
    expect(measured.names).toContain('print-out')
    expect(measured.names).toContain('stamp-down')
    expect(measured.longestMs).toBeGreaterThanOrEqual(300)
  })
})
