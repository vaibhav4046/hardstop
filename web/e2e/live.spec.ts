// A vault on a real network, driven in the browser. The wallet here is a
// stand-in (tests/fake-network.ts): it answers what a wallet answers and runs
// the compiled contracts on an in-memory EVM. So this checks the site's own
// real-network screens and code, not a public network; see qa/TEST_RESULTS.md
// for what was and was not run against one.

import AxeBuilder from '@axe-core/playwright'
import type { Page } from '@playwright/test'
import { FakeNetwork, FAKE_CHAIN_ID } from '../tests/fake-network.ts'
import { attach, launchVault } from '../src/lib/live/launch.ts'
import { NETWORKS } from '../src/lib/live/wallet.ts'
import path from 'node:path'
import { expect, newest, overflow, press, receipts, REPO, shot, test } from './helpers'

const OWNER = '0x00000000000000000000000000000000000a11ce'
const LIVE_KEY = 'hardstop.live.v1'

/** Gives the page a wallet backed by `network`; `shown` replaces the account it shares with the site. */
async function connect(page: Page, network: FakeNetwork, shown?: string): Promise<void> {
  await page.exposeFunction('__wallet', async (args: { method: string; params?: unknown[] }) => {
    try {
      if (shown && args.method === 'eth_accounts') return { ok: [shown] }
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
    // A vault in this browser has no agent to connect: the panel is only for one on a network.
    await expect(page.locator('section[aria-labelledby="connect-vault-title"]')).toHaveCount(0)
  })

  test('Connect your AI: each setup is filled in with this vault, and the agent key shows only when asked', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write'])
    const network = await FakeNetwork.create(OWNER, BigInt(Math.floor(Date.now() / 1000)))
    await connect(page, network)
    await openOnNetwork(page)
    const saved = await page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? 'null').vault, LIVE_KEY)
    const { agentKey, vault, chainId } = saved as { agentKey: string; vault: string; chainId: number }

    const panel = page.locator('section[aria-labelledby="connect-vault-title"]')
    await panel.scrollIntoViewIfNeeded()
    const shown = panel.locator('pre').first()
    const clipboard = () => page.evaluate(() => navigator.clipboard.readText())

    // Closed, the key is nowhere in the page; the setups show it masked but copy it whole.
    expect(await page.content()).not.toContain(agentKey.slice(2))
    await expect(shown).toContainText(`HARDSTOP_VAULT=${vault}`)
    await expect(shown).toContainText(`HARDSTOP_CHAIN_ID=${chainId}`)
    await expect(shown).toContainText('HARDSTOP_AGENT_KEY=0x••••••••')
    await panel.getByRole('button', { name: 'Copy' }).first().click()
    await expect(panel.getByRole('status')).toHaveText('Claude Code setup copied.')
    expect(await clipboard()).toBe(
      `claude mcp add --env HARDSTOP_AGENT_KEY=${agentKey} --env HARDSTOP_VAULT=${vault} --env HARDSTOP_CHAIN_ID=${chainId} --transport stdio --scope user hardstop -- npx -y github:vaibhav4046/hardstop`,
    )

    // The JSON setups are valid JSON with the same values.
    for (const [label, root] of [
      ['Claude Desktop', 'mcpServers'],
      ['Cursor', 'mcpServers'],
    ] as const) {
      await panel.getByRole('button', { name: label, exact: true }).click()
      await panel.getByRole('button', { name: 'Copy' }).first().click()
      const config = JSON.parse(await clipboard())
      expect(config[root].hardstop.env).toEqual({ HARDSTOP_AGENT_KEY: agentKey, HARDSTOP_VAULT: vault, HARDSTOP_CHAIN_ID: String(chainId) })
    }

    // VS Code asks for the key itself; the watcher needs none.
    await panel.getByRole('button', { name: 'VS Code', exact: true }).click()
    await panel.getByRole('button', { name: 'Copy' }).first().click()
    const vscode = await clipboard()
    expect(vscode).not.toContain(agentKey)
    expect(JSON.parse(vscode).servers.hardstop.env.HARDSTOP_VAULT).toBe(vault)
    await panel.getByRole('button', { name: 'Watch 24/7', exact: true }).click()
    await panel.getByRole('button', { name: 'Copy' }).first().click()
    const watch = await clipboard()
    expect(watch).toContain(`HARDSTOP_VAULT=${vault} HARDSTOP_CHAIN_ID=${chainId} npx -y github:vaibhav4046/hardstop --watch`)
    expect(watch).not.toContain(agentKey)

    // Asked for, the key appears, with what it is.
    await panel.locator('summary', { hasText: 'Show agent key' }).click()
    await expect(panel.getByText('never your wallet', { exact: false })).toBeVisible()
    await expect(panel.getByLabel('Agent key')).toHaveText(agentKey)

    const results = await new AxeBuilder({ page }).include('section[aria-labelledby="connect-vault-title"]').analyze()
    expect(results.violations.map((violation) => violation.id)).toEqual([])
    await shot(page, 'LIVE-02-connect-your-ai')

    // On a phone the long lines scroll inside their own boxes; the page does not.
    await page.setViewportSize({ width: 360, height: 780 })
    expect((await overflow(page)).offenders).toEqual([])
    await panel.screenshot({ path: path.join(REPO, 'qa', 'screenshots', 'LIVE-03-connect-your-ai-360.png') })
  })

  test('a link opens the vault for its owner in any browser: no agent key, the waiting raise can be cancelled', async ({ page }) => {
    // The vault was created elsewhere (another browser, or the phone that got the alert has never seen it).
    const now = BigInt(Math.floor(Date.now() / 1000))
    const network = await FakeNetwork.create(OWNER, now)
    const chain = NETWORKS.find((candidate) => candidate.chainId === FAKE_CHAIN_ID)!
    const USD = 1_000_000n
    const live = await launchVault(
      network,
      chain,
      { owner: OWNER, agent: OWNER, perPayment: 10n * USD, perWindow: 20n * USD, validUntil: now + 30n * 86_400n, windowSecs: 86_400n, coolingSecs: 86_400n, payees: [], funding: 100n * USD, now },
      () => {},
      1,
    )
    const { sim } = await attach(network, live, 1)
    await sim.propose({ perPayment: 10n * USD, perWindow: 50n * USD, validUntil: now + 30n * 86_400n, paused: false })
    expect((await sim.state()).queued).not.toBeNull()

    await connect(page, network)
    await page.goto(`/activity?chain=${FAKE_CHAIN_ID}&vault=${live.vault}`)
    await expect(page.getByText('Opened from a link, so this page holds no agent key', { exact: false })).toBeVisible()
    await expect(page.locator('section[aria-labelledby="vault-title"] .figure')).toHaveText('$100.00')
    await expect(page.getByText('Its key is not on this page, so nothing can be paid from here.')).toBeVisible()
    await expect(page.getByRole('button', { name: /^Pay / })).toHaveCount(0)
    await expect(page.locator('section[aria-labelledby="connect-vault-title"]')).toHaveCount(0)

    // The owner cancels the raise from here, with their wallet.
    await page.getByRole('button', { name: 'Cancel the change' }).first().click()
    await expect.poll(async () => (await sim.state()).queued).toBeNull()
    // Nothing about a vault opened from a link is saved: the visitor's own vault, if any, is untouched.
    expect(await page.evaluate((key) => localStorage.getItem(key), LIVE_KEY)).toBeNull()
  })

  test('a link opened with a wallet that is not the owner says so', async ({ page }) => {
    const now = BigInt(Math.floor(Date.now() / 1000))
    const network = await FakeNetwork.create(OWNER, now)
    const chain = NETWORKS.find((candidate) => candidate.chainId === FAKE_CHAIN_ID)!
    const live = await launchVault(
      network,
      chain,
      { owner: OWNER, agent: OWNER, perPayment: 10_000_000n, perWindow: 20_000_000n, validUntil: now + 86_400n * 30n, windowSecs: 86_400n, coolingSecs: 86_400n, payees: [], funding: 0n, now },
      () => {},
      1,
    )
    await connect(page, network, '0x000000000000000000000000000000000000beef')
    await page.goto(`/activity?chain=${FAKE_CHAIN_ID}&vault=${live.vault}`)
    await expect(page.getByText("The wallet connected here (0x0000…beef) is not this vault's owner", { exact: false })).toBeVisible()
  })

  test('a link that names no vault this site can open says so', async ({ page }) => {
    const network = await FakeNetwork.create(OWNER, BigInt(Math.floor(Date.now() / 1000)))
    await connect(page, network)
    await page.goto(`/activity?chain=${FAKE_CHAIN_ID}&vault=0x0000000000000000000000000000000000000bad`)
    await expect(page.getByText('There is no vault at 0x0000000000000000000000000000000000000bad', { exact: false })).toBeVisible()
    await page.goto('/activity?chain=1&vault=0x0000000000000000000000000000000000000bad')
    await expect(page.getByText('The link names a vault this site cannot open. Check the link.')).toBeVisible()
  })
})
