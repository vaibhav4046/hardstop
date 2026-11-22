// A vault's history read back from the chain: the index only names
// transactions, every event comes from its receipt. Against the compiled
// contracts on the in-memory network, with an index that tells the truth and
// one that lies.

import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { Hex } from 'viem'
import { attach, launchVault } from '../src/lib/live/launch.ts'
import { vaultHistory, MAX_HISTORY } from '../src/lib/live/history.ts'
import { NETWORKS } from '../src/lib/live/wallet.ts'
import { USD } from '../src/lib/money.ts'
import type { Setup } from '../src/lib/hardstop/sim.ts'
import { FAKE_CHAIN_ID, FakeNetwork } from './fake-network.ts'

const OWNER: Hex = '0x00000000000000000000000000000000000a11ce'
const PAYEE: Hex = '0x0000000000000000000000000000000000005109'
const NOW = 1_800_000_000n
const DAY = 86_400n
const NETWORK = { ...NETWORKS.find((network) => network.chainId === FAKE_CHAIN_ID)!, indexer: 'https://index.test/api' }

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

/** An index that answers from the network's own logs, plus whatever `extra` hashes it is told to add. */
function index(network: FakeNetwork, vault: Hex, extra: string[] = []) {
  const asked: string[] = []
  const get = async (url: string) => {
    asked.push(url)
    const logs = (await network.request({ method: 'eth_getLogs', params: [{ address: vault, fromBlock: '0x0' }] })) as { transactionHash: string }[]
    const rows = [...logs.map((log) => ({ transactionHash: log.transactionHash })), ...extra.map((transactionHash) => ({ transactionHash }))]
    return { ok: true, json: async () => ({ message: 'OK', result: rows }) }
  }
  return { get, asked }
}

async function busyVault() {
  const network = await FakeNetwork.create(OWNER, NOW)
  const live = await launchVault(network, NETWORK, SETUP, () => {}, 1)
  const { sim } = await attach(network, live, 1)
  await sim.pay(PAYEE, 4n * USD, 0n)
  await sim.pay(PAYEE, 80n * USD, 1n)
  await sim.propose({ perPayment: 10n * USD, perWindow: 40n * USD, validUntil: NOW + 30n * DAY, paused: false })
  await sim.cancelQueued()
  return { network, live }
}

test("a vault's history comes back newest first, each event read from its receipt", async () => {
  const { network, live } = await busyVault()
  const { get, asked } = index(network, live.vault)
  const events = await vaultHistory(network, NETWORK, live.vault, get)
  assert.deepEqual(
    events.map((event) => event.kind),
    ['cancelled', 'proposed', 'blocked', 'paid'],
  )
  const paid = events.find((event) => event.kind === 'paid')
  assert.ok(paid && paid.kind === 'paid')
  assert.equal(paid.amount, 4n * USD)
  assert.equal(paid.to, PAYEE)
  assert.equal(paid.leftInWindow, 16n * USD)
  const blocked = events.find((event) => event.kind === 'blocked')
  assert.ok(blocked && blocked.kind === 'blocked')
  assert.equal(blocked.amount, 80n * USD)
  assert.equal(blocked.code, 10)
  // The index was asked about this vault only.
  assert.equal(asked.length, 1)
  assert.match(asked[0], new RegExp(`address=${live.vault}`))
})

test('an index that lies cannot add events: unknown, foreign and malformed hashes are dropped', async () => {
  const { network, live } = await busyVault()
  const truthful = await vaultHistory(network, NETWORK, live.vault, index(network, live.vault).get)
  // A real transaction that is not the vault's (the launch, logged by the launcher and the token),
  // a hash that does not exist, and junk.
  const foreign = live.launchedIn
  const lying = index(network, live.vault, [foreign, `0x${'ab'.repeat(32)}`, 'not a hash', '0x1234'])
  const events = await vaultHistory(network, NETWORK, live.vault, lying.get)
  assert.deepEqual(events, truthful)
})

test('a network with no index says so, and the list is capped', async () => {
  const network = await FakeNetwork.create(OWNER, NOW)
  await assert.rejects(vaultHistory(network, { ...NETWORK, indexer: undefined }, OWNER), /No block explorer/)
  assert.equal(MAX_HISTORY, 25)
})

test('malformed or error answers from the block explorer fail loudly, empty lists succeed, and reverted transactions are dropped', async () => {
  const { network, live } = await busyVault()
  const badAnswers = [
    async () => ({ ok: true, json: async () => { throw new SyntaxError('Unexpected token <') } }),
    async () => ({ ok: true, json: async () => null }),
    async () => ({ ok: true, json: async () => ({ status: '0', message: 'NOTOK', result: 'Max rate limit reached' }) }),
  ]
  for (const get of badAnswers) {
    await assert.rejects(vaultHistory(network, NETWORK, live.vault, get), /block explorer did not answer/)
  }

  const empty = async () => ({ ok: true, json: async () => ({ status: '0', message: 'No logs found', result: [] }) })
  assert.deepEqual(await vaultHistory(network, NETWORK, live.vault, empty), [])

  const truthful = await vaultHistory(network, NETWORK, live.vault, index(network, live.vault).get)
  const revertedHash = (`0x${'cd'.repeat(32)}`) as Hex
  const firstReceipt = (await network.request({ method: 'eth_getTransactionReceipt', params: [truthful[0].tx] })) as {
    status: Hex
    blockNumber: Hex
    logs: { address: string; topics: Hex[]; data: Hex }[]
  }
  const withRevertedReceipt = {
    request: async (req: { method: string; params?: unknown[] }) => {
      if (req.method === 'eth_getTransactionReceipt' && req.params?.[0] === revertedHash) {
        return { ...firstReceipt, status: '0x0' as Hex }
      }
      return network.request(req)
    },
  }
  const withReverted = index(network, live.vault, [revertedHash])
  assert.deepEqual(await vaultHistory(withRevertedReceipt, NETWORK, live.vault, withReverted.get), truthful)
})
