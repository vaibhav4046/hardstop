// Persona E: an adversarial agent. Scripted, not a human.
// Everything goes through the screens (the agent panel and "Send a different
// request"), plus reloads and edits to what the browser saved.

import type { Page } from '@playwright/test'
import {
  balance,
  expect,
  fillRequest,
  newest,
  press,
  readSession,
  receipts,
  record,
  request,
  shot,
  skipDays,
  startExampleVault,
  STORAGE_KEY,
  test,
  writeSession,
} from './helpers'

const CLOUD = '0x0000000000000000000000000000000000005109'

/** Submits the custom form expecting the form itself to refuse: an error shows and nothing is sent. */
async function refusedByForm(page: Page, amount: string, message: RegExp): Promise<void> {
  const before = await receipts(page).count()
  const saved = JSON.stringify(await readSession(page))
  await fillRequest(page, amount)
  await page.getByRole('button', { name: 'Send request' }).click()
  await expect(page.locator('#custom-amount-error')).toHaveText(message)
  await expect(page.locator('#custom-amount')).toHaveAttribute('aria-invalid', 'true')
  await expect(receipts(page)).toHaveCount(before)
  expect(JSON.stringify(await readSession(page)), `nothing saved for "${amount}"`).toBe(saved)
}

test.describe('Persona E: adversarial agent', () => {
  test.beforeEach(async ({ page }) => {
    await startExampleVault(page)
  })

  test('amounts around the cap: over, exactly, one cent over', async ({ page }) => {
    let slip = await request(page, '80')
    await expect(slip.locator('.stamp')).toHaveText('Blocked')
    await expect(slip).toContainText('One payment may be at most $10.00.')
    slip = await request(page, '10')
    await expect(slip.locator('.stamp')).toHaveText('Paid')
    await expect(slip).toContainText('Inside every limit. $10.00 left today.')
    await expect(balance(page)).toHaveText('$90.00')
    slip = await request(page, '10.01')
    await expect(slip.locator('.stamp')).toHaveText('Blocked')
    await expect(slip.locator('.slip-amount')).toHaveText('$10.01')
    await expect(slip).toContainText('One payment may be at most $10.00.')
    await expect(balance(page)).toHaveText('$90.00')
    await shot(page, 'E-01-around-the-cap')
  })

  test('amounts that are not amounts: zero, negative, text, 1e30, 31 digits, seven decimals, over the form maximum', async ({ page }) => {
    const notANumber = /^Enter the amount as a number of dollars, for example 10 or 12\.50\.$/
    await refusedByForm(page, '0', /^The amount must be more than \$0\.$/)
    await refusedByForm(page, '0.00', /^The amount must be more than \$0\.$/)
    await refusedByForm(page, '-5', notANumber)
    await refusedByForm(page, 'abc', notANumber)
    await refusedByForm(page, '', notANumber)
    await refusedByForm(page, '1e30', notANumber)
    await refusedByForm(page, '1000000000000000000000000000000', notANumber)
    await refusedByForm(page, '1.0000001', notANumber)
    await refusedByForm(page, '4.999', notANumber)
    await refusedByForm(page, '0x10', notANumber)
    await refusedByForm(page, '１０', notANumber)
    await refusedByForm(page, '1000001', /^Enter \$1,000,000\.00 or less\.$/)
    // The largest amount the form does send is still decided by the vault.
    const slip = await request(page, '1000000')
    await expect(slip.locator('.stamp')).toHaveText('Blocked')
    await expect(slip.locator('.slip-amount')).toHaveText('$1,000,000.00')
    await expect(balance(page)).toHaveText('$100.00')
    await shot(page, 'E-02-form-refusals')
  })

  test('amounts the form will not send still get the contract’s answer when replayed from storage', async ({ page }) => {
    // Zero and 10^29 base units cannot be typed, so they are put in the saved
    // session. After the reload each shows what the contract said.
    const session = await readSession(page)
    session.actions.push({ type: 'pay', to: CLOUD, amount: '0', nonce: '0' })
    session.actions.push({ type: 'pay', to: CLOUD, amount: '1'.padEnd(30, '0'), nonce: '0' })
    await writeSession(page, JSON.stringify(session))
    await page.reload()
    await expect(receipts(page)).toHaveCount(2)
    await expect(receipts(page).nth(1).locator('h3')).toContainText('Blocked: nothing to pay')
    await expect(receipts(page).nth(1)).toContainText('The agent asked to pay an amount of zero.')
    await expect(receipts(page).nth(0).locator('h3')).toContainText('Blocked: too large')
    await expect(receipts(page).nth(0)).toContainText('One payment may be at most $10.00.')
    await expect(balance(page)).toHaveText('$100.00')
  })

  test('unapproved recipient, replay, and raising its own limit', async ({ page }) => {
    let slip = await press(page, 'Pay $4.00 to an address you never approved')
    await expect(slip.locator('h3')).toContainText('Blocked: unknown recipient')
    slip = await request(page, '4', 'An address you never approved')
    await expect(slip.locator('h3')).toContainText('Blocked: unknown recipient')
    await expect(balance(page)).toHaveText('$100.00')

    // Nothing has been paid yet, so there is nothing to replay.
    await expect(page.getByRole('button', { name: 'Send the last paid request again' })).toBeDisabled()
    await press(page, 'Pay $4.00 to Cloud hosting')
    await expect(balance(page)).toHaveText('$96.00')
    slip = await press(page, 'Send the last paid request again')
    await expect(slip.locator('h3')).toContainText('Blocked: repeat request')
    await expect(balance(page)).toHaveText('$96.00')
    slip = await press(page, 'Send the last paid request again')
    await expect(slip.locator('h3')).toContainText('Blocked: repeat request')

    slip = await press(page, /^Raise its own limit to \$1,000\.00/)
    await expect(slip.locator('.stamp')).toHaveText('Rejected')
    await expect(slip.locator('.slip-sentence')).toHaveText('Rejected. Only you can change the rules.')
    await expect(page.locator('section[aria-labelledby="rules-title"]')).toContainText('Most per payment$10.00')
    await expect(page.locator('.scheduled')).toHaveCount(0)
    slip = await request(page, '11', 'Cloud hosting')
    await expect(slip).toContainText('One payment may be at most $10.00.')
    await shot(page, 'E-03-replay-and-self-raise')
  })

  test('splitting: $10 + $10, then one cent', async ({ page }) => {
    await request(page, '10')
    let slip = await request(page, '10')
    await expect(slip.locator('.stamp')).toHaveText('Paid')
    await expect(slip).toContainText('Inside every limit. $0.00 left today.')
    slip = await request(page, '0.01')
    await expect(slip.locator('.stamp')).toHaveText('Blocked')
    await expect(slip.locator('h3')).toContainText('Blocked: limit reached')
    await expect(slip).toContainText('Only $0.00 is left today.')
    await expect(balance(page)).toHaveText('$80.00')
    await shot(page, 'E-04-splitting')
  })

  test('payment while paused, and after the end date', async ({ page }) => {
    test.setTimeout(180_000)
    await press(page, 'Pause the agent now')
    let slip = await press(page, 'Pay $4.00 to Cloud hosting')
    await expect(slip.locator('h3')).toContainText('Blocked: paused')
    await expect(balance(page)).toHaveText('$100.00')
    await press(page, 'Resume the agent')
    await skipDays(page, 1)
    slip = await press(page, 'Pay $4.00 to Cloud hosting')
    await expect(slip.locator('.stamp')).toHaveText('Paid')

    // The permission lasts 30 days. Skip the practice clock past its end.
    await skipDays(page, 30)
    slip = await press(page, 'Pay $4.00 to Cloud hosting')
    await expect(slip.locator('h3')).toContainText('Blocked: expired')
    await expect(slip.locator('.slip-sentence')).toHaveText(/^The agent's permission ended on \d{1,2} \w{3} \d{4}, \d{2}:\d{2}\.$/)
    await expect(balance(page)).toHaveText('$96.00')
    await shot(page, 'E-05-expired')
  })

  test('rapid double-click on Pay: no extra payment, receipt list intact', async ({ page }) => {
    // Two clicks in the same task, far inside 50 ms.
    const pay = page.getByRole('button', { name: 'Pay $4.00 to Cloud hosting' })
    const gap = await pay.evaluate((button: HTMLButtonElement) => {
      const first = performance.now()
      button.click()
      button.click()
      return performance.now() - first
    })
    expect(gap).toBeLessThan(50)
    await expect(receipts(page)).toHaveCount(1)
    await expect(pay).toBeEnabled()
    await expect(balance(page)).toHaveText('$96.00')

    // A real mouse double-click, and then four clicks as fast as the page takes them.
    await pay.dblclick({ delay: 0 })
    await expect(pay).toBeEnabled()
    await pay.evaluate((button: HTMLButtonElement) => {
      for (let click = 0; click < 4; click++) button.click()
    })
    await expect(pay).toBeEnabled()
    await press(page, 'Pay $80.00 to Cloud hosting')

    // Whatever was accepted, the books agree: balance = 100 - paid, never past the day limit.
    const stamps = await receipts(page).locator('.stamp').allTextContents()
    const paid = stamps.filter((stamp) => stamp === 'Paid').length
    expect(paid).toBeGreaterThanOrEqual(1)
    expect(paid).toBeLessThanOrEqual(5)
    await expect(balance(page)).toHaveText(`$${100 - 4 * paid}.00`)
    const saved = await readSession(page)
    expect(saved.actions).toHaveLength(stamps.length)
    const titles = await receipts(page).locator('h3').evaluateAll((headings) => headings.map((heading) => heading.id))
    expect(new Set(titles).size, 'every receipt has its own id').toBe(titles.length)
    // The list survives a rebuild from storage unchanged.
    await page.reload()
    await expect(receipts(page)).toHaveCount(stamps.length)
    expect(await receipts(page).locator('.stamp').allTextContents()).toEqual(stamps)
    await expect(balance(page)).toHaveText(`$${100 - 4 * paid}.00`)
  })

  test('rapid double-click on the home example', async ({ page }) => {
    await page.goto('/')
    const demo = page.locator('section[aria-labelledby="demo-title"]')
    await page.locator('#live-example').scrollIntoViewIfNeeded()
    await expect(demo.getByText(/^In the vault: \$100\.00\. Left today: \$20\.00\.$/)).toBeVisible()
    const pay = demo.getByRole('button', { name: 'Agent pays $4' })
    await pay.evaluate((button: HTMLButtonElement) => {
      button.click()
      button.click()
    })
    await expect(pay).toBeEnabled()
    await expect(demo.locator('.slip').first()).toBeVisible()
    const count = await demo.locator('.slip').count()
    expect(count).toBeGreaterThanOrEqual(1)
    expect(count).toBeLessThanOrEqual(2)
    const stamps = await demo.locator('.stamp').allTextContents()
    const paid = stamps.filter((stamp) => stamp === 'Paid').length
    // Each receipt is its own: no duplicated ids, and the balance matches what was paid.
    const titles = await demo.locator('.slip h3').evaluateAll((headings) => headings.map((heading) => heading.id))
    expect(new Set(titles).size, 'every receipt has its own id').toBe(titles.length)
    await expect(demo.getByText(`In the vault: $${100 - 4 * paid}.00. Left today: $${20 - 4 * paid}.00.`)).toBeVisible()
    await shot(page, 'E-06-home-double-click')
  })

  test('reload mid-session, then continue', async ({ page }) => {
    await press(page, 'Pay $4.00 to Cloud hosting')
    await press(page, 'Pay $80.00 to Cloud hosting')
    await request(page, '6')
    const before = await receipts(page).allInnerTexts()
    await page.reload()
    await expect(receipts(page)).toHaveCount(3)
    expect(await receipts(page).allInnerTexts()).toEqual(before)
    await expect(balance(page)).toHaveText('$90.00')
    // The next request carries the number the contract expects, and replay still fails.
    const slip = await request(page, '10')
    await expect(slip.locator('.stamp')).toHaveText('Paid')
    await expect(slip).toContainText('Inside every limit. $0.00 left today.')
    await expect(await press(page, 'Send the last paid request again')).toContainText('The agent must send a new one (request 3).')
    // Leaving for another page and coming back keeps it too.
    await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'How it works' }).click()
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('One door for the agent. Every control for you.')
    await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Activity' }).click()
    await expect(receipts(page)).toHaveCount(5)
    await expect(balance(page)).toHaveText('$80.00')
  })

  test('corrupt saved data: an error with a way out, not a broken page', async ({ page, problems }) => {
    await press(page, 'Pay $4.00 to Cloud hosting')
    for (const raw of ['{"setup":', 'null', '[]', '{"setup":{},"actions":[]}', JSON.stringify({ setup: (await readSession(page)).setup, actions: [{ type: 'mint', amount: '1' }] })]) {
      await writeSession(page, raw)
      await page.reload()
      await expect(page.getByRole('alert').filter({ hasText: 'The vault could not be opened' })).toBeVisible()
      await expect(page.getByRole('button', { name: 'Discard the saved vault' })).toBeVisible()
    }
    await shot(page, 'E-07-corrupt-storage')
    await page.getByRole('button', { name: 'Discard the saved vault' }).click()
    await expect(page.getByRole('heading', { name: 'You have no practice vault yet' })).toBeVisible()
    expect(await page.evaluate((key) => sessionStorage.getItem(key), STORAGE_KEY)).toBeNull()
    // The other pages still work with corrupt data saved.
    await writeSession(page, '{"setup":')
    await page.goto('/')
    await page.locator('#live-example').scrollIntoViewIfNeeded()
    await expect(page.getByText(/^In the vault: \$100\.00/)).toBeVisible()
    await page.goto('/protect')
    await expect(page.getByRole('button', { name: 'Review the rules' })).toBeEnabled()
    expect(problems.list).toEqual([])
  })

  test('saved data that cannot be rebuilt: an error with a way out', async ({ page }) => {
    const session = await readSession(page)
    // A clock skip far beyond what a timestamp can hold, and a vault whose single payment exceeds its day.
    const broken = [
      { ...session, actions: [{ type: 'skip', seconds: '9'.repeat(30) }] },
      { setup: { ...session.setup, perPayment: '50000000', perDay: '20000000' }, actions: [] },
      { setup: { ...session.setup, coolingSecs: '0' }, actions: [] },
    ]
    const outcomes: string[] = []
    for (const candidate of broken) {
      await writeSession(page, JSON.stringify(candidate))
      await page.reload()
      const failed = page.getByRole('alert').filter({ hasText: 'The vault could not be opened' })
      const ready = page.getByRole('heading', { name: 'What the agent tries' })
      await expect(failed.or(ready)).toBeVisible()
      outcomes.push((await failed.isVisible()) ? 'error shown' : 'vault rebuilt')
      if (await ready.isVisible()) {
        // If the contract accepted it, the vault must still answer requests.
        const slip = await press(page, 'Pay $4.00 to Cloud hosting')
        await expect(slip.locator('.stamp')).toBeVisible()
      }
    }
    record('persona-e-unbuildable-sessions', {
      'clock skip of 10^30 seconds': outcomes[0],
      'one payment larger than the day limit ($50 > $20)': outcomes[1],
      'cooling period of zero seconds': outcomes[2],
    })
  })

  test('a hand-edited action that claims a payment the contract refuses', async ({ page }) => {
    await press(page, 'Pay $4.00 to Cloud hosting')
    const session = await readSession(page)
    // An $80 payment, written as if it had been paid, plus a "raise" the agent never had the right to make.
    session.actions.push({
      type: 'pay',
      to: CLOUD,
      amount: '80000000',
      nonce: '1',
      outcome: { ok: true, code: 0, detail: '0' },
      kind: 'payment',
      stamp: 'Paid',
    })
    session.actions.push({ type: 'agentRaise', outcome: { ok: true } })
    session.actions.push({ type: 'pay', to: '0x0000000000000000000000000000000000000bad', amount: '4000000', nonce: '1' })
    await writeSession(page, JSON.stringify(session))
    await page.reload()
    await expect(receipts(page)).toHaveCount(4)
    // Oldest to newest: paid $4, then what the contract actually does with the three edits.
    await expect(receipts(page).nth(3).locator('.stamp')).toHaveText('Paid')
    await expect(receipts(page).nth(2).locator('.stamp')).toHaveText('Blocked')
    await expect(receipts(page).nth(2)).toContainText('One payment may be at most $10.00.')
    await expect(receipts(page).nth(1).locator('.stamp')).toHaveText('Rejected')
    await expect(receipts(page).nth(0).locator('h3')).toContainText('Blocked: unknown recipient')
    await expect(balance(page)).toHaveText('$96.00')
    await expect(page.locator('section[aria-labelledby="rules-title"]')).toContainText('Most per payment$10.00')
    await expect(page.locator('section[aria-labelledby="rules-title"]')).toContainText('Most per day$20.00')
    // And the vault carries on from the true state.
    const slip = await press(page, 'Pay $4.00 to Cloud hosting')
    await expect(slip).toContainText('Inside every limit. $12.00 left today.')
    await expect(newest(page).locator('.stamp')).toHaveText('Paid')
    await shot(page, 'E-08-tampered-storage')
  })
})
