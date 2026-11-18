// Persona B: Arjun, 37, SaaS founder. Scripted, not a human.
// Sets specific limits and two recipients, then uses every owner control and
// checks what the screen says after each one.

import {
  act,
  balance,
  expect,
  newest,
  openOwner,
  press,
  readSession,
  receipts,
  request,
  rulesInForce,
  saveLimits,
  scheduled,
  shot,
  skipDays,
  test,
  writeSession,
} from './helpers'

test.describe('Persona B: Arjun, SaaS founder', () => {
  test('own limits, two recipients, and every owner control', async ({ page }) => {
    test.setTimeout(180_000)
    await page.goto('/protect')

    // $25 per payment, $60 per day, two named recipients.
    await page.locator('#perPayment').fill('25')
    await page.locator('#perDay').fill('60')
    await page.locator('#recipient-0').fill('Render hosting')
    await page.getByRole('button', { name: 'Add a recipient' }).click()
    await page.locator('#recipient-1').fill('Design contractor')
    await page.getByRole('button', { name: 'Review the rules' }).click()
    const review = page.locator('section[aria-labelledby="review-title"]')
    await expect(review).toContainText('up to $25.00 at a time, and up to $60.00 in a day')
    await expect(review).toContainText('It may pay only Render hosting and Design contractor.')
    await expect(review).toContainText('The vault starts with $100.00 in test dollars.')
    await shot(page, 'B-01-review')
    await page.getByRole('button', { name: 'Create it in this browser' }).click()
    await expect(page.getByRole('heading', { name: 'What the agent tries' })).toBeVisible()
    await expect(rulesInForce(page)).toContainText('Most per payment$25.00')
    await expect(rulesInForce(page)).toContainText('Most per day$60.00')

    // Within the limits, then over the per-payment limit.
    let slip = await request(page, '20', 'Render hosting')
    await expect(slip.locator('.stamp')).toHaveText('Paid')
    await expect(slip).toContainText('Inside every limit. $40.00 left today.')
    await expect(balance(page)).toHaveText('$80.00')
    slip = await request(page, '30', 'Design contractor')
    await expect(slip.locator('.stamp')).toHaveText('Blocked')
    await expect(slip).toContainText('One payment may be at most $25.00.')
    await expect(balance(page)).toHaveText('$80.00')

    // Pause: instant, and the next payment is refused.
    let line = await press(page, 'Pause the agent now')
    await expect(line).toHaveText('You paused the agent. In force at once.')
    await expect(rulesInForce(page)).toContainText('AgentPaused')
    slip = await request(page, '5', 'Render hosting')
    await expect(slip.locator('h3')).toContainText('Blocked: paused')
    await expect(slip).toContainText('You paused this agent. Nothing it asks for is paid until you resume it.')
    await shot(page, 'B-02-paused')

    // Resuming loosens the rules, so it is scheduled, and still paused meanwhile.
    line = await press(page, 'Resume the agent')
    await expect(line).toContainText('You asked for looser rules. Scheduled: they take effect')
    await expect(scheduled(page)).toContainText('Scheduled')
    await expect(page.getByText(/^Resuming is scheduled for /)).toBeVisible()
    slip = await request(page, '5', 'Render hosting')
    await expect(slip.locator('h3')).toContainText('Blocked: paused')
    await skipDays(page, 1)
    await expect(rulesInForce(page)).toContainText('AgentActive')
    await expect(scheduled(page)).toHaveCount(0)

    // Lower a limit: applies at once.
    line = await saveLimits(page, '15', '')
    await expect(line).toHaveText('You changed the rules. Nothing in the change was looser, so it is in force at once.')
    await expect(rulesInForce(page)).toContainText('Most per payment$15.00')
    await expect(scheduled(page)).toHaveCount(0)
    slip = await request(page, '20', 'Render hosting')
    await expect(slip).toContainText('One payment may be at most $15.00.')

    // Raise one: Scheduled with a time, and the old limit still applies.
    line = await saveLimits(page, '40', '')
    await expect(line).toContainText('You asked for looser rules. Scheduled: they take effect')
    await expect(scheduled(page).locator('.tag')).toHaveText('Scheduled')
    await expect(scheduled(page)).toContainText(/Takes effect \d{1,2} \w{3} \d{4}, \d{2}:\d{2}/)
    await expect(scheduled(page)).toContainText('Most per payment$40.00')
    await expect(rulesInForce(page)).toContainText('Most per payment$15.00')
    slip = await request(page, '30', 'Render hosting')
    await expect(slip.locator('.stamp')).toHaveText('Blocked')
    await expect(slip).toContainText('One payment may be at most $15.00.')
    await shot(page, 'B-03-raise-scheduled')

    // The waiting raise is announced on every page, not only here.
    const waiting = page.getByRole('status', { name: /loosens your vault.s rules is waiting/ })
    await expect(waiting).toContainText('$40.00 at a time')
    const kept = await receipts(page).count()
    await page.goto('/how-it-works')
    await expect(waiting).toBeVisible()
    await expect(waiting.getByRole('link', { name: 'See it on your vault' })).toBeVisible()
    await page.goto('/activity')
    // Back on the vault: wait until its receipts are read back before acting again.
    await expect(receipts(page)).toHaveCount(kept)

    // Cancel it: the panel disappears and the rules are unchanged.
    line = await press(page, 'Cancel scheduled change')
    await expect(line).toHaveText('You cancelled the scheduled change. The rules stay as they are.')
    await expect(waiting).toHaveCount(0)
    await expect(scheduled(page)).toHaveCount(0)
    await expect(rulesInForce(page)).toContainText('Most per payment$15.00')

    // Raise again, wait out the day, and the larger payment goes through.
    await saveLimits(page, '40', '')
    await expect(scheduled(page)).toBeVisible()
    await skipDays(page, 1)
    await expect(rulesInForce(page)).toContainText('Most per payment$40.00')
    await expect(scheduled(page)).toHaveCount(0)
    slip = await request(page, '30', 'Render hosting')
    await expect(slip.locator('.stamp')).toHaveText('Paid')
    await expect(slip).toContainText('Inside every limit. $30.00 left today.')
    await expect(balance(page)).toHaveText('$50.00')

    // Add a recipient: payable only from a stated time.
    await openOwner(page, /^Recipients/)
    await page.locator('#new-recipient').fill('Stock photos')
    line = await act(page, () => page.getByRole('button', { name: 'Add recipient' }).click())
    await expect(line).toContainText(/You added Stock photos\. It can be paid from \d{1,2} \w{3} \d{4}, \d{2}:\d{2}\./)
    const added = page.locator('details li').filter({ hasText: 'Stock photos' })
    await expect(added.locator('.tag')).toContainText(/Can be paid from \d{1,2} \w{3} \d{4}, \d{2}:\d{2}/)
    slip = await request(page, '5', 'Stock photos')
    await expect(slip.locator('h3')).toContainText('Blocked: unknown recipient')
    await expect(slip).toContainText('added so recently that its waiting period has not ended')
    await shot(page, 'B-04-recipient-waiting')
    await skipDays(page, 1)
    await expect(added).toContainText('Can be paid')
    await expect(added.locator('.tag')).toHaveCount(0)
    slip = await request(page, '5', 'Stock photos')
    await expect(slip.locator('.stamp')).toHaveText('Paid')
    await expect(balance(page)).toHaveText('$45.00')

    // Remove a recipient: gone from the list and from what the agent can choose, at once.
    line = await press(page, 'Remove Design contractor')
    await expect(line).toHaveText('You removed Design contractor. In force at once.')
    await expect(page.locator('#custom-to option')).toHaveText(['Render hosting', 'Stock photos', 'An address you never approved'])

    // Withdraw: the balance drops by exactly that much.
    await openOwner(page, 'Withdraw money')
    await page.locator('#withdraw-amount').fill('30')
    line = await act(page, () => page.getByRole('button', { name: 'Withdraw to yourself' }).click())
    await expect(line).toHaveText('You withdrew $30.00 back to yourself.')
    await expect(balance(page)).toHaveText('$15.00')
    await expect(page.locator('#withdraw-amount-hint')).toContainText('The vault holds $15.00. Withdrawals go to you and nowhere else, at once.')
    await shot(page, 'B-05-after-withdraw')

    // The screens offer no way to ask for a payment to a removed recipient, so
    // the request is added to the saved session and the vault is rebuilt. The
    // verdict shown is the contract's.
    const session = await readSession(page)
    const removed = session.actions.find((action) => action.type === 'removeRecipient') as { address: string }
    const next = session.actions.filter((action) => action.type === 'pay').length
    const count = await receipts(page).count()
    session.actions.push({ type: 'pay', to: removed.address, amount: '5000000', nonce: await nextNonce(page, next) })
    await writeSession(page, JSON.stringify(session))
    await page.reload()
    await expect(receipts(page)).toHaveCount(count + 1)
    await expect(newest(page).locator('h3')).toContainText('Blocked: unknown recipient, $5.00 to Design contractor')
    await expect(balance(page)).toHaveText('$15.00')
    await shot(page, 'B-06-removed-recipient-blocked')
  })
})

/** The request number the contract expects next: paid requests so far, as the last receipt's technical details confirm. */
async function nextNonce(page: import('@playwright/test').Page, payActions: number): Promise<string> {
  // Each paid request uses one number; refused ones do not. Read it from the
  // newest paid slip instead of counting, then add one.
  const paidSlips = page.locator('section[aria-labelledby="receipts-title"] li').filter({ has: page.locator('.stamp-paid') })
  const text = await paidSlips.first().locator('details.tech').evaluate((details) => details.textContent ?? '')
  const used = /Request number \(nonce\)(\d+)/.exec(text)
  expect(used, `a request number on the newest paid slip (${payActions} pay actions sent)`).not.toBeNull()
  return (BigInt(used![1]) + 1n).toString()
}
