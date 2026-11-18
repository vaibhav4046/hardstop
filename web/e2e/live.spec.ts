// A vault on a real network, driven in the browser. The wallet here is a
// stand-in (tests/fake-network.ts): it answers what a wallet answers and runs
// the compiled contracts on an in-memory EVM. So this checks the site's own
// real-network screens and code, not a public network; see qa/TEST_RESULTS.md
// for what was and was not run against one.

import AxeBuilder from '@axe-core/playwright'
import type { Page } from '@playwright/test'
import { FakeNetwork } from '../tests/fake-network.ts'
import { expect, newest, press, receipts, shot, test } from './helpers'

const OWNER = '0x00000000000000000000000000000000000a11ce'
const LIVE_KEY = 'hardstop.live.v1'

/** Gives the page a wallet backed by `network`. */
async function connect(page: Page, network: FakeNetwork): Promise<void> {
  await page.exposeFunction('__wallet', async (args: { method: string; params?: unknown[] }) => {
    try {
      return { ok: await network.request(args) }
    } catch (error) {
      const { code, message, data } = error as { code?: number; message?: string; data?: string }
      return { error: { code, message, data } }
    }
  })
  await page.addInitScript(() => {
    const ask = (window as unknown as { __wallet: (args: unknown) => Promise<{ ok?: unknown; error?: object }> }).__wallet
    ;(window as unknown as { ethereum: unknown }).ethereum = {
      request: async (args: unknown) => {
        const answer = await ask(args)
        if (answer.error) throw Object.assign(new Error('wallet error'), answer.error)
        return answer.ok
      },
    }
  })
}

async function openOnNetwork(page: Page): Promise<void> {
  await page.goto('/protect')
  await page.getByRole('button', { name: 'Review the rules' }).click()
  await page.getByRole('button', { name: 'Open it on Base Sepolia' }).click()
  await page.waitForURL('**/activity')
  await expect(page.getByText('On Base Sepolia, a public test network.')).toBeVisible()
}

test.describe('A vault on a test network', () => {
  test('one approval creates it; the agent pays with its own key; refusals and owner changes behave as in practice', async ({ page }) => {
    const network = await FakeNetwork.create(OWNER, BigInt(Math.floor(Date.now() / 1000)))
    await connect(page, network)
    await openOnNetwork(page)

    // Two approvals: the one-time install of the Launcher, then the vault itself.
    expect(network.approved.length).toBe(2)
    await expect(page.locator('section[aria-labelledby="vault-title"] .figure')).toHaveText('$100.00')
    // A real network's clock cannot be skipped.
    await expect(page.getByRole('button', { name: /Skip ahead/ })).toHaveCount(0)
    await expect(page.getByRole('heading', { name: 'Network clock' })).toBeVisible()

    await press(page, 'Pay $4.00 to Cloud hosting')
    await expect(newest(page)).toContainText('Inside every limit. $16.00 left today.')
    const link = newest(page).locator('details.tech a')
    await expect(link).toHaveAttribute('href', /^https:\/\/sepolia\.basescan\.org\/tx\/0x[0-9a-f]{64}$/)

    await press(page, 'Pay $80.00 to Cloud hosting')
    await expect(newest(page)).toContainText('One payment may be at most $10.00.')

    await press(page, /Raise its own limit/)
    await expect(newest(page)).toContainText('Rejected. Only you can change the rules.')
    await newest(page).locator('details.tech summary').click()
    await expect(newest(page)).toContainText('None. The contract refused when asked')

    // The owner was not asked to approve anything the agent did.
    expect(network.approved.length).toBe(2)
    expect(network.relayed.length).toBe(2)

    await press(page, 'Pause the agent now')
    expect(network.approved.length).toBe(3)
    await press(page, 'Pay $4.00 to Cloud hosting')
    await expect(newest(page)).toContainText('paused')
    await shot(page, 'LIVE-01-vault-on-test-network')

    const axe = await new AxeBuilder({ page }).analyze()
    expect(axe.violations.map((violation) => `${violation.id}: ${violation.nodes.length}`)).toEqual([])
  })

  test('a reload finds the vault again, with its receipts', async ({ page }) => {
    const network = await FakeNetwork.create(OWNER, BigInt(Math.floor(Date.now() / 1000)))
    await connect(page, network)
    await openOnNetwork(page)
    await press(page, 'Pay $4.00 to Cloud hosting')
    await expect(receipts(page)).toHaveCount(1)

    await page.reload()
    await expect(page.getByText('On Base Sepolia, a public test network.')).toBeVisible()
    await expect(page.locator('section[aria-labelledby="vault-title"] .figure')).toHaveText('$96.00')
    await expect(receipts(page)).toHaveCount(1)
    expect(network.approved.length, 'reopening asks the wallet to approve nothing').toBe(2)

    // What is saved is where the vault is, not the vault.
    const saved = await page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? 'null'), LIVE_KEY)
    expect(saved.vault.chainId).toBe(84532)
    expect(saved.vault.vault).toMatch(/^0x[0-9a-f]{40}$/)
  })

  test('closing the wallet without approving changes nothing and says so', async ({ page }) => {
    const network = await FakeNetwork.create(OWNER, BigInt(Math.floor(Date.now() / 1000)))
    await connect(page, network)
    await openOnNetwork(page)

    network.refuseNext = true
    await page.getByRole('button', { name: 'Pause the agent now' }).click()
    await expect(page.getByRole('alert').filter({ hasText: 'You closed the wallet without approving' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Pause the agent now' })).toBeEnabled()
    await expect(receipts(page)).toHaveCount(0)
  })

  test('without a wallet, the review says so and the in-browser vault still works', async ({ page }) => {
    await page.goto('/protect')
    await page.getByRole('button', { name: 'Review the rules' }).click()
    await page.getByRole('button', { name: 'Open it on Base Sepolia' }).click()
    await expect(page.getByRole('alert').filter({ hasText: 'This browser has no wallet' })).toBeVisible()
    await page.getByRole('button', { name: 'Create it in this browser' }).click()
    await page.waitForURL('**/activity')
    await expect(page.getByText('In this browser only')).toBeVisible()
  })
})
