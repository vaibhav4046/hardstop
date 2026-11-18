// The real-network code path, driven end to end against a stand-in wallet
// (tests/fake-network.ts) that runs the compiled Fe contracts. What is under
// test is src/lib/live: installing the Launcher, launching a vault in one
// transaction, and then using it as its owner and as its agent.

import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { Hex } from 'viem'
import { DEPLOYER, LAUNCHER, attach, launchVault, type Step } from '../src/lib/live/launch.ts'
import { NETWORKS } from '../src/lib/live/wallet.ts'
import { USD } from '../src/lib/money.ts'
import { AGENT_RAISE, apply, snapshot, type Session } from '../src/lib/session.ts'
import type { Setup } from '../src/lib/hardstop/sim.ts'
import { FAKE_CHAIN_ID, FakeNetwork } from './fake-network.ts'

const OWNER: Hex = '0x00000000000000000000000000000000000a11ce'
const PAYEE: Hex = '0x0000000000000000000000000000000000005109'
const STRANGER: Hex = '0x0000000000000000000000000000000000000bad'
const NOW = 1_800_000_000n
const DAY = 86_400n
const NETWORK = NETWORKS.find((network) => network.chainId === FAKE_CHAIN_ID)!
const FAST = 1 // ms between checks for a receipt

const SETUP: Setup = {
  owner: OWNER,
  agent: OWNER, // ignored on a real network: the wallet's account is the owner, and a fresh key is the agent
  perPayment: 10n * USD,
  perWindow: 20n * USD,
  validUntil: NOW + 30n * DAY,
  windowSecs: DAY,
  coolingSecs: DAY,
  payees: [PAYEE],
  funding: 100n * USD,
  now: NOW,
}

const SESSION: Session = {
  setup: {
    perPayment: SETUP.perPayment.toString(),
    perDay: SETUP.perWindow.toString(),
    validUntil: SETUP.validUntil.toString(),
    coolingSecs: SETUP.coolingSecs.toString(),
    funding: SETUP.funding.toString(),
    now: NOW.toString(),
    recipients: [{ name: 'Cloud hosting', address: PAYEE }],
  },
  actions: [],
}

async function launched() {
  const network = await FakeNetwork.create(OWNER, NOW)
  const steps: Step[] = []
  const live = await launchVault(network, NETWORK, SETUP, (step) => steps.push(step), FAST)
  const { sim, chain } = await attach(network, live, FAST)
  return { network, live, sim, chain, steps }
}

test('the first launch on a network installs the Launcher, then creates the vault; later launches need one approval', async () => {
  const { network, live, steps } = await launched()
  assert.deepEqual(steps, ['wallet', 'network', 'installing', 'launching', 'confirming'])
  assert.equal(network.approved.length, 2)
  assert.equal(network.approved[0].to, DEPLOYER)
  assert.equal(network.approved[1].to, LAUNCHER)
  assert.equal(BigInt(network.approved[1].value!), NETWORK.gasMoney)
  assert.equal(live.owner, OWNER)

  const steps2: Step[] = []
  const second = await launchVault(network, NETWORK, SETUP, (step) => steps2.push(step), FAST)
  assert.deepEqual(steps2, ['wallet', 'network', 'launching', 'confirming'])
  assert.equal(network.approved.length, 3)
  assert.notEqual(second.vault, live.vault)
  assert.notEqual(second.agentKey, live.agentKey)
  assert.equal(second.token, live.token, 'one test token per Launcher')
})

test('the launched vault belongs to the wallet, holds the deposit, and the agent has gas money', async () => {
  const { sim, chain, live } = await launched()
  const view = await snapshot(sim, SESSION)
  assert.equal(view.vault, live.vault)
  assert.equal(view.state.vaultBalance, 100n * USD)
  assert.equal(view.state.policy.perPayment, 10n * USD)
  assert.equal(view.state.policy.perWindow, 20n * USD)
  assert.equal(view.state.schedule.coolingSecs, DAY)
  assert.equal(view.state.now, NOW)
  assert.equal(view.leftToday, 20n * USD)
  assert.equal(view.recipients.length, 1)
  assert.equal(await chain.agentGas(), NETWORK.gasMoney)
})

test('the agent pays with its own key: allowed inside the limits, refused outside, each as a transaction', async () => {
  const { network, sim, chain } = await launched()
  const asked = network.approved.length

  const paid = await apply(sim, { type: 'pay', to: PAYEE, amount: (4n * USD).toString(), nonce: '0' }, 0)
  assert.equal(paid.kind, 'payment')
  if (paid.kind !== 'payment') return
  assert.equal(paid.outcome.ok, true)
  assert.equal(paid.outcome.code, 0)
  assert.match(paid.outcome.tx ?? '', /^0x[0-9a-f]{64}$/)
  assert.equal(paid.leftToday, 16n * USD)
  assert.equal(await sim.balanceOf(PAYEE), 4n * USD)

  const over = await apply(sim, { type: 'pay', to: PAYEE, amount: (80n * USD).toString(), nonce: '1' }, 1)
  if (over.kind !== 'payment') return assert.fail('expected a payment')
  assert.equal(over.outcome.code, 10, 'over the limit for one payment')
  assert.equal(over.outcome.detail, 10n * USD)
  assert.match(over.outcome.tx ?? '', /^0x/, 'a refusal is recorded on the network too')
  assert.equal(await sim.balanceOf(PAYEE), 4n * USD)

  // A refused request does not use up its number, so the next one carries the same number.
  const stranger = await apply(sim, { type: 'pay', to: STRANGER, amount: (4n * USD).toString(), nonce: '1' }, 2)
  if (stranger.kind !== 'payment') return assert.fail('expected a payment')
  assert.equal(stranger.outcome.code, 9, 'recipient not approved')

  assert.equal(network.approved.length, asked, 'the owner was never asked to approve an agent request')
  assert.deepEqual(
    network.relayed.map((tx) => tx.from),
    [chain.agent, chain.agent, chain.agent],
  )
})

test('the agent cannot raise its own limit: the contract refuses, and no transaction is spent on it', async () => {
  const { network, sim } = await launched()
  const raise = await apply(sim, { type: 'agentRaise' }, 0)
  if (raise.kind !== 'agentRaise') return assert.fail('expected a raise attempt')
  assert.equal(raise.outcome.ok, false)
  assert.equal(raise.outcome.revert, 'NotOwner')
  assert.equal(raise.outcome.tx, undefined)
  assert.equal(network.relayed.length, 0)
  assert.equal((await sim.state()).policy.perWindow, 20n * USD)
  assert.ok(AGENT_RAISE > 20n * USD)
})

test('the owner acts through the wallet: a raise waits, a pause is immediate', async () => {
  const { network, sim } = await launched()
  const asked = network.approved.length

  const raise = await apply(
    sim,
    { type: 'propose', perPayment: (10n * USD).toString(), perDay: (50n * USD).toString(), validUntil: SETUP.validUntil.toString(), paused: false },
    0,
  )
  if (raise.kind !== 'owner') return assert.fail('expected an owner action')
  assert.equal(raise.outcome.ok, true)
  assert.match(raise.outcome.tx ?? '', /^0x/)
  const waiting = await sim.state()
  assert.equal(waiting.policy.perWindow, 20n * USD, 'the limit in force has not moved')
  assert.equal(waiting.queued?.perWindow, 50n * USD)
  assert.equal(waiting.queued?.effectiveAt, NOW + DAY)

  await apply(sim, { type: 'pause' }, 1)
  const blocked = await apply(sim, { type: 'pay', to: PAYEE, amount: (4n * USD).toString(), nonce: '0' }, 2)
  if (blocked.kind !== 'payment') return assert.fail('expected a payment')
  assert.equal(blocked.outcome.code, 2, 'paused')
  assert.equal(network.approved.length, asked + 2)
})

test('when the person closes the wallet instead of approving, nothing is recorded as done', async () => {
  const { network, sim } = await launched()
  network.refuseNext = true
  await assert.rejects(apply(sim, { type: 'pause' }, 0), { code: 4001 })
  assert.equal((await sim.state()).policy.paused, false)
})

test('the vault is found again from what was saved, and time follows the network', async () => {
  const { network, live } = await launched()
  network.now = NOW + DAY + 5n
  const { sim } = await attach(network, live, FAST)
  const view = await snapshot(sim, SESSION)
  assert.equal(view.state.now, NOW + DAY + 5n)
  assert.equal(view.state.vaultBalance, 100n * USD)
  assert.throws(() => sim.chain.advance(60n), /cannot be moved/)
})

test('a network without the deployment proxy is turned away before anything is signed', async () => {
  const network = await FakeNetwork.create(OWNER, NOW, false)
  await assert.rejects(launchVault(network, NETWORK, SETUP, () => {}, FAST), /does not have the deployment proxy/)
  assert.equal(network.approved.length, 0)
})
