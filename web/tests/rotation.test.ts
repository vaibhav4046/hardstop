// Replacing the agent's key. The vault fixes its agent at creation, so a key
// that leaked is retired by retiring its vault: pause it, withdraw, and launch
// a new vault with a new key. Run here on the compiled Fe contracts, through
// the same launch path the site uses.

import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { Hex } from 'viem'
import { attach, launchVault } from '../src/lib/live/launch.ts'
import { NETWORKS } from '../src/lib/live/wallet.ts'
import { USD } from '../src/lib/money.ts'
import { FAKE_CHAIN_ID, FakeNetwork } from './fake-network.ts'

const OWNER: Hex = '0x00000000000000000000000000000000000a11ce'
const SHOP: Hex = '0x0000000000000000000000000000000000005109'
const DAY = 86_400n
const NOW = 1_800_000_000n

const setup = {
  owner: OWNER,
  agent: OWNER, // replaced by a fresh key at launch
  perPayment: 10n * USD,
  perWindow: 20n * USD,
  validUntil: NOW + 30n * DAY,
  windowSecs: DAY,
  coolingSecs: DAY,
  payees: [SHOP],
  funding: 100n * USD,
  now: NOW,
}

test('a leaked agent key is retired in three owner steps, and the new key works at once', async () => {
  const network = await FakeNetwork.create(OWNER, NOW)
  const fake = NETWORKS.find((n) => n.chainId === FAKE_CHAIN_ID)!
  const first = await launchVault(network, fake, setup, () => {}, 1)
  const old = await attach(network, first, 1)
  assert.equal((await old.sim.pay(SHOP, 3n * USD, 0n)).code, 0)

  // 1. Pause: instant, so the leaked key can pay nothing from here on.
  assert.equal((await old.sim.pause()).ok, true)
  const afterPause = await old.sim.pay(SHOP, 1n * USD, 1n)
  assert.equal(afterPause.code, 2, 'refused: paused')
  // 2. Withdraw everything that is left to the owner.
  assert.equal((await old.sim.withdraw(97n * USD)).ok, true)
  assert.equal((await old.sim.state()).vaultBalance, 0n)
  assert.equal(await old.sim.balanceOf(OWNER), 97n * USD)

  // 3. Launch a new vault: a new agent key, the same rules, fresh funding.
  const second = await launchVault(network, fake, setup, () => {}, 1)
  assert.notEqual(second.agentKey, first.agentKey)
  assert.notEqual(second.vault, first.vault)
  const fresh = await attach(network, second, 1)
  assert.notEqual(fresh.sim.agent, old.sim.agent)

  // The old key cannot spend from the new vault: it is not its agent.
  const stolen = await fresh.sim.pay(SHOP, 1n * USD, 0n, old.sim.agent)
  assert.equal(stolen.ok, false)
  assert.equal(stolen.revert, 'NotAgent')
  // The new key can, within the same limits, with no cooling period to wait.
  assert.equal((await fresh.sim.pay(SHOP, 3n * USD, 0n)).code, 0)
  assert.equal((await fresh.sim.pay(SHOP, 50n * USD, 1n)).code, 10, 'refused: over the per-payment limit')
  assert.equal(await fresh.sim.balanceOf(SHOP), 6n * USD)
})
