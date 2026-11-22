// The watcher (mcp/watch.ts) against a vault on the stand-in network: the
// owner acts through the stand-in wallet, the agent pays with its own key,
// and the watcher, holding no key, reports what happened.

import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { test } from 'node:test'
import { toFunctionSelector, type Hex } from 'viem'
import { Refused, readConfig, connect } from '../mcp/vault.ts'
import { Watcher, deliverer, intervalProblem, watch, type Alert } from '../mcp/watch.ts'
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
  const { sim, watcher, live } = await setUp()
  assert.deepEqual(kinds(await watcher.check()), ['watching'])
  assert.deepEqual(await watcher.check(), [], 'nothing new, nothing said')

  await sim.propose({ perPayment: 10n * USD, perWindow: 50n * USD, validUntil: SETUP.validUntil, paused: false })
  const waiting = await watcher.check()
  assert.deepEqual(kinds(waiting), ['loosening_waiting'])
  // The link opens this vault for its owner from any browser with their wallet.
  const page = `https://hardstop-omega.vercel.app/activity?chain=${NETWORK.chainId}&vault=${live.vault}`
  assert.equal(waiting[0].owner_page, page)
  assert.ok(waiting[0].message.includes(`cancel it at ${page} before then`), waiting[0].message)
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

test('with HARDSTOP_ALERT_NTFY each alert is a phone push: plain text, a title, urgent when the owner must act, a link to act', async () => {
  const received: { headers: Record<string, unknown>; body: string }[] = []
  const server = createServer((request, response) => {
    let body = ''
    request.on('data', (chunk) => (body += chunk))
    request.on('end', () => {
      received.push({ headers: request.headers, body })
      response.end('ok')
    })
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const { port } = server.address() as { port: number }
  const deliver = deliverer({ HARDSTOP_ALERT_NTFY: `http://127.0.0.1:${port}/my-vault-alerts` }, () => {})
  const page = `https://hardstop-omega.vercel.app/activity?chain=84532&vault=${PAYEE}`
  await deliver({ kind: 'loosening_waiting', at: '2027-01-15T08:00:00.000Z', vault: PAYEE, owner_page: page, message: 'Looser rules are waiting: $50.00 per day. Cancel it before then.' })
  await deliver({ kind: 'paid', at: '2027-01-15T08:01:00.000Z', vault: PAYEE, message: 'Paid $4.00 to Cloud hosting.' })
  server.close()
  assert.equal(received.length, 2)
  assert.equal(received[0].body, 'Looser rules are waiting: $50.00 per day. Cancel it before then.')
  assert.equal(received[0].headers.title, 'HARDSTOP: loosening waiting')
  assert.equal(received[0].headers.priority, 'urgent')
  assert.equal(received[0].headers.click, page)
  assert.equal(received[1].headers.priority, 'default')
  assert.equal(received[1].headers.click, undefined)
})

test('HARDSTOP_ALERT_NTFY must be an https address, or http only to this machine', () => {
  assert.throws(() => deliverer({ HARDSTOP_ALERT_NTFY: 'http://ntfy.example.com/topic' }), /https/)
  assert.throws(() => deliverer({ HARDSTOP_ALERT_NTFY: 'not a url' }), /https/)
  deliverer({ HARDSTOP_ALERT_NTFY: 'https://ntfy.sh/some-long-secret-topic' })
  deliverer({ HARDSTOP_ALERT_NTFY: 'http://127.0.0.1:8080/topic' })
})

test('HARDSTOP_ALERT_WEBHOOK must be an https address, or http only to this machine', () => {
  assert.throws(() => deliverer({ HARDSTOP_ALERT_WEBHOOK: 'http://webhook.example.com/hook' }), /https/)
  assert.throws(() => deliverer({ HARDSTOP_ALERT_WEBHOOK: 'not a url' }), /https/)
  deliverer({ HARDSTOP_ALERT_WEBHOOK: 'https://webhook.example.com/hook' })
  deliverer({ HARDSTOP_ALERT_WEBHOOK: 'http://127.0.0.1:8080/hook' })
})

const PROPOSAL = { perPayment: 10n * USD, perWindow: 50n * USD, validUntil: SETUP.validUntil, paused: false }

test('a raise proposed and cancelled between two checks is still reported, as a sign of a stolen owner key', async () => {
  const { sim, watcher } = await setUp()
  await watcher.check()
  await sim.propose(PROPOSAL)
  await sim.cancelQueued()
  const alerts = await watcher.check()
  assert.deepEqual(kinds(alerts), ['loosening_withdrawn'])
  assert.equal(alerts[0].ended_by, 'cancelled')
  assert.equal(alerts[0].takes_effect_at, new Date(Number(NOW + DAY) * 1000).toISOString())
  assert.match(alerts[0].message, /^Looser rules were proposed and then cancelled between two checks: .*\$50\.00 per day.*treat that key as compromised/)
  assert.match(String(alerts[0].explorer), /^https:\/\/sepolia\.basescan\.org\/tx\/0x/)
  assert.deepEqual(await watcher.check(), [], 'reported once')

  // Replaced by a pause, and a recipient approved and removed again, all between two checks.
  await sim.propose({ ...PROPOSAL, perWindow: 60n * USD })
  await sim.pause()
  await sim.setRecipient(STRANGER, true)
  await sim.setRecipient(STRANGER, false)
  const more = await watcher.check()
  assert.deepEqual(kinds(more), ['recipient_approved', 'recipient_removed', 'loosening_withdrawn', 'paused'])
  assert.equal(more[2].ended_by, 'replaced')
  assert.ok(more[0].message.includes(`&who=${STRANGER.toLowerCase()} before then`), more[0].message)
})

test('a raise that took effect between two checks is reported once, as in force', async () => {
  const { sim, network, watcher } = await setUp()
  await watcher.check()
  await sim.propose(PROPOSAL)
  network.now = NOW + DAY + 1n
  const alerts = await watcher.check()
  assert.deepEqual(kinds(alerts), ['loosening_in_force'], 'and not a second "rules changed"')
  assert.equal(alerts[0].unseen, true)
  assert.match(alerts[0].message, /took effect before this watcher saw them waiting: .*\$50\.00 per day/)
  assert.deepEqual(await watcher.check(), [])
})

test('a raise still waiting is reported once, from the state, even though its event is read too', async () => {
  const { sim, watcher } = await setUp()
  await watcher.check()
  await sim.propose(PROPOSAL)
  const alerts = await watcher.check()
  assert.deepEqual(kinds(alerts), ['loosening_waiting'])
  assert.match(String(alerts[0].message), /In the 24 hours after that the agent could have moved up to/)
})

test('a raise is still reported while the vault events cannot be read, and no event is lost', async () => {
  const { network, sim, config } = await setUp()
  // A network whose event query fails while `failing` is set, as a public RPC
  // refuses a block range with too many logs in it.
  let failing = false
  const ranges: bigint[] = []
  const flaky: Wallet = {
    request: (args) => {
      if (args.method === 'eth_getLogs') {
        const [{ fromBlock, toBlock }] = args.params as { fromBlock: Hex; toBlock: Hex }[]
        ranges.push(BigInt(toBlock) - BigInt(fromBlock) + 1n)
        if (failing) return Promise.reject(new Error('query returned more than 10000 results'))
      }
      return network.request(args)
    },
  }
  const watcher = new Watcher(await connect(config, flaky))
  assert.deepEqual(kinds(await watcher.check()), ['watching'])

  await sim.pay(PAYEE, 4n * USD, 0n)
  await sim.propose(PROPOSAL)
  failing = true
  const blind = await watcher.check()
  assert.deepEqual(kinds(blind), ['loosening_waiting', 'events_unreadable'], 'the raise, from the state, despite the failing query')
  assert.deepEqual(await watcher.check(), [], 'each said once')

  failing = false
  ranges.length = 0
  const back = await watcher.check()
  assert.deepEqual(kinds(back), ['paid', 'events_readable'], 'the payment from the failed range, not lost')
  assert.ok(ranges.every((n) => n <= 250n), `smaller ranges after two failures: ${ranges}`)
  assert.deepEqual(await watcher.check(), [])
})

test('vault code with storage no launcher could have written is refused: owner equal to the agent, or zero', async () => {
  const { network, config } = await setUp()
  const owner = toFunctionSelector('owner()')
  // The vault's own code, answering `owner()` with what a hand-made deployment could have stored.
  const forged = (answer: (args: { method: string; params?: unknown[] }) => Promise<unknown>): Wallet => ({
    request: (args) => {
      const [call] = (args.params ?? []) as { data?: Hex }[]
      return args.method === 'eth_call' && call?.data === owner ? answer(args) : network.request(args)
    },
  })
  const asAgent = forged((args) => {
    const [call, block] = args.params as [{ to: Hex; data: Hex }, string]
    return network.request({ method: 'eth_call', params: [{ ...call, data: toFunctionSelector('agent()') }, block] })
  })
  const zero = forged(async () => `0x${'0'.repeat(64)}`)
  for (const wallet of [asAgent, zero]) {
    await assert.rejects(connect(config, wallet), (error: unknown) => {
      assert.ok(error instanceof Refused)
      assert.match(error.message, /owner, agent and token no HARDSTOP launcher could have set/)
      return true
    })
  }
  await connect(config, network)
})

test('checks must come at least twice per cooling period, unless explicitly run unsafe', async () => {
  assert.equal(intervalProblem(60n, 30), undefined)
  assert.match(intervalProblem(60n, 31)!, /cooling period is 1 minute.*Set HARDSTOP_WATCH_SECS to 30 or less.*HARDSTOP_WATCH_UNSAFE=1/)

  const network = await FakeNetwork.create(OWNER, NOW)
  const live = await launchVault(network, NETWORK, { ...SETUP, coolingSecs: 60n }, () => {}, 1)
  const config = readConfig({ HARDSTOP_VAULT: live.vault })
  const seen: Alert[] = []
  const deliver = async (alert: Alert) => void seen.push(alert)
  await assert.rejects(watch(config, { everySecs: 31, signal: new AbortController().signal, wallet: network, deliver }), (error: unknown) => {
    assert.ok(error instanceof Refused)
    assert.match(error.message, /Set HARDSTOP_WATCH_SECS to 30 or less/)
    return true
  })
  assert.deepEqual(seen, [], 'nothing was watched')

  const running: Alert[] = []
  const controller = new AbortController()
  await watch(config, {
    everySecs: 31,
    unsafeInterval: true,
    signal: controller.signal,
    wallet: network,
    deliver: async (alert) => {
      running.push(alert)
      controller.abort()
    },
  })
  assert.deepEqual(kinds(running), ['watching'])
})

test('the watcher stops, instead of retrying, at an address that is not a HARDSTOP vault', async () => {
  const network = await FakeNetwork.create(OWNER, NOW)
  const live = await launchVault(network, NETWORK, SETUP, () => {}, 1)
  const seen: Alert[] = []
  await assert.rejects(
    watch(readConfig({ HARDSTOP_VAULT: live.token }), { everySecs: 1, signal: new AbortController().signal, wallet: network, deliver: async (a) => void seen.push(a) }),
    /is not a HARDSTOP vault/,
  )
  assert.deepEqual(seen, [])
})

test('a restarted watcher reports what happened while no watcher was running, marked as catch-up', async () => {
  const { network, sim, config, watcher } = await setUp()
  await watcher.check()
  // The watcher stops; the owner's key approves a stranger and withdraws meanwhile.
  await sim.setRecipient(STRANGER, true)
  await sim.withdraw(5n * USD)
  const restarted = new Watcher(await connect(config, network))
  const alerts = await restarted.check()
  assert.deepEqual(kinds(alerts), ['watching', 'recipient_approved', 'withdrawn'])
  assert.equal(alerts[1].who, STRANGER)
  assert.equal(alerts[1].catch_up, true)
  assert.equal(alerts[2].catch_up, true)
  assert.deepEqual(await restarted.check(), [], 'reported once')
})

test('with HARDSTOP_WATCH_CURSOR a restart resumes where the last run stopped, further back than one cooling period', async () => {
  const { mkdtemp, readFile } = await import('node:fs/promises')
  const { join } = await import('node:path')
  const { tmpdir } = await import('node:os')
  // A one-minute cooling period: a restart without the cursor looks back only 61 blocks here.
  const network = await FakeNetwork.create(OWNER, NOW)
  const live = await launchVault(network, NETWORK, { ...SETUP, coolingSecs: 60n }, () => {}, 1)
  const { sim } = await attach(network, live, 1)
  const config = readConfig({ HARDSTOP_VAULT: live.vault })
  const cursorFile = join(await mkdtemp(join(tmpdir(), 'hardstop-watch-')), 'cursor')
  // One check through the loop and stop: delivering an alert aborts, and the check's alerts are all delivered first.
  const once = async () => {
    const controller = new AbortController()
    const seen: Alert[] = []
    await watch(config, {
      everySecs: 1,
      signal: controller.signal,
      wallet: network,
      cursorFile,
      deliver: async (alert) => {
        seen.push(alert)
        controller.abort()
      },
    })
    return seen
  }
  await once()
  const saved = BigInt((await readFile(cursorFile, 'utf8')).trim())
  assert.equal(saved, BigInt((await network.request({ method: 'eth_blockNumber' })) as Hex) + 1n)

  // While no watcher runs: a stranger is approved, then 70 more blocks go by.
  await sim.setRecipient(STRANGER, true)
  for (let i = 0; i < 70; i++) await network.request({ method: 'eth_sendTransaction', params: [{ from: OWNER, to: PAYEE, data: '0x' }] })

  assert.deepEqual(kinds(await once()), ['watching', 'recipient_approved'])
  // Without the cursor the same restart finds nothing: the approval is older than the lookback.
  const blind = new Watcher(await connect(config, network))
  assert.deepEqual(kinds(await blind.check()), ['watching'])
})

/** The stand-in network, seen as if the chain were `ahead` blocks further on, with event queries that can be made to fail. */
async function farBehind(coolingSecs = 3600n) {
  const network = await FakeNetwork.create(OWNER, NOW)
  const live = await launchVault(network, NETWORK, { ...SETUP, coolingSecs }, () => {}, 1)
  const { sim } = await attach(network, live, 1)
  const state = { ahead: 0n, failNext: 0, ranges: [] as bigint[] }
  const wallet: Wallet = {
    request: async (args) => {
      if (args.method === 'eth_blockNumber') return `0x${(BigInt((await network.request(args)) as string) + state.ahead).toString(16)}`
      if (args.method === 'eth_getLogs') {
        const [{ fromBlock, toBlock }] = args.params as { fromBlock: Hex; toBlock: Hex }[]
        state.ranges.push(BigInt(toBlock) - BigInt(fromBlock) + 1n)
        if (state.failNext > 0) {
          state.failNext--
          throw new Error('query returned more than 10000 results')
        }
      }
      return network.request(args)
    },
  }
  const config = readConfig({ HARDSTOP_VAULT: live.vault })
  return { sim, state, vault: await connect(config, wallet) }
}

test('a watcher far behind still reports a waiting raise at its first check, and catches up a bounded amount per check', async () => {
  const { sim, state, vault } = await farBehind()
  state.ahead = 300_000n // about a week of Base Sepolia blocks
  await sim.propose(PROPOSAL)
  const watcher = new Watcher(vault, 3n * DAY, 1n) // a saved cursor from a week ago
  const alerts = await watcher.check()
  assert.ok(kinds(alerts).includes('loosening_waiting'), 'the raise is reported at once')
  assert.ok(state.ranges.length <= 8, `one check read ${state.ranges.length} ranges`)
  const before = watcher.cursor!
  await watcher.check()
  assert.ok(watcher.cursor! > before, 'the next check carries on from where this one stopped')
})

test('after the network refuses a few ranges, the range grows back to 1,000 blocks', async () => {
  const { state, vault } = await farBehind()
  const watcher = new Watcher(vault)
  await watcher.check()
  for (let i = 1; i <= 9; i++) {
    state.ahead = BigInt(i)
    state.failNext = 1
    await watcher.check()
  }
  state.ahead = 20_000n
  state.ranges.length = 0
  for (let i = 0; i < 6; i++) await watcher.check()
  assert.ok(state.ranges.some((n) => n === 1_000n), `ranges after recovery: ${state.ranges.slice(0, 12).join(',')}`)
})
