// The watcher (mcp/watch.ts) against a vault on the stand-in network: the
// owner acts through the stand-in wallet, the agent pays with its own key,
// and the watcher, holding no key, reports what happened.

import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { test } from 'node:test'
import type { Hex } from 'viem'
import { readConfig, connect } from '../mcp/vault.ts'
import { Watcher, deliverer, watch, type Alert } from '../mcp/watch.ts'
import { attach, launchVault } from '../src/lib/live/launch.ts'
import { NETWORKS, type Wallet } from '../src/lib/live/wallet.ts'
import { USD } from '../src/lib/money.ts'
import type { Setup } from '../src/lib/hardstop/sim.ts'
import { FAKE_CHAIN_ID, FakeNetwork } from './fake-network.ts'

const OWNER: Hex = '0x00000000000000000000000000000000000a11ce'
const PAYEE: Hex = '0x0000000000000000000000000000000000005109'
const STRANGER: Hex = '0x0000000000000000000000000000000000000bad'
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

async function setUp() {
  const network = await FakeNetwork.create(OWNER, NOW)
  const live = await launchVault(network, NETWORK, SETUP, () => {}, 1)
  // Holds the owner's wallet and the agent's key: it plays both people. The watcher gets neither.
  const { sim } = await attach(network, live, 1)
  const config = readConfig({ HARDSTOP_VAULT: live.vault, HARDSTOP_RECIPIENTS: `Cloud hosting=${PAYEE}` })
  const watcher = new Watcher(await connect(config, network))
  return { network, live, sim, config, watcher }
}

const kinds = (alerts: Alert[]) => alerts.map((alert) => alert.kind)

test('the watcher reports a loosening the owner proposed, a payment and a refusal, each once', async () => {
  const { sim, watcher } = await setUp()
  assert.deepEqual(kinds(await watcher.check()), ['watching'])
  assert.deepEqual(await watcher.check(), [], 'nothing new, nothing said')

  await sim.propose({ perPayment: 10n * USD, perWindow: 50n * USD, validUntil: SETUP.validUntil, paused: false })
  const waiting = await watcher.check()
  assert.deepEqual(kinds(waiting), ['loosening_waiting'])
  assert.equal(waiting[0].takes_effect_at, new Date(Number(NOW + DAY) * 1000).toISOString())
  assert.deepEqual(waiting[0].proposed, {
    per_payment_usd: '10.00',
    per_day_usd: '50.00',
    valid_until: new Date(Number(SETUP.validUntil) * 1000).toISOString(),
    paused: false,
  })
  assert.match(waiting[0].message, /\$50\.00 per day.*cancel it at https:\/\/hardstop-omega\.vercel\.app\/activity/)

  const paid = await sim.pay(PAYEE, 4n * USD, 0n)
  assert.equal(paid.code, 0)
  await sim.pay(STRANGER, 3n * USD, 1n)
  const spent = await watcher.check()
  assert.deepEqual(kinds(spent), ['paid', 'refused'])
  assert.match(spent[0].message, /^Paid \$4\.00 to Cloud hosting \(request 0\)\. \$16\.00 left today\.$/)
  assert.equal(spent[0].transaction, paid.tx)
  assert.match(String(spent[0].explorer), /^https:\/\/sepolia\.basescan\.org\/tx\/0x/)
  assert.equal(spent[1].reason, 'RecipientNotApproved')
  assert.equal(spent[1].to, STRANGER)
  assert.deepEqual(await watcher.check(), [])
})

test('the watcher sees a waiting change take effect, a pause, and the end date coming and going', async () => {
  const { sim, network, watcher } = await setUp()
  await watcher.check()
  await sim.propose({ perPayment: 10n * USD, perWindow: 50n * USD, validUntil: SETUP.validUntil, paused: false })
  await watcher.check()

  network.now = NOW + DAY + 1n
  assert.deepEqual(kinds(await watcher.check()), ['loosening_in_force'])

  await sim.pause()
  assert.deepEqual(kinds(await watcher.check()), ['paused'])

  network.now = SETUP.validUntil - DAY
  assert.deepEqual(kinds(await watcher.check()), ['ending_soon'])
  assert.deepEqual(await watcher.check(), [], 'warned once')
  network.now = SETUP.validUntil + 1n
  assert.deepEqual(kinds(await watcher.check()), ['expired'])
  assert.deepEqual(await watcher.check(), [])
})

test('the loop survives network errors, says so once, recovers, and stops when told', async () => {
  const network = await FakeNetwork.create(OWNER, NOW)
  const live = await launchVault(network, NETWORK, SETUP, () => {}, 1)
  let failuresLeft = 3
  const flaky: Wallet = {
    request: async (args) => {
      if (failuresLeft > 0) {
        failuresLeft -= 1
        throw new Error('connection reset')
      }
      return network.request(args)
    },
  }
  const controller = new AbortController()
  const seen: Alert[] = []
  const config = readConfig({ HARDSTOP_VAULT: live.vault })
  await watch(config, {
    everySecs: 0.001,
    signal: controller.signal,
    wallet: flaky,
    deliver: async (alert) => {
      seen.push(alert)
      if (alert.kind === 'watch_recovered') controller.abort()
    },
  })
  assert.deepEqual(kinds(seen), ['watch_error', 'watching', 'watch_recovered'])
  assert.match(seen[0].message, /^The watcher cannot read the vault: connection reset It keeps trying\.$/)
})

test('alerts go to stdout as one JSON line each and to the webhook', async () => {
  const received: unknown[] = []
  const server = createServer((request, response) => {
    let body = ''
    request.on('data', (chunk) => (body += chunk))
    request.on('end', () => {
      received.push(JSON.parse(body))
      response.end('ok')
    })
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const { port } = server.address() as { port: number }
  const lines: string[] = []
  const deliver = deliverer({ HARDSTOP_ALERT_WEBHOOK: `http://127.0.0.1:${port}/hook` }, (line) => lines.push(line))
  const alert: Alert = { kind: 'paused', at: '2027-01-15T08:00:00.000Z', vault: PAYEE, message: 'The agent is paused.' }
  await deliver(alert)
  server.close()
  assert.deepEqual(lines, [`${JSON.stringify(alert)}\n`])
  assert.deepEqual(received, [alert])
})
