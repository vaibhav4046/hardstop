// "My vaults": the owner's list kept by the launcher on chain, read through
// the same wallet path the site uses, against the compiled contracts.

import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { Hex } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { LAUNCHER, launchVault } from '../src/lib/live/launch.ts'
import { decodeName, encodeName, MAX_LISTED, nameOf, setNameData, summarize, vaultsOf } from '../src/lib/live/mine.ts'
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

test('names: up to 32 bytes of UTF-8 round-trip through one word; longer or control characters are refused in words', () => {
  for (const text of ['Research agent', 'Café ☕ agent', 'x'.repeat(32), '']) {
    const word = encodeName(text)
    assert.equal(typeof word, 'bigint', String(word))
    assert.equal(decodeName(word as bigint), text)
  }
  assert.match(String(encodeName('x'.repeat(33))), /at most 32 bytes; this one is 33/)
  assert.match(String(encodeName('a\u0007b')), /control characters/)
  assert.match(String(encodeName('Vault\u202e')), /control/)
  assert.match(String(encodeName('Vault\u200b')), /control/)
  assert.match(String(encodeName('Vault\u0085')), /control/)
  // Whatever someone stores, what comes back is plain text with no control or hidden characters.
  assert.equal(decodeName((1n << 256n) - 1n).includes('\u0000'), false)
  const wordOf = (text: string) => {
    const raw = Buffer.from(text, 'utf8')
    let word = 0n
    for (const byte of raw) word = (word << 8n) | BigInt(byte)
    return word << BigInt(8 * (32 - raw.length))
  }
  assert.equal(decodeName(wordOf('Vault\u202e')), 'Vault')
  assert.equal(decodeName(wordOf('Vault\u200b')), 'Vault')
  assert.equal(decodeName(wordOf('Vault\u0085')), 'Vault')
})

test("an owner names their vault through the launcher; another owner's name for it is their own", async () => {
  const network = await FakeNetwork.create(OWNER, NOW)
  const live = await launchVault(network, NETWORK, SETUP, () => {}, 1)
  assert.equal(await nameOf(network, OWNER, live.vault), '')
  const word = encodeName('Research agent') as bigint
  await network.request({ method: 'eth_sendTransaction', params: [{ from: OWNER, to: LAUNCHER, data: setNameData(live.vault, word) }] })
  assert.equal(await nameOf(network, OWNER, live.vault), 'Research agent')
  assert.equal(await nameOf(network, STRANGER, live.vault), '')
})
