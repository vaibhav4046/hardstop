// "My vaults": the owner's list kept by the launcher on chain, read through
// the same wallet path the site uses, against the compiled contracts.

import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { Hex } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { LAUNCHER, launchVault } from '../src/lib/live/launch.ts'
import { MAX_LISTED, summarize, vaultsOf } from '../src/lib/live/mine.ts'
import { NETWORKS } from '../src/lib/live/wallet.ts'
import { USD } from '../src/lib/money.ts'
import type { Setup } from '../src/lib/hardstop/sim.ts'
import { FAKE_CHAIN_ID, FakeNetwork } from './fake-network.ts'

const OWNER: Hex = '0x00000000000000000000000000000000000a11ce'
const STRANGER: Hex = '0x0000000000000000000000000000000000000bad'
const PAYEE: Hex = '0x0000000000000000000000000000000000005109'
const NOW = 1_800_000_000n
const DAY = 86_400n
const NETWORK = NETWORKS.find((network) => network.chainId === FAKE_CHAIN_ID)!

const SETUP: Setup = {
  owner: OWNER,
  agent: OWNER,
  perPayment: 10n * USD,
  perWindow: 20n * USD,
  validUntil: NOW + 30n * DAY,
  windowSecs: DAY,
  coolingSecs: DAY,
  payees: [PAYEE],
  funding: 100n * USD,
  now: NOW,
}

test('before the launcher is installed on a network, an owner has no vaults there', async () => {
  const network = await FakeNetwork.create(OWNER, NOW)
  assert.deepEqual(await vaultsOf(network, OWNER), { vaults: [], total: 0n })
})

test("an owner's vaults are listed oldest first, and nobody else's list shows them", async () => {
  const network = await FakeNetwork.create(OWNER, NOW)
  const first = await launchVault(network, NETWORK, SETUP, () => {}, 1)
  const second = await launchVault(network, NETWORK, { ...SETUP, perWindow: 30n * USD }, () => {}, 1)
  const mine = await vaultsOf(network, OWNER)
  assert.equal(mine.total, 2n)
  assert.deepEqual(mine.vaults, [first.vault, second.vault])
  assert.deepEqual(await vaultsOf(network, STRANGER), { vaults: [], total: 0n })
  assert.deepEqual(await vaultsOf(network, first.vault), { vaults: [], total: 0n })
})

test('each listed vault is checked and summed up from the contract itself', async () => {
  const network = await FakeNetwork.create(OWNER, NOW)
  const live = await launchVault(network, NETWORK, SETUP, () => {}, 1)
  const summary = await summarize(network, NETWORK, live.vault)
  assert.ok(!('problem' in summary), 'problem' in summary ? summary.problem : '')
  assert.equal(summary.owner, OWNER)
  assert.equal(summary.agent, privateKeyToAccount(live.agentKey).address.toLowerCase())
  assert.equal(summary.perPayment, 10n * USD)
  assert.equal(summary.perWindow, 20n * USD)
  assert.equal(summary.paused, false)
  assert.equal(summary.changeAt, 0n)
  assert.equal(summary.balance, 100n * USD)
})

test('an address that is not a vault is shown as a problem, not as a vault', async () => {
  const network = await FakeNetwork.create(OWNER, NOW)
  await launchVault(network, NETWORK, SETUP, () => {}, 1)
  const notVault = await summarize(network, NETWORK, LAUNCHER)
  assert.ok('problem' in notVault)
  assert.match(notVault.problem, /not a HARDSTOP vault/)
  const empty = await summarize(network, NETWORK, STRANGER)
  assert.ok('problem' in empty)
  assert.match(empty.problem, /There is no vault/)
})

test('the list is capped', () => {
  assert.equal(MAX_LISTED, 50)
})
